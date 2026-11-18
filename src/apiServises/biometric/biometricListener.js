import UserModel from '../user/user.model.js';
import { io } from '../../services/socket/io.js';
import { readDeviceClock, searchAccessEvents, listDeviceUsers } from './biometric.service.js';
import { linkMismatch } from './biometricSync.lib.js';
import { activeTerminals, envTerminals } from './biometricTerminal.service.js';
import { offerFingerprint } from './biometricAccess.service.js';
import { PRINCIPAL_CODE } from './biometricTerminal.lib.js';
import { fullNameOf } from './biometricLink.lib.js';
import {
    fingerprintDecision, kioskPayload, recentEntry, listenerEnabled, pollCondition, seedSinceTime, kioskRoomOf,
    eventAgeSeconds, fingerprintEventId, rememberForwarded, isClaimable, DEBOUNCE_MS, FINGERPRINT_EVENT, LISTENER_EVENT,
} from './biometricStream.lib.js';

// ══════════════════════════════════════════════════════════════════════
// ESCUCHA DE LOS TERMINALES → KIOSCOS
// ══════════════════════════════════════════════════════════════════════
// Por cada terminal activo (los de Gestión de terminal, y el principal del .env
// si la base no tiene uno) se consulta su registro de eventos cada POLL_MS. Cada
// huella nueva de una persona vinculada (user.biometric.employeeNo) se avisa a
// los kioscos DE ESE TERMINAL por socket.io, con su cédula: el kiosco hace lo
// mismo que si la hubieran tecleado y pulsado «Entrar» (foto + marcaje).
//
// Antes de avisar, se comprueba que ese número sea, en ESE terminal, la persona
// vinculada (por su nombre): un número cargado para dos personas en dos
// terminales marcaría a quien no es. Ver linkMismatch en biometricSync.lib.js.
//
// Cada terminal tiene su propio lector, con su serie, su reloj y su estado: que
// uno no responda no frena a los demás.
//
// Las reglas (qué se pide y qué pasa con cada evento) están en
// biometricStream.lib.js, junto con por qué se consulta el registro en lugar de
// suscribirse al flujo de eventos del terminal.
//
// Se enciende con BIOMETRIC_LISTENER=true en el .env (por defecto, solo en
// producción). Tiene que correr en la MISMA API a la que se conectan los
// kioscos: el aviso viaja por el socket de este proceso.



const POLL_MS = 1000;

// El reloj del terminal se relee cada tanto: con él se mide la antigüedad de cada huella.
const CLOCK_REFRESH_MS = 60_000;

// Al arrancar, lo que el registro tenga de los últimos 10 minutos se da por conocido.
const SEED_LOOKBACK_SECONDS = 600;
const SEED_MAX_PAGES = 30;

// Esperas tras fallos seguidos (terminal apagado, red caída…).
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

// Huellas que se guardan por terminal para la pantalla de configuración.
const RECENT_LIMIT = 10;

// Cada cuánto se vuelve a leer la lista de terminales (además de cada vez que se
// cambia desde Gestión de terminal).
const TERMINALS_REFRESH_MS = 60_000;

// Los nombres de las personas de cada terminal: con ellos se comprueba que el
// número de una huella sea de verdad la persona vinculada en Jarvis. Se releen
// cada tanto, y antes si llega un número que no estaba (como mucho cada 30 s).
const NAMES_REFRESH_MS = 10 * 60_000;
const NAMES_RETRY_MS = 30_000;

// nº de empleado → ms del último marcaje enviado, en cualquier terminal.
const lastMarkAt = new Map();

// nº de empleado → el nombre de la huella de ese último marcaje.
const lastMarkEvent = new Map();

// Huellas avisadas a los kioscos, que pueden reclamar antes de marcar: nombre → ms.
const forwarded = new Map();

// código de terminal → su lector
const watchers = new Map();

let enabled = null;      // null = sin arrancar; false = apagada con BIOMETRIC_LISTENER
let syncing = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freshWatch = () => ({
    seeded: false,          // ya se tomó nota de lo que había al arrancar
    sinceTime: null,        // desde qué hora del terminal se mira, mientras no haya serie
    lastSerial: null,       // última serie procesada
    driftSeconds: 0,        // desajuste del reloj del terminal (positivo: adelantado)
    deviceLocalTime: null,
    clockReadAt: 0,
});

const freshNames = () => ({ map: new Map(), readAt: 0, triedAt: 0, failing: false });

