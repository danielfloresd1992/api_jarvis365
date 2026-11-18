import http from 'node:http';
import https from 'node:https';
import {
    BiometricError, parseDigestChallenge, digestAuthorization, parseDeviceInfo, parseDeviceTime,
    clockReport, timeSyncXml, offsetMinutesOfIso, formatOffset, BUSINESS_OFFSET_MINUTES,
    normalizeAcsEvent, normalizeDeviceUser, userSearchBody, eventSearchBody, dayCondition, searchIdOf, deviceErrorDetail,
} from './biometric.lib.js';
import {
    userRecordBody, userSearchByNoBody, captureFingerprintXml, parseCapturedFingerprint, fingerprintSetUpBody,
    fingerprintSearchBody, fingerprintPage, fingerprintSaveResult, captureFailureMessage, FINGER_SLOTS,
} from './biometricEnroll.lib.js';

// ══════════════════════════════════════════════════════════════════════
// TERMINALES BIOMÉTRICOS — conversación con el equipo
// ══════════════════════════════════════════════════════════════════════
// Cada terminal habla ISAPI por HTTP o HTTPS y exige Digest. Este archivo es lo
// único que toca la red; las reglas viven en biometric.lib.js y en los .lib de
// cada parte.
//
// Toda función recibe primero `device`, a qué terminal hablarle:
//   { protocol: 'http' | 'https', hostname, port, username, password }
// Lo arma biometricTerminal.service.js (resolveTerminal), con los terminales
// guardados en la base o, para el principal, con el .env.



const TIMEOUT_MS = 8000;

// Captura de huella. El terminal enciende el lector ~10 s y, si nadie pone el
// dedo, responde «deviceError» (comprobado el 2026-11-17: tres intentos sin dedo,
// ~12 s cada uno). Se vuelve a encender hasta completar CAPTURE_WINDOW_MS, para
// que haya tiempo de acercarse; un error que llega antes de DEVICE_WAIT_MS no es
// «nadie puso el dedo» sino un fallo de verdad. Si se lo vuelve a encender en el
// acto responde «deviceBusy»: necesita CAPTURE_PAUSE_MS de respiro entre intentos.
const CAPTURE_TIMEOUT_MS = 60_000;
const CAPTURE_WINDOW_MS = 40_000;
const DEVICE_WAIT_MS = 8_000;
const CAPTURE_PAUSE_MS = 1_500;

// Tope de páginas por búsqueda. El terminal da 10 registros por página (aunque
// se le pidan 30): 200 registros.
const MAX_PAGES = 20;

// Cada búsqueda lleva su searchID, y el terminal sigue la búsqueda por él. Dos
// creados en el mismo milisegundo serían iguales y el terminal mezclaría sus
// resultados (comprobado el 2026-11-18 leyendo huellas de varias personas a la
// vez): este los hace únicos en el proceso, con el mismo largo que searchIdOf.
let lastSearchMs = 0;
const nextSearchId = (tag) => {
    lastSearchMs = Math.max(Date.now(), lastSearchMs + 1);
    return searchIdOf(tag, new Date(lastSearchMs));
};

// Los terminales traen un certificado propio (autofirmado). Por HTTPS el tráfico
// va cifrado, pero no se puede verificar quién responde: por eso, además, el
// puerto del terminal debería abrirse solo para la IP de la API.
const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });



// send = «una petición al terminal», con la respuesta entera en texto
function send(device, { method, path, headers, body, timeoutMs = TIMEOUT_MS }) {
    const { protocol, hostname, port } = device;
    const transport = protocol === 'https' ? https : http;
    return new Promise((resolve, reject) => {
        const options = { hostname, port, method, path, headers, timeout: timeoutMs };
        if (protocol === 'https') options.agent = httpsAgent;
        const req = transport.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
            res.on('error', reject);
        });
        req.on('timeout', () => {
            const error = new BiometricError('unreachable', `El terminal (${hostname}) no respondió en ${timeoutMs / 1000} segundos.`);
            error.timedOut = true;
            req.destroy(error);
        });
        req.on('error', (error) => reject(error instanceof BiometricError
            ? error
            : new BiometricError('unreachable', `No se pudo conectar con el terminal (${hostname}): ${error.code || error.message}.`)));
        if (body !== undefined) req.write(body);
        req.end();
    });
}



