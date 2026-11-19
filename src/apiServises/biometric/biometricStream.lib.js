import { BUSINESS_OFFSET_MINUTES, localIsoAt, offsetMinutesOfIso, formatOffset } from './biometric.lib.js';
import { fullNameOf } from './biometricLink.lib.js';
import { PRINCIPAL_CODE, isTerminalCode } from './biometricTerminal.lib.js';

// ══════════════════════════════════════════════════════════════════════
// HUELLAS EN VIVO: DEL TERMINAL AL KIOSCO — reglas puras
// ══════════════════════════════════════════════════════════════════════
// La escucha (biometricListener.js) consulta cada segundo el registro de eventos
// del terminal y avisa al kiosco de cada huella nueva. Aquí está qué pedir y qué
// hacer con cada evento, sin red ni base, para poder probarlo.
//
// Por qué se consulta el registro y NO la suscripción alertStream (lo primero que
// se probó): al suscribirse, el terminal reenvía TODO su historial (~24.000
// eventos, a ~10 por segundo: unos 40 minutos) y, mientras tanto, parte de las
// huellas nuevas no salen al momento sino cuando el reenvío pasa por ellas. En la
// captura del 2026-11-17 dos huellas de las 11:53 llegaron después del latido de
// las 11:57: más de 4 minutos tarde, cuando ya no servían. Pasaba tras cada
// reinicio de la API o corte de la conexión, y se veía como «a veces pongo la
// huella y no pasa nada». El registro, en cambio, tiene la huella al instante.
//
// Comprobado con el terminal real (DS-K1A8503MF, firmware V1.4.0):
//   - Buscar por número de serie (beginSerialNo + endSerialNo, sin horas)
//     devuelve solo lo nuevo, sin depender de su reloj. Con una sola de las dos
//     responde 400 badParameters.
//   - Sin novedades responde "NO MATCH" en ~100 ms; da 10 eventos por página.
//   - Una persona puede marcar dos veces seguidas (7 s en una prueba) y la API
//     tomaría la segunda como salida: dentro de DEBOUNCE_MS no se marca, y el
//     kiosco avisa por qué (antes se callaba y parecía que no funcionaba).



// Sala de socket.io a la que entra el kiosco, y los nombres de sus eventos.
export const KIOSK_ROOM = 'biometric:kiosk';
export const JOIN_KIOSK_EVENT = 'join-biometric-kiosk';
export const FINGERPRINT_EVENT = 'biometric:fingerprint';
export const LISTENER_EVENT = 'biometric:listener';   // { state }: si la API está leyendo al terminal
export const KIOSKS_EVENT = 'biometric:kiosks';       // { count }: cuántos kioscos hay en la sala de ese terminal

// kioskRoomOf = «la sala de los kioscos de un terminal». El principal conserva la
// sala de siempre, así los kioscos que no dicen su terminal reciben lo mismo que antes.
export function kioskRoomOf(code) {
    return !isTerminalCode(code) || code === PRINCIPAL_CODE ? KIOSK_ROOM : `${KIOSK_ROOM}:${code}`;
}

// ─── Una huella, un marcaje ──────────────────────────────────────────────
// Si dos kioscos escuchan el mismo terminal (la tablet y una PC con bioJarvis
// abierto, dos pestañas…), los dos reciben cada huella. Antes de marcar, cada uno
// la reclama en la API (biometricClaim.service.js): el primero se la queda y los
// demás no hacen nada. Sin eso marcaban los dos, y la API tomaba el segundo como salida.

// fingerprintEventId = «el nombre de una huella»: terminal y serie («principal:47064»).
export const fingerprintEventId = (terminal, serialNo) => `${terminal}:${serialNo}`;

export const isFingerprintEventId = (text) => typeof text === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?:\d{1,10}$/.test(text);

// isKioskId = «el identificador de un kiosco abierto» (al azar, lo inventa el kiosco)
export const isKioskId = (text) => typeof text === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(text);

// Hasta cuándo se puede reclamar una huella avisada. Lo normal es al instante;
// esto solo acota lo que la escucha recuerda.
export const CLAIM_WINDOW_MS = 10 * 60_000;