const sameDevice = (a, b) => Boolean(a && b)
    && a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port
    && a.username === b.username && a.password === b.password;



// getListenerStatus = «cómo está la escucha de un terminal», para la configuración
export function getListenerStatus(code = PRINCIPAL_CODE) {
    if (enabled === false) return { state: 'disabled' };
    const watcher = watchers.get(code);
    if (!watcher) return { state: 'stopped' };
    return { ...watcher.status, recent: [...watcher.status.recent] };
}

// wasForwarded = «¿esta escucha avisó esa huella hace poco?» (solo esas se pueden reclamar)
export const wasForwarded = (eventId) => isClaimable(forwarded, eventId, Date.now());

// forgetDeviceNames = «los nombres de estos terminales cambiaron» (p. ej., tras
// sincronizarlos): se releen en la próxima consulta.
export function forgetDeviceNames(codes) {
    for (const code of codes) {
        const watcher = watchers.get(code);
        if (watcher) watcher.names = freshNames();
    }
}

// startBiometricListener = «empezar a escuchar los terminales» (una sola vez por proceso)
export function startBiometricListener() {
    if (enabled !== null) return;
    // Al entrar a la sala de su terminal, el kiosco pregunta cómo está la escucha.
    io.setKioskStatusProvider((code) => ({ state: getListenerStatus(code).state }));

    enabled = listenerEnabled(process.env.BIOMETRIC_LISTENER, process.env.NODE_ENV);
    if (!enabled) {
        console.log('[biometric] escucha de los terminales apagada (BIOMETRIC_LISTENER)');
        return;
    }
    refreshListenerTerminals();
    setInterval(refreshListenerTerminals, TERMINALS_REFRESH_MS);
}

// refreshListenerTerminals = «volver a leer qué terminales hay»: arranca los
// nuevos, actualiza los cambiados y detiene los quitados o desactivados.
export function refreshListenerTerminals() {
    if (!enabled) return Promise.resolve();
    if (!syncing) syncing = syncWatchers().finally(() => { syncing = null; });
    return syncing;
}



async function syncWatchers() {
    let terminals;
    try {
        terminals = await activeTerminals();
    } catch (error) {
        // Sin base: se sigue con lo que ya se leía o, al arrancar, con el del .env.
        if (watchers.size > 0) return;
        terminals = envTerminals();
        console.log(`[biometric] no se pudo leer la lista de terminales (${error?.message ?? error}): se usa el del .env`);
    }

    const codes = new Set(terminals.map((t) => t.code));
    for (const terminal of terminals) {
        const watcher = watchers.get(terminal.code);
        if (!watcher) {
            const created = newWatcher(terminal);
            watchers.set(terminal.code, created);
            run(created);
            continue;
        }
        // Otra dirección o credencial: se empieza de cero con el registro de ese equipo.
        if (!sameDevice(watcher.device, terminal.device)) {
            watcher.watch = freshWatch();
            watcher.names = freshNames();
        }
        watcher.device = terminal.device;
        watcher.configError = terminal.error ?? null;
        watcher.name = terminal.name;
        watcher.status.name = terminal.name;
    }
    for (const [code, watcher] of watchers) {
        if (codes.has(code)) continue;
        watcher.stopped = true;
        watchers.delete(code);
        setState(watcher, 'stopped');
        console.log(`[biometric] se deja de leer el terminal «${code}»`);
    }
}

function newWatcher(terminal) {
    return {
        code: terminal.code,
        name: terminal.name,
        device: terminal.device,
        configError: terminal.error ?? null,
        stopped: false,
        watch: freshWatch(),
        names: freshNames(),   // nº de empleado → nombre en este terminal
        status: {
            code: terminal.code,
            name: terminal.name,
            state: 'stopped',          // stopped | connecting | connected | retrying
            since: null,
            pollSeconds: POLL_MS / 1000,
            lastPollAt: null,
            lastError: null,
            lastSerial: null,
            forwarded: 0,
            ignored: 0,
            recent: [],                // últimas huellas, la más nueva primero
        },
    };
}

// Cada cambio de estado se avisa a los kioscos de ese terminal: su indicador del
// encabezado dice si las huellas pueden llegar.
function setState(watcher, state, extra = {}) {
    const changed = watcher.status.state !== state;
    Object.assign(watcher.status, extra, { state });
    if (!changed) return;
    watcher.status.since = new Date().toISOString();
    io.emitToRoom(kioskRoomOf(watcher.code), LISTENER_EVENT, { state });
}