// isapi = «una llamada ISAPI autenticada»: primero sin credenciales para recibir
// el reto Digest, y luego respondiéndolo. Si el terminal la rechaza, el error
// lleva en `detail` su motivo (subStatusCode), para poder traducirlo.
async function isapi(device, method, path, { json, xml, timeoutMs } = {}) {
    const body = json !== undefined ? JSON.stringify(json) : xml;
    const headers = {};
    if (body !== undefined) {
        headers['content-type'] = json !== undefined ? 'application/json' : 'application/xml';
        headers['content-length'] = Buffer.byteLength(body);
    }

    let res = await send(device, { method, path, headers, body, timeoutMs });
    if (res.status === 401) {
        const challenge = parseDigestChallenge(res.headers['www-authenticate']);
        if (!challenge) throw new BiometricError('device_error', 'El terminal pidió una autenticación que no es Digest.');
        const authorization = digestAuthorization({ username: device.username, password: device.password, method, uri: path, challenge });
        res = await send(device, { method, path, body, timeoutMs, headers: { ...headers, authorization } });
        if (res.status === 401) throw new BiometricError('unauthorized', 'El terminal rechazó el usuario o la contraseña configurados.');
    }
    if (res.status < 200 || res.status >= 300) {
        const detail = deviceErrorDetail(res.body);
        const error = new BiometricError('device_error', `El terminal respondió ${res.status}${detail ? ` (${detail})` : ''} a ${method} ${path.split('?')[0]}.`);
        error.detail = detail;
        throw error;
    }
    return res.body;
}

const parseJson = (text, what) => {
    try {
        return JSON.parse(text);
    } catch {
        throw new BiometricError('bad_response', `El terminal devolvió una respuesta ilegible (${what}).`);
    }
};



// readDeviceClock = «cómo está ahora el reloj del terminal» (diferencia y zona)
export async function readDeviceClock(device, now = new Date()) {
    return clockReport(parseDeviceTime(await isapi(device, 'GET', '/ISAPI/System/time')), now);
}



// getDeviceStatus = «el equipo y su reloj»
export async function getDeviceStatus(device, now = new Date()) {
    const [infoXml, timeXml] = await Promise.all([
        isapi(device, 'GET', '/ISAPI/System/deviceInfo'),
        isapi(device, 'GET', '/ISAPI/System/time'),
    ]);
    return {
        host: device.hostname,
        device: parseDeviceInfo(infoXml),
        clock: clockReport(parseDeviceTime(timeXml), now),
        checkedAt: now.toISOString(),
    };
}

// checkDevice = «¿responde, qué equipo es y cuánto tiene?»: lo que muestra la
// comprobación de Gestión de terminal. Nunca lanza: devuelve { ok: false, message }.
// Las personas y huellas son de un DS-K1A8503MF; otro modelo puede no informarlas.
export async function checkDevice(device, now = new Date()) {
    try {
        const status = await getDeviceStatus(device, now);
        const [count, reader] = await Promise.allSettled([
            isapi(device, 'GET', '/ISAPI/AccessControl/UserInfo/Count?format=json').then((text) => parseJson(text, 'personas')),
            isapi(device, 'GET', '/ISAPI/AccessControl/CardReaderCfg/1?format=json').then((text) => parseJson(text, 'lector')),
        ]);
        const users = count.status === 'fulfilled' ? count.value?.UserInfoCount?.userNumber : null;
        const cfg = reader.status === 'fulfilled' ? reader.value?.CardReaderCfg : null;
        return {
            ok: true,
            device: status.device,
            clock: status.clock,
            users: Number.isFinite(users) ? users : null,
            fingerprints: Number.isFinite(cfg?.fingerPrintNum) ? cfg.fingerPrintNum : null,
            capacity: Number.isFinite(cfg?.fingerPrintCapacity) ? cfg.fingerPrintCapacity : null,
        };
    } catch (error) {
        return { ok: false, message: error?.message ?? String(error) };
    }
}



