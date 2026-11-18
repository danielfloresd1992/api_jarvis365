import crypto from 'node:crypto';

// ══════════════════════════════════════════════════════════════════════
// TERMINAL BIOMÉTRICO (Hikvision, por ISAPI) — reglas puras
// ══════════════════════════════════════════════════════════════════════
// Todo lo que se decide sin hablar con el terminal vive acá, sin red ni base,
// para poder probarlo: la autenticación Digest, la lectura de sus respuestas,
// el estado de su reloj y la traducción de sus eventos.
//
// Comprobado contra el DS-K1A8503MF del local (firmware V1.4.0, build 220523):
//   - Solo acepta Digest (qop="auth"); nunca ofrece Basic.
//   - Cada huella aceptada es un evento mayor 5, menor 38.
//   - attendanceStatus llega SIEMPRE "undefined": el terminal no distingue
//     entrada de salida; eso lo decide la API (machineMark.service.js).
//   - Informa su hora como "2026-11-17T11:49:04-04:30" y su zona como
//     "CST+4:30:00" (signo invertido, al estilo POSIX).



// Venezuela está en UTC-04:00 fijo desde 2016, sin horario de verano.
export const BUSINESS_OFFSET_MINUTES = -240;

// Por encima de esta diferencia el reloj del terminal se considera desajustado.
export const CLOCK_TOLERANCE_SECONDS = 60;

// Registros por página que se le piden al terminal en las búsquedas.
export const PAGE_SIZE = 30;



// ─── Errores ─────────────────────────────────────────────────────────────

// BiometricError = «un fallo al hablar con el terminal», con su tipo para elegir el código HTTP.
// Se usa con `new BiometricError(kind, message)` y se reconoce con `instanceof`.
//
// NO es `class … extends Error` a propósito. El build de producción (babel.config.json)
// pasa las clases a funciones (transform-classes, loose) y después minify-simplify junta
// el constructor en una sola expresión: con `super(message); this.kind = kind` dejaba
// `_this.kind = kind` ANTES de que existiera `_this`, y en dist/ cada `new BiometricError`
// reventaba con «Cannot set properties of undefined (setting 'kind')» (visto en producción
// el 2026-11-18: un 401 esperado de /auth/biometric/start salía como 500). Una función
// constructora no pasa por esa transformación.
export function BiometricError(kind, message) {
    const error = new Error(message);
    error.name = 'BiometricError';
    error.kind = kind;
    Object.setPrototypeOf(error, BiometricError.prototype);
    return error;
}
BiometricError.prototype = Object.create(Error.prototype, {
    constructor: { value: BiometricError, writable: true, configurable: true },
});

const ERROR_STATUS = {
    bad_request: 400,
    login_required: 401,   // quien llama tiene que identificarse (p. ej., la llave de la tablet no vale)
    denied: 403,           // identificado, pero sin permiso para eso
    not_found: 404,
    conflict: 409,
    gone: 410,             // existió, pero ya no se puede usar (p. ej., una huella avisada hace mucho)
    too_many: 429,
    unauthorized: 502,   // el terminal rechazó las credenciales del servidor: no es culpa de quien llama
    device_error: 502,
    bad_response: 502,
    not_configured: 503,
    unreachable: 504,
};

// deviceErrorDetail = «el motivo que da el terminal al rechazar algo», de su
// cuerpo JSON ({ subStatusCode: "badParameters" }) o XML (<subStatusCode>…)
export function deviceErrorDetail(body) {
    const text = String(body ?? '');
    try {
        const json = JSON.parse(text);
        return json?.subStatusCode ?? json?.statusString ?? null;
    } catch {
        return xmlValue(text, 'subStatusCode') ?? xmlValue(text, 'statusString');
    }
}

// errorResponse = «qué responderle al kiosco ante un fallo»
export function errorResponse(error) {
    const status = error instanceof BiometricError ? ERROR_STATUS[error.kind] : undefined;
    if (!status) return { status: 500, error: 'Internal Server Error', message: 'Error inesperado al gestionar el terminal biométrico.' };
    return { status, error: error.kind, message: error.message };
}



// ─── Autenticación Digest (RFC 2617, MD5) ───────────────────────────────

// parseDigestChallenge = «el reto Digest de WWW-Authenticate», o null si no lo es
export function parseDigestChallenge(header = '') {
    if (!/^\s*Digest\s/i.test(String(header))) return null;
    const challenge = {};
    for (const m of String(header).replace(/^\s*Digest\s+/i, '').matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) {
        challenge[m[1]] = m[2] ?? m[3];
    }
    return challenge.nonce && challenge.realm !== undefined ? challenge : null;
}

const md5 = (text) => crypto.createHash('md5').update(text).digest('hex');