async function run(watcher) {
    setState(watcher, 'connecting');
    let failures = 0;
    while (!watcher.stopped) {
        try {
            if (watcher.configError) throw new Error(watcher.configError);
            await pollOnce(watcher);
            watcher.status.lastPollAt = new Date().toISOString();
            if (watcher.status.state !== 'connected') {
                if (failures > 0) console.log(`[biometric] el terminal «${watcher.code}» volvió a responder`);
                setState(watcher, 'connected', { lastError: null, retryInSeconds: null });
            }
            failures = 0;
            await sleep(POLL_MS);
        } catch (error) {
            if (watcher.stopped) break;
            const message = error?.message ?? String(error);
            const delay = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)];
            if (failures === 0) console.log(`[biometric] no se pudo consultar el terminal «${watcher.code}»: ${message}`);
            failures++;
            setState(watcher, 'retrying', { lastError: message, retryInSeconds: delay / 1000 });
            await sleep(delay);
        }
    }
}



// Una consulta: lo nuevo del registro de ese terminal, en orden de serie.
async function pollOnce(watcher) {
    const { watch } = watcher;
    if (Date.now() - watch.clockReadAt > CLOCK_REFRESH_MS) await refreshClock(watcher);
    if (!watch.seeded) return seed(watcher);
    const { names } = watcher;
    if (Date.now() - names.readAt > NAMES_REFRESH_MS && Date.now() - names.triedAt > NAMES_RETRY_MS) await refreshNames(watcher);

    const { events } = await searchAccessEvents(watcher.device, pollCondition(watch));
    for (const event of events) {
        if (watcher.stopped || watcher.watch !== watch) return;   // se detuvo o cambió de equipo
        if (!Number.isInteger(event.serialNo)) continue;
        if (watch.lastSerial !== null && event.serialNo <= watch.lastSerial) continue;
        // Si algo falla aquí (la base, por ejemplo), la serie no avanza y la
        // huella se reintenta en la próxima consulta mientras siga reciente.
        await handleEvent(watcher, event);
        watch.lastSerial = event.serialNo;
        watcher.status.lastSerial = event.serialNo;
    }
}

// Lo que ya estaba en el registro al arrancar no se avisa a ningún kiosco.
async function seed(watcher) {
    const { watch } = watcher;
    watch.sinceTime = seedSinceTime(watch.deviceLocalTime, SEED_LOOKBACK_SECONDS);
    const { events } = await searchAccessEvents(watcher.device, pollCondition({ lastSerial: null, sinceTime: watch.sinceTime }), { maxPages: SEED_MAX_PAGES });
    const serials = events.map((e) => e.serialNo).filter(Number.isInteger);
    watch.lastSerial = serials.length ? Math.max(...serials) : null;
    watcher.status.lastSerial = watch.lastSerial;
    watch.seeded = true;

    const from = watch.lastSerial !== null ? `después de la serie ${watch.lastSerial}` : `desde las ${watch.sinceTime.slice(11, 19)} del terminal`;
    console.log(`[biometric] leyendo el terminal «${watcher.code}» (${watcher.device.hostname}) cada ${POLL_MS / 1000} s (${from})`);
}

// Si no se pueden leer, se sigue con los que había (o sin comprobar): el terminal
// que no da su lista tampoco estaría dando huellas.
async function refreshNames(watcher) {
    const names = watcher.names;
    names.triedAt = Date.now();
    try {
        const { users } = await listDeviceUsers(watcher.device, { maxPages: 110 });
        names.map = new Map(users.map((u) => [String(u.employeeNo), u.name ?? '']));
        names.readAt = Date.now();
        names.failing = false;
    } catch (error) {
        if (!names.failing) console.log(`[biometric] «${watcher.code}»: no se pudieron leer los nombres del terminal (${error?.message ?? error}); se marca sin comprobarlos`);
        names.failing = true;
    }
}

// deviceNameFor = «el nombre que tiene este número en este terminal», o null
async function deviceNameFor(watcher, employeeNo) {
    if (!watcher.names.map.has(employeeNo) && Date.now() - watcher.names.triedAt > NAMES_RETRY_MS) await refreshNames(watcher);
    return watcher.names.map.get(employeeNo) ?? null;
}

async function refreshClock(watcher) {
    const clock = await readDeviceClock(watcher.device);
    watcher.watch.driftSeconds = clock.driftSeconds ?? 0;
    watcher.watch.deviceLocalTime = clock.deviceLocalTime;
    watcher.watch.clockReadAt = Date.now();
    watcher.status.driftSeconds = watcher.watch.driftSeconds;
}