// rememberForwarded = «anotar que se avisó una huella», olvidando de paso las que
// ya no se pueden reclamar. `forwarded`: Map nombre de huella → ms, en orden de aviso.
export function rememberForwarded(forwarded, eventId, nowMs) {
    for (const [id, at] of forwarded) {
        if (nowMs - at <= CLAIM_WINDOW_MS) break;
        forwarded.delete(id);
    }
    forwarded.delete(eventId);   // y se agrega al final, para no desordenar el Map
    forwarded.set(eventId, nowMs);
}

// isClaimable = «¿se puede reclamar esta huella?»: solo las que avisó esta escucha
// hace poco. Así nadie puede reservar huellas que todavía no se pusieron.
export function isClaimable(forwarded, eventId, nowMs) {
    const at = forwarded.get(eventId);
    return at !== undefined && nowMs - at <= CLAIM_WINDOW_MS;
}

// joinedTerminalOf = «el terminal que pide un kiosco al entrar»: { terminal: 'centro' },
// o nada (los kioscos de antes) → el principal
export function joinedTerminalOf(payload) {
    const code = typeof payload?.terminal === 'string' ? payload.terminal.trim().toLowerCase() : '';
    return isTerminalCode(code) ? code : PRINCIPAL_CODE;
}

// Una huella más vieja que esto ya no es «la persona que está frente al kiosco».
// Con la consulta cada segundo una huella llega en 1-2 s; esto solo pasa si la
// API pierde al terminal un rato y, al volver, encuentra lo que quedó pendiente.
export const FRESH_SECONDS = 60;

// Segunda huella de la misma persona dentro de este tiempo: no se marca.
export const DEBOUNCE_MS = 60_000;

// Tope de beginSerialNo/endSerialNo que admite el terminal.
export const MAX_SERIAL = 3_000_000_000;

// Fin de un rango de horas «hasta siempre» (el terminal admite hasta 25 caracteres).
const FAR_END_TIME = '2037-12-31T23:59:59';



// ─── Qué pedirle al terminal ─────────────────────────────────────────────

// seedSinceTime = «desde cuándo mirar al arrancar»: la hora del propio terminal
// menos `lookbackSeconds`, en su desfase. Lo que ya esté en el registro desde
// entonces se da por conocido; el margen cubre un reloj que se atrase un poco
// (por ejemplo, al ponerlo en hora). Si su hora no se entiende, la del servidor.
export function seedSinceTime(deviceLocalTime, lookbackSeconds, fallbackNow = new Date()) {
    const offset = offsetMinutesOfIso(deviceLocalTime);
    const ms = Date.parse(deviceLocalTime ?? '');
    if (offset === null || Number.isNaN(ms)) {
        return localIsoAt(new Date(fallbackNow.getTime() - lookbackSeconds * 1000), BUSINESS_OFFSET_MINUTES);
    }
    return localIsoAt(new Date(ms - lookbackSeconds * 1000), offset);
}

// pollCondition = «qué eventos pedir en cada consulta»:
//   conocida la última serie → solo las posteriores (no depende del reloj);
//   si todavía no (arrancó y aún no hubo eventos) → los posteriores a `sinceTime`.
export function pollCondition({ lastSerial, sinceTime }) {
    if (Number.isInteger(lastSerial)) return { beginSerialNo: lastSerial + 1, endSerialNo: MAX_SERIAL };
    const offset = formatOffset(offsetMinutesOfIso(sinceTime) ?? BUSINESS_OFFSET_MINUTES);
    return { startTime: sinceTime, endTime: `${FAR_END_TIME}${offset}` };
}



// ─── Qué hacer con cada evento ───────────────────────────────────────────

// Hora de pared de una hora ISO, en ms, ignorando su desfase.
const wallClockMs = (iso) => {
    const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
};

// eventAgeSeconds = «hace cuánto ocurrió el evento», corrigiendo el desajuste del
// reloj del terminal (`driftSeconds`, positivo si va adelantado)
export function eventAgeSeconds(time, now, driftSeconds = 0) {
    const eventWall = wallClockMs(time);
    if (eventWall === null) return null;
    const nowWall = wallClockMs(localIsoAt(now, BUSINESS_OFFSET_MINUTES));
    return Math.round((nowWall - (eventWall - driftSeconds * 1000)) / 1000);
}