// digestAuthorization = «la cabecera Authorization que responde al reto»
// `cnonce` se puede fijar para que las pruebas sean deterministas.
export function digestAuthorization({ username, password, method, uri, challenge, cnonce = crypto.randomBytes(8).toString('hex'), nc = '00000001' }) {
    if (challenge.algorithm && challenge.algorithm.toUpperCase() !== 'MD5') {
        throw new BiometricError('device_error', `El terminal pide el algoritmo Digest «${challenge.algorithm}», que no está soportado.`);
    }
    const offered = challenge.qop ? challenge.qop.split(',').map((q) => q.trim()) : [];
    if (offered.length && !offered.includes('auth')) {
        throw new BiometricError('device_error', `El terminal pide qop «${challenge.qop}», que no está soportado.`);
    }

    const ha1 = md5(`${username}:${challenge.realm}:${password}`);
    const ha2 = md5(`${method}:${uri}`);
    const response = offered.length
        ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`)
        : md5(`${ha1}:${challenge.nonce}:${ha2}`);

    let header = `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}"`;
    if (challenge.algorithm) header += `, algorithm=${challenge.algorithm}`;
    header += `, response="${response}"`;
    if (offered.length) header += `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
    if (challenge.opaque !== undefined) header += `, opaque="${challenge.opaque}"`;
    return header;
}



// ─── Lectura de respuestas XML (planas) ──────────────────────────────────

const decodeXmlEntities = (text) => text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

// xmlValue = «el texto de un elemento de un XML plano de ISAPI», o null
export function xmlValue(xml, tag) {
    const match = String(xml ?? '').match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
    return match ? decodeXmlEntities(match[1].trim()) : null;
}

// parseDeviceInfo = «los datos del equipo» desde /ISAPI/System/deviceInfo
export function parseDeviceInfo(xml) {
    return {
        name: xmlValue(xml, 'deviceName'),
        model: xmlValue(xml, 'model'),
        serialNumber: xmlValue(xml, 'serialNumber'),
        macAddress: xmlValue(xml, 'macAddress'),
        firmwareVersion: xmlValue(xml, 'firmwareVersion'),
        firmwareBuild: xmlValue(xml, 'firmwareReleasedDate'),
        deviceType: xmlValue(xml, 'deviceType'),
    };
}

// parseDeviceTime = «cómo informa el terminal su hora» desde /ISAPI/System/time
export function parseDeviceTime(xml) {
    return {
        mode: xmlValue(xml, 'timeMode'),
        localTime: xmlValue(xml, 'localTime'),
        timeZone: xmlValue(xml, 'timeZone'),
    };
}



// ─── Reloj ───────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

// formatOffset = «-240 → "-04:00"»
export function formatOffset(minutes) {
    const abs = Math.abs(minutes);
    return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// offsetMinutesOfIso = «el desfase de una hora ISO»: "…-04:30" → -270; "…Z" → 0; sin desfase → null
export function offsetMinutesOfIso(iso = '') {
    const text = String(iso ?? '');
    if (/Z$/i.test(text)) return 0;
    const match = text.match(/([+-])(\d{2}):?(\d{2})$/);
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === '-' ? -minutes : minutes;
}

// localIsoAt = «la hora de `date` vista en un desfase»: 16:40Z con -240 → "…T12:40:00-04:00"
export function localIsoAt(date, offsetMinutes) {
    const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
        + `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
        + formatOffset(offsetMinutes);
}

// businessDateOf = «el día civil del negocio en `now`», AAAA-MM-DD
export function businessDateOf(now) {
    return localIsoAt(now, BUSINESS_OFFSET_MINUTES).slice(0, 10);
}

// isIsoDate = «"AAAA-MM-DD" válido»
export function isIsoDate(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const [y, m, d] = text.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// La hora de pared de una hora ISO (lo que muestra la pantalla del terminal),
// ignorando su desfase, en milisegundos para poder restarla.
const wallClockMs = (iso) => {
    const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
};

// hikTimeZone = «la zona en el formato del terminal». El signo va al revés, como
// en POSIX: el terminal informó "CST+4:30:00" junto a horas "-04:30".
export function hikTimeZone(offsetMinutes) {
    const abs = Math.abs(offsetMinutes);
    return `CST${offsetMinutes <= 0 ? '+' : '-'}${Math.floor(abs / 60)}:${pad(abs % 60)}:00`;
}

// clockReport = «cómo está el reloj del terminal frente al del servidor»
// La diferencia se mide en hora de pared (la que ve el empleado en la pantalla);
// la zona mal puesta se informa aparte, porque desplaza la hora absoluta.
export function clockReport(deviceTime, now) {
    const deviceWall = wallClockMs(deviceTime?.localTime);
    const businessWall = wallClockMs(localIsoAt(now, BUSINESS_OFFSET_MINUTES));
    const driftSeconds = deviceWall === null ? null : Math.round((deviceWall - businessWall) / 1000);
    const deviceOffsetMinutes = offsetMinutesOfIso(deviceTime?.localTime);
    const zoneMatches = deviceOffsetMinutes === BUSINESS_OFFSET_MINUTES;

    return {
        mode: deviceTime?.mode ?? null,
        timeZone: deviceTime?.timeZone ?? null,
        deviceLocalTime: deviceTime?.localTime ?? null,
        businessLocalTime: localIsoAt(now, BUSINESS_OFFSET_MINUTES),
        driftSeconds,
        deviceOffsetMinutes,
        expectedOffsetMinutes: BUSINESS_OFFSET_MINUTES,
        zoneMatches,
        needsSync: driftSeconds === null || Math.abs(driftSeconds) > CLOCK_TOLERANCE_SECONDS || !zoneMatches,
    };
}

// timeSyncXml = «el cuerpo de PUT /ISAPI/System/time para poner el terminal en hora»
export function timeSyncXml(now) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Time version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">',
        '<timeMode>manual</timeMode>',
        `<localTime>${localIsoAt(now, BUSINESS_OFFSET_MINUTES)}</localTime>`,
        `<timeZone>${hikTimeZone(BUSINESS_OFFSET_MINUTES)}</timeZone>`,
        '</Time>',
        '',
    ].join('\n');
}