async function handleEvent(watcher, event) {
    const now = new Date();
    let decision = fingerprintDecision({ event, lastMarkAt, now, driftSeconds: watcher.watch.driftSeconds });
    if (decision.reason === 'fuera_de_tiempo') {
        // ¿Le cambiaron la hora al terminal? Se mide otra vez antes de descartarla.
        await refreshClock(watcher);
        decision = fingerprintDecision({ event, lastMarkAt, now: new Date(), driftSeconds: watcher.watch.driftSeconds });
    }

    if (decision.action === 'ignore') {
        watcher.status.ignored++;
        if (decision.reason === 'otro_evento') return;
        remember(watcher, recentEntry({ event, decision, now }));
        console.log(`[biometric] «${watcher.code}»: huella del nº ${event.employeeNo ?? '—'} descartada (${decision.reason}${decision.ageSeconds != null ? `, hace ${decision.ageSeconds} s` : ''})`);
        return;
    }

    const linkedUser = event.employeeNo && decision.action !== 'rejected'
        ? await UserModel.findOne({ 'biometric.employeeNo': event.employeeNo }, 'name surName dni inabilited admin').lean()
        : null;

    // ¿Ese número es, en ESTE terminal, la persona vinculada? Si el nombre es de
    // otra (el mismo número cargado para dos personas en dos terminales), no se
    // marca ni abre nada: se le marcaría la asistencia a quien no es.
    let mismatchName = null;
    if (linkedUser) {
        const deviceName = await deviceNameFor(watcher, event.employeeNo);
        if (deviceName && linkMismatch(deviceName, linkedUser)) mismatchName = deviceName;
    }
    const user = mismatchName ? null : linkedUser;
    if (mismatchName) console.log(`[biometric] «${watcher.code}»: el nº ${event.employeeNo} es «${mismatchName}» en este terminal y en Jarvis es otra persona: no se marca`);

    // ¿Era la huella que esperaba alguien para entrar a la configuración de este
    // kiosco? Entonces abre la configuración y no se toma como marcaje.
    const ageSeconds = eventAgeSeconds(event.time, now, watcher.watch.driftSeconds);
    const opened = offerFingerprint({
        terminal: watcher.code,
        decision: decision.action,
        event,
        user,
        eventAtMs: ageSeconds === null ? NaN : now.getTime() - ageSeconds * 1000,
        now,
    });
    if (opened) {
        remember(watcher, recentEntry({ event, decision, payload: { type: 'login', name: fullNameOf(user) }, now }));
        console.log(`[biometric] «${watcher.code}»: la huella del nº ${event.employeeNo} abrió la configuración del kiosco`);
        return;
    }

    // Cada aviso lleva el nombre de su huella: el kiosco la reclama antes de marcar.
    const eventId = fingerprintEventId(watcher.code, event.serialNo);
    const payload = { ...kioskPayload(decision, event, user, { mismatchName }), terminal: watcher.code, eventId };

    // La huella repetida lleva también la del marcaje que abrió el minuto. Si el
    // kiosco no llegó a marcar aquel, reclama ESE y lo marca ahora; reclamar la
    // repetida dejaría marcarla a otro kiosco que ya marcó la primera.
    if (payload.type === 'repeated') payload.markEventId = lastMarkEvent.get(event.employeeNo) ?? null;

    // Solo un marcaje de verdad abre la ventana de huella repetida.
    if (payload.type === 'mark') {
        lastMarkAt.set(event.employeeNo, now.getTime());
        lastMarkEvent.set(event.employeeNo, eventId);
        for (const [employeeNo, at] of lastMarkAt) {
            if (now.getTime() - at <= DEBOUNCE_MS) continue;
            lastMarkAt.delete(employeeNo);
            lastMarkEvent.delete(employeeNo);
        }
    }

    rememberForwarded(forwarded, eventId, now.getTime());
    io.emitToRoom(kioskRoomOf(watcher.code), FINGERPRINT_EVENT, payload);
    watcher.status.forwarded++;
    remember(watcher, recentEntry({ event, decision, payload, now }));
    console.log(`[biometric] «${watcher.code}»: huella (${payload.type}) del nº ${payload.employeeNo ?? '—'} avisada a su kiosco`);
}

function remember(watcher, entry) {
    watcher.status.recent = [entry, ...watcher.status.recent].slice(0, RECENT_LIMIT);
}