// fingerprintDecision = «qué hacer con un evento nuevo del registro»
// (normalizeAcsEvent: { major, minor, employeeNo, serialNo, time }):
//   mark      huella aceptada de alguien → que el kiosco marque
//   repeated  la misma persona otra vez antes de DEBOUNCE_MS → avisar, sin marcar
//   rejected  huella que el terminal no reconoce → avisar
//   ignore    lo demás, con el motivo
// `lastMarkAt` es un Map nº de empleado → ms del último marcaje enviado.
export function fingerprintDecision({ event, lastMarkAt, now, driftSeconds = 0 }) {
    if (event.major !== 5 || (event.minor !== 38 && event.minor !== 49)) return { action: 'ignore', reason: 'otro_evento' };

    const ageSeconds = eventAgeSeconds(event.time, now, driftSeconds);
    if (ageSeconds === null || Math.abs(ageSeconds) > FRESH_SECONDS) return { action: 'ignore', reason: 'fuera_de_tiempo', ageSeconds };

    if (event.minor === 49) return { action: 'rejected' };
    if (!event.employeeNo) return { action: 'ignore', reason: 'sin_empleado' };

    const last = lastMarkAt?.get(event.employeeNo);
    if (last !== undefined && now.getTime() - last < DEBOUNCE_MS) {
        return { action: 'repeated', secondsAgo: Math.max(0, Math.round((now.getTime() - last) / 1000)) };
    }
    return { action: 'mark' };
}

// kioskPayload = «lo que se le manda al kiosco»: la cédula del usuario vinculado,
// o por qué no se marca. `user` es el usuario con ese nº de empleado, o null.
// `mismatchName`: el nombre que tiene ese número en ESTE terminal, cuando es de
// otra persona que la vinculada (un número cargado para dos personas en dos
// terminales): no se marca, ni viaja nada del usuario vinculado.
export function kioskPayload(decision, event, user, { mismatchName = null } = {}) {
    const base = { employeeNo: event.employeeNo, serialNo: event.serialNo, at: event.time };
    if (decision.action === 'rejected') return { type: 'rejected', ...base };
    if (mismatchName) return { type: 'unlinked', reason: 'otra_persona', name: mismatchName, ...base };
    if (decision.action === 'repeated') {
        return {
            type: 'repeated',
            name: user ? fullNameOf(user) : null,
            dni: user?.dni ? String(user.dni) : null,
            secondsAgo: decision.secondsAgo,
            waitSeconds: Math.max(1, Math.round(DEBOUNCE_MS / 1000) - decision.secondsAgo),
            ...base,
        };
    }
    if (!user) return { type: 'unlinked', reason: 'sin_vinculo', ...base };
    const name = fullNameOf(user);
    if (user.inabilited === true) return { type: 'unlinked', reason: 'deshabilitado', name, ...base };
    if (!user.dni) return { type: 'unlinked', reason: 'sin_cedula', name, ...base };
    return { type: 'mark', dni: String(user.dni), name, ...base };
}

// recentEntry = «cómo terminó una huella», para la lista de la pantalla de
// configuración. Con `payload` se avisó al kiosco; sin él, se descartó.
export function recentEntry({ event, decision, payload, now }) {
    const entry = { at: now.toISOString(), time: event.time, serialNo: event.serialNo, employeeNo: event.employeeNo };
    if (payload) {
        return { ...entry, outcome: payload.type, reason: payload.reason ?? null, name: payload.name ?? null, secondsAgo: payload.secondsAgo ?? null };
    }
    return { ...entry, outcome: decision.reason === 'fuera_de_tiempo' ? 'late' : 'ignored', reason: decision.reason, ageSeconds: decision.ageSeconds ?? null };
}

// listenerEnabled = «¿se escucha el terminal en este proceso?». BIOMETRIC_LISTENER
// manda si está escrita; si no, solo en producción, como los demás avisos.
export function listenerEnabled(flag, nodeEnv) {
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return nodeEnv === 'production';
}