// listDeviceUsers = «los empleados registrados en el terminal», con sus huellas y tarjetas
export async function listDeviceUsers(device, { maxPages = MAX_PAGES } = {}) {
    const searchID = nextSearchId('us');
    const users = [];
    let total = null;

    for (let page = 0, position = 0; page < maxPages; page++) {
        const json = parseJson(await isapi(device, 'POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', { json: userSearchBody(searchID, position) }), 'empleados');
        const result = json.UserInfoSearch ?? {};
        const batch = Array.isArray(result.UserInfo) ? result.UserInfo : [];
        if (Number.isFinite(result.totalMatches)) total = result.totalMatches;
        users.push(...batch.map(normalizeDeviceUser));
        position += batch.length;
        if (result.responseStatusStrg !== 'MORE' || batch.length === 0) break;
    }

    return { total: total ?? users.length, truncated: total !== null && users.length < total, users };
}



// searchAccessEvents = «los eventos de acceso que cumplen `condition`» (ver
// eventSearchBody), de la serie más baja a la más alta. El terminal NO los
// entrega ordenados por serie: se ordenan acá.
export async function searchAccessEvents(device, condition, { maxPages = MAX_PAGES } = {}) {
    const searchID = nextSearchId('ev');
    const events = [];
    let total = null;

    for (let page = 0, position = 0; page < maxPages; page++) {
        const json = parseJson(await isapi(device, 'POST', '/ISAPI/AccessControl/AcsEvent?format=json', { json: eventSearchBody({ searchID, position, condition }) }), 'eventos');
        const result = json.AcsEvent ?? {};
        const batch = Array.isArray(result.InfoList) ? result.InfoList : [];
        if (Number.isFinite(result.totalMatches)) total = result.totalMatches;
        events.push(...batch.map(normalizeAcsEvent));
        position += batch.length;
        if (result.responseStatusStrg !== 'MORE' || batch.length === 0) break;
    }

    events.sort((a, b) => (a.serialNo ?? 0) - (b.serialNo ?? 0));
    return { total: total ?? events.length, truncated: total !== null && events.length < total, events };
}

// listDayEvents = «los eventos de un día», del más reciente al más antiguo.
// El día se busca en el desfase que usa el propio terminal: si su zona está mal
// puesta, buscar con la del negocio dejaría fuera los extremos del día.
export async function listDayEvents(device, date) {
    const deviceTime = parseDeviceTime(await isapi(device, 'GET', '/ISAPI/System/time'));
    const offset = formatOffset(offsetMinutesOfIso(deviceTime.localTime) ?? BUSINESS_OFFSET_MINUTES);
    const { total, truncated, events } = await searchAccessEvents(device, dayCondition(date, offset));
    return { date, total, truncated, events: events.reverse() };
}



// ─── Alta de personas y huellas ──────────────────────────────────────────
// Lo único que ESCRIBE personas en el terminal. Las reglas (cuerpos, posiciones,
// mensajes) están en biometricEnroll.lib.js.

// findDeviceUser = «la persona del terminal con ese número», o null
export async function findDeviceUser(device, employeeNo) {
    const json = parseJson(await isapi(device, 'POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', { json: userSearchByNoBody(nextSearchId('un'), employeeNo) }), 'empleado');
    const found = (json.UserInfoSearch?.UserInfo ?? []).find((u) => String(u.employeeNo) === employeeNo);
    return found ? normalizeDeviceUser(found) : null;
}