// ─── Empleados y eventos ─────────────────────────────────────────────────

// Nombre de cada evento. 5/38 y 5/49 se observaron en el terminal (con y sin
// número de empleado); los del grupo 3 salen de la tabla de códigos de
// Hikvision y son operaciones remotas, no marcajes.
export const ACS_EVENT_LABELS = Object.freeze({
    '5/38': 'Huella aceptada',
    '5/49': 'Huella no registrada',
    '3/112': 'Inicio de sesión remoto',
    '3/113': 'Cierre de sesión remoto',
    '3/121': 'Suscripción a eventos',
    '3/122': 'Fin de suscripción a eventos',
});

export const isMarkEvent = (major, minor) => major === 5 && minor === 38;

// describeAcsEvent = «el nombre legible de un evento»
export function describeAcsEvent(major, minor) {
    return ACS_EVENT_LABELS[`${major}/${minor}`] ?? `Evento ${major}/${minor}`;
}

// eventKind = «para pintarlo»: marcaje, huella rechazada u otra cosa
export function eventKind(major, minor) {
    if (isMarkEvent(major, minor)) return 'mark';
    if (major === 5 && minor === 49) return 'rejected';
    return 'other';
}

// normalizeAcsEvent = «un evento de /ISAPI/AccessControl/AcsEvent en la forma del kiosco»
export function normalizeAcsEvent(item = {}) {
    return {
        serialNo: item.serialNo ?? null,
        time: item.time ?? null,
        employeeNo: item.employeeNoString || null,
        major: item.major ?? null,
        minor: item.minor ?? null,
        label: describeAcsEvent(item.major, item.minor),
        kind: eventKind(item.major, item.minor),
        attendanceStatus: item.attendanceStatus ?? null,
    };
}

// normalizeDeviceUser = «un empleado de /ISAPI/AccessControl/UserInfo/Search en la forma del kiosco»
// Se copian solo estos campos, a propósito: el registro del terminal trae
// además `password` (la clave de puerta del empleado), que no debe salir de acá.
// El firmware V1.4.0 NO informa numOfFP ni numOfCard: esos quedan en null y la
// pantalla no debe leerlos como «sin huella».
export function normalizeDeviceUser(user = {}) {
    return {
        employeeNo: user.employeeNo ?? null,
        name: user.name ?? '',
        userType: user.userType ?? null,
        fingerprints: Number.isFinite(user.numOfFP) ? user.numOfFP : null,
        cards: Number.isFinite(user.numOfCard) ? user.numOfCard : null,
        enabled: typeof user.Valid?.enable === 'boolean' ? user.Valid.enable : null,
        menuAccess: typeof user.localUIRight === 'boolean' ? user.localUIRight : null,   // puede entrar al menú de administración del terminal
    };
}

// searchIdOf = «un identificador de búsqueda corto y único». El AcsEvent de este
// firmware rechaza con 400 badParameters un searchID de 31 caracteres; con 7 a
// 15 funciona.
export function searchIdOf(tag, now) {
    return `bj-${tag}-${now.getTime().toString(36)}`;
}

// userSearchBody = «una página de la búsqueda de empleados»
export function userSearchBody(searchID, position) {
    return { UserInfoSearchCond: { searchID, searchResultPosition: position, maxResults: PAGE_SIZE } };
}

// dayCondition = «los eventos de un día», en el desfase del propio terminal
export function dayCondition(date, offset) {
    return { startTime: `${date}T00:00:00${offset}`, endTime: `${date}T23:59:59${offset}` };
}

// eventSearchBody = «una página de los eventos de acceso (mayor 5) que cumplen `condition`»:
// un rango de horas (dayCondition) o de números de serie (beginSerialNo + endSerialNo).
// El terminal entrega hasta 10 por página aunque se le pidan más.
export function eventSearchBody({ searchID, position, condition }) {
    return {
        AcsEventCond: {
            searchID,
            searchResultPosition: position,
            maxResults: PAGE_SIZE,
            major: 5,
            minor: 0,
            ...condition,
        },
    };
}