// createDeviceUser = «dar de alta a una persona en el terminal». Si el número ya
// existe, el terminal la rechaza (no la sobrescribe).
export async function createDeviceUser(device, { employeeNo, name }) {
    try {
        await isapi(device, 'POST', '/ISAPI/AccessControl/UserInfo/Record?format=json', { json: userRecordBody({ employeeNo, name }) });
    } catch (error) {
        if (error?.detail === 'employeeNoAlreadyExist') throw new BiometricError('conflict', `El terminal ya tiene un empleado con el nº ${employeeNo}.`);
        throw error;
    }
}

// listFingerprints = «las posiciones de huella que tiene una persona» (nunca las
// plantillas). El terminal da una por consulta con el mismo searchID, hasta "NoFP".
export async function listFingerprints(device, employeeNo) {
    const searchID = nextSearchId('fp');
    const ids = new Set();
    for (let round = 0; round < FINGER_SLOTS; round++) {
        let json;
        try {
            json = parseJson(await isapi(device, 'POST', '/ISAPI/AccessControl/FingerPrintUpload?format=json', { json: fingerprintSearchBody(searchID, employeeNo) }), 'huellas');
        } catch (error) {
            if (error?.detail === 'fingerprintNotLinkEmployeeIdOrCard') break;   // sin huellas
            throw error;
        }
        const page = fingerprintPage(json);
        const before = ids.size;
        page.ids.forEach((id) => ids.add(id));
        if (!page.more || ids.size === before) break;
    }
    return [...ids].sort((a, b) => a - b);
}

// readFingerprints = «las huellas de una persona, con sus plantillas», para
// copiarlas a otro terminal. Las plantillas no salen nunca de la API: ni en una
// respuesta ni en un log.
export async function readFingerprints(device, employeeNo) {
    const searchID = nextSearchId('fr');
    const found = new Map();
    for (let round = 0; round < FINGER_SLOTS; round++) {
        let json;
        try {
            json = parseJson(await isapi(device, 'POST', '/ISAPI/AccessControl/FingerPrintUpload?format=json', { json: fingerprintSearchBody(searchID, employeeNo) }), 'huellas');
        } catch (error) {
            if (error?.detail === 'fingerprintNotLinkEmployeeIdOrCard') break;   // sin huellas
            throw error;
        }
        const info = json?.FingerPrintInfo;
        const list = Array.isArray(info?.FingerPrintList) ? info.FingerPrintList : [];
        const before = found.size;
        for (const item of list) {
            if (Number.isInteger(item?.fingerPrintID) && typeof item.fingerData === 'string' && item.fingerData) {
                found.set(item.fingerPrintID, item.fingerData);
            }
        }
        if (info?.status !== 'OK' || list.length === 0 || found.size === before) break;
    }
    return [...found.entries()].sort(([a], [b]) => a - b).map(([id, fingerData]) => ({ id, fingerData }));
}

// deleteDeviceUser = «borrar a una persona del terminal», con sus huellas. Solo
// la usa la sincronización para deshacer una persona que ELLA acaba de crear y
// que no sirvió (sus huellas ya estaban en ese terminal con otra persona). Por
// UserInfo/Delete; si este firmware no lo admite, por UserInfoDetail/Delete.
export async function deleteDeviceUser(device, employeeNo) {
    try {
        await isapi(device, 'PUT', '/ISAPI/AccessControl/UserInfo/Delete?format=json', { json: { UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] } } });
        return;
    } catch (error) {
        if (!['notSupport', 'methodNotAllowed', 'invalidOperation'].includes(error?.detail)) throw error;
    }
    await isapi(device, 'PUT', '/ISAPI/AccessControl/UserInfoDetail/Delete?format=json', { json: { UserInfoDetail: { mode: 'byEmployeeNo', EmployeeNoList: [{ employeeNo }] } } });
    for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const json = parseJson(await isapi(device, 'GET', '/ISAPI/AccessControl/UserInfoDetail/DeleteProcess?format=json'), 'borrado');
        const status = json?.UserInfoDetailDeleteProcess?.status;
        if (status === 'success') return;
        if (status === 'failed') throw new BiometricError('device_error', `El terminal no pudo borrar al nº ${employeeNo}.`);
    }
    throw new BiometricError('device_error', `El terminal no confirmó que borró al nº ${employeeNo}.`);
}

// captureFingerprint = «encender el lector del terminal y esperar un dedo»: devuelve
// la plantilla capturada y su calidad, sin guardarla todavía en nadie.
export async function captureFingerprint(device, fingerNo) {
    const startedAt = Date.now();
    for (;;) {
        const attemptAt = Date.now();
        let xml;
        try {
            xml = await isapi(device, 'POST', '/ISAPI/AccessControl/CaptureFingerPrint', { xml: captureFingerprintXml(fingerNo), timeoutMs: CAPTURE_TIMEOUT_MS });
        } catch (error) {
            if (error?.timedOut) throw new BiometricError('device_error', captureFailureMessage('timeout'));
            const noFinger = error?.detail === 'deviceError' && Date.now() - attemptAt >= DEVICE_WAIT_MS;
            const busy = error?.detail === 'deviceBusy';
            if ((noFinger || busy) && Date.now() - startedAt < CAPTURE_WINDOW_MS - DEVICE_WAIT_MS) {
                await new Promise((resolve) => setTimeout(resolve, CAPTURE_PAUSE_MS));
                continue;   // se vuelve a encender
            }
            if (noFinger) throw new BiometricError('device_error', captureFailureMessage('timeout'));
            if (error?.kind === 'device_error') throw new BiometricError('device_error', captureFailureMessage(error.detail));
            throw error;
        }
        const captured = parseCapturedFingerprint(xml);
        if (!captured) throw new BiometricError('device_error', captureFailureMessage(deviceErrorDetail(xml)));
        return captured;
    }
}

// saveFingerprint = «guardar una huella capturada en una persona», en `fingerPrintID`.
// Va por POST FingerPrint/SetUp (con PUT este firmware responde methodNotAllowed,
// comprobado el 2026-11-17); si no lo admite, por la vía vieja: FingerPrintDownload
// y luego FingerPrintProgress hasta que termine. Devuelve por cuál fue.
export async function saveFingerprint(device, { employeeNo, fingerPrintID, fingerData }) {
    const body = fingerprintSetUpBody({ employeeNo, fingerPrintID, fingerData });
    let json;
    let via = 'setUp';
    try {
        json = parseJson(await isapi(device, 'POST', '/ISAPI/AccessControl/FingerPrint/SetUp?format=json', { json: body }), 'huella');
    } catch (error) {
        if (!['notSupport', 'methodNotAllowed'].includes(error?.detail)) throw error;
        via = 'download';
        await isapi(device, 'POST', '/ISAPI/AccessControl/FingerPrintDownload?format=json', { json: body });
        for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            json = parseJson(await isapi(device, 'GET', '/ISAPI/AccessControl/FingerPrintProgress?format=json'), 'huella');
            if (json?.FingerPrintStatus?.totalStatus === 1) break;
        }
    }
    const result = fingerprintSaveResult(json);
    if (!result.ok) {
        const error = new BiometricError(result.status === 5 ? 'conflict' : 'device_error', result.message);
        error.saveStatus = result.status ?? null;   // el código del terminal: la sincronización decide con él
        throw error;
    }
    return { via };
}



// syncDeviceTime = «poner el terminal en hora»: hora del servidor en UTC-04:00,
// en modo manual. Devuelve el reloj leído DESPUÉS del cambio, para confirmarlo.
export async function syncDeviceTime(device, now = new Date()) {
    await isapi(device, 'PUT', '/ISAPI/System/time', { xml: timeSyncXml(now) });
    const after = parseDeviceTime(await isapi(device, 'GET', '/ISAPI/System/time'));
    return { clock: clockReport(after, new Date()) };
}
