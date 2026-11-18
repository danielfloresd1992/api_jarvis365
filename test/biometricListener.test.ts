import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAcsEvent } from '../src/apiServises/biometric/biometric.lib.js';
import {
    pollCondition, seedSinceTime, eventAgeSeconds, fingerprintDecision, kioskPayload, recentEntry, listenerEnabled,
    fingerprintEventId, isFingerprintEventId, isKioskId, rememberForwarded, isClaimable,
    DEBOUNCE_MS, FRESH_SECONDS, MAX_SERIAL, CLAIM_WINDOW_MS,
} from '../src/apiServises/biometric/biometricStream.lib.js';

// ══════════════════════════════════════════════════════════════════════
// ESCUCHA: del registro del terminal al aviso para el kiosco
// ══════════════════════════════════════════════════════════════════════
// Los eventos tienen la forma exacta que devolvió el terminal en
// /ISAPI/AccessControl/AcsEvent el 2026-11-17. Lo que importa: que solo se pida
// lo nuevo, que una huella vieja no marque, que el reloj desajustado no bloquee
// los marcajes reales y que una doble huella no se convierta en entrada + salida
// sin que el kiosco diga nada.

// Una huella real del registro (serie 46991, empleado 25), tal como llega.
const RAW_EVENT = {
    major: 5, minor: 38, time: '2026-11-17T15:25:47-04:00', netUser: '', remoteHostAddr: '0.0.0.0', cardNo: '',
    cardType: 1, whiteListNo: 0, reportChannel: 0, cardReaderKind: 0, cardReaderNo: 1, doorNo: 1, verifyNo: 0,
    alarmInNo: 0, alarmOutNo: 0, caseSensorNo: 0, RS485No: 0, multiCardGroupNo: 0, accessChannel: 0, deviceNo: 0,
    distractControlNo: 0, employeeNoString: '25', localControllerID: 0, InternetAccess: 0, type: 0, MACAddr: '',
    swipeCardType: 0, serialNo: 46991, userType: 'normal', attendanceStatus: 'undefined', statusValue: 0,
};

// Leída 2 s después, con el reloj del terminal en hora (como quedó tras «Poner en hora»).
const AT_POLL = new Date('2026-11-17T19:25:49Z');

// eventWith = «la huella real, con algo cambiado»
const eventWith = (overrides: Record<string, unknown>) => ({ ...normalizeAcsEvent(RAW_EVENT), ...overrides });

const decide = (event: ReturnType<typeof eventWith>, options: { lastMarkAt?: Map<string, number>; now?: Date; driftSeconds?: number } = {}) =>
    fingerprintDecision({ event, lastMarkAt: options.lastMarkAt ?? new Map(), now: options.now ?? AT_POLL, driftSeconds: options.driftSeconds ?? 0 });



test('Consulta: conocida la última serie, se pide solo lo posterior, sin horas', () => {
    assert.deepEqual(pollCondition({ lastSerial: 46991, sinceTime: '2026-11-17T15:24:27-04:00' }), { beginSerialNo: 46992, endSerialNo: MAX_SERIAL });
});

test('Consulta: recién arrancada y sin serie, desde la hora del terminal en adelante', () => {
    assert.deepEqual(pollCondition({ lastSerial: null, sinceTime: '2026-11-17T15:24:27-04:00' }), {
        startTime: '2026-11-17T15:24:27-04:00', endTime: '2037-12-31T23:59:59-04:00',
    });
    assert.equal(pollCondition({ lastSerial: null, sinceTime: '2026-11-17T15:24:27-04:30' }).endTime, '2037-12-31T23:59:59-04:30', 'en el desfase del terminal');
});

test('Arranque: lo de los últimos minutos del terminal se da por conocido', () => {
    assert.equal(seedSinceTime('2026-11-17T15:34:27-04:00', 600), '2026-11-17T15:24:27-04:00');
    assert.equal(seedSinceTime('2026-11-17T11:58:09-04:30', 600), '2026-11-17T11:48:09-04:30', 'conserva el desfase del terminal');
    assert.equal(seedSinceTime(null, 600, new Date('2026-11-17T19:34:27Z')), '2026-11-17T15:24:27-04:00', 'sin hora del terminal, la del servidor');
});

test('Antigüedad: se corrige el reloj desajustado del terminal', () => {
    // El 2026-11-17 por la mañana iba 234 s adelantado: su 11:58:09 eran las 11:54:15 reales.
    assert.equal(eventAgeSeconds('2026-11-17T11:58:09-04:30', new Date('2026-11-17T15:54:20Z'), 234), 5);
    assert.equal(eventAgeSeconds('2026-11-17T11:58:09-04:30', new Date('2026-11-17T15:54:20Z'), 0), -229, 'sin corregir, parecería del futuro');
    assert.equal(eventAgeSeconds('ilegible', AT_POLL, 0), null);
});



test('Decisión: la huella recién puesta de alguien se marca', () => {
    assert.deepEqual(decide(eventWith({})), { action: 'mark' });
});

test('Decisión: una huella que llega minutos tarde no marca (lo que hacía alertStream)', () => {
    // Serie 46952: puesta a las 11:53:05 del terminal (11:49:11 reales) y entregada
    // por el flujo después del latido de las 11:57:12 (11:53:18 reales).
    const late = eventWith({ serialNo: 46952, time: '2026-11-17T11:53:05-04:30' });
    const decision = decide(late, { now: new Date('2026-11-17T15:53:20Z'), driftSeconds: 234 });
    assert.equal(decision.reason, 'fuera_de_tiempo');
    assert.equal(decision.ageSeconds, 249);
    assert.ok(decision.ageSeconds > FRESH_SECONDS);
});

test('Decisión: sin corregir el reloj, los marcajes reales se perderían', () => {
    const live = eventWith({ time: '2026-11-17T11:58:09-04:30' });
    assert.equal(decide(live, { now: new Date('2026-11-17T15:54:20Z'), driftSeconds: 0 }).reason, 'fuera_de_tiempo');
    assert.deepEqual(decide(live, { now: new Date('2026-11-17T15:54:20Z'), driftSeconds: 234 }), { action: 'mark' });
});

test('Decisión: la segunda huella de la misma persona dentro de un minuto no marca, pero se avisa', () => {
    const now = AT_POLL.getTime();
    assert.deepEqual(decide(eventWith({}), { lastMarkAt: new Map([['25', now - 7_000]]) }), { action: 'repeated', secondsAgo: 7 },
        'como dos huellas separadas 7 s: la API tomaría la segunda como salida');
    assert.deepEqual(decide(eventWith({}), { lastMarkAt: new Map([['25', now - DEBOUNCE_MS - 1]]) }), { action: 'mark' });
    assert.deepEqual(decide(eventWith({}), { lastMarkAt: new Map([['104', now - 7_000]]) }), { action: 'mark' }, 'otra persona sí marca');
});

test('Decisión: huella no registrada y eventos que no son marcajes', () => {
    assert.deepEqual(decide(eventWith({ minor: 49, employeeNo: null, serialNo: 46984, time: '2026-11-17T15:25:45-04:00' })), { action: 'rejected' });
    assert.equal(decide(eventWith({ major: 3, minor: 1028 })).reason, 'otro_evento');
    assert.equal(decide(eventWith({ employeeNo: null })).reason, 'sin_empleado');
});



test('Aviso al kiosco: la cédula del usuario vinculado, o por qué no se marca', () => {
    const event = eventWith({});
    const mark = { action: 'mark' };
    assert.deepEqual(kioskPayload(mark, event, { name: 'Daniel', surName: 'Flores', dni: '12345678', inabilited: false }), {
        type: 'mark', dni: '12345678', name: 'Daniel Flores', employeeNo: '25', serialNo: 46991, at: '2026-11-17T15:25:47-04:00',
    });
    assert.equal(kioskPayload(mark, event, null).reason, 'sin_vinculo');
    assert.equal(kioskPayload(mark, event, { name: 'A', surName: 'B', dni: '1', inabilited: true }).reason, 'deshabilitado');
    assert.equal(kioskPayload(mark, event, { name: 'A', surName: 'B', dni: null }).reason, 'sin_cedula');
    assert.equal(kioskPayload({ action: 'rejected' }, eventWith({ minor: 49, employeeNo: null }), null).type, 'rejected');
    assert.equal('dni' in kioskPayload(mark, event, null), false, 'sin vínculo no viaja ninguna cédula');
});

test('Aviso al kiosco: la huella repetida dice hace cuánto y cuánto falta', () => {
    const payload = kioskPayload({ action: 'repeated', secondsAgo: 7 }, eventWith({}), { name: 'Daniel', surName: 'Flores', dni: 12345678 });
    assert.deepEqual(payload, {
        type: 'repeated', name: 'Daniel Flores', dni: '12345678', secondsAgo: 7, waitSeconds: 53,
        employeeNo: '25', serialNo: 46991, at: '2026-11-17T15:25:47-04:00',
    });
    assert.equal(kioskPayload({ action: 'repeated', secondsAgo: 60 }, eventWith({}), null).waitSeconds, 1, 'nunca «espera 0 s»');
});

test('Historial: cada huella queda con lo que pasó, también las descartadas', () => {
    const event = eventWith({});
    const sent = recentEntry({ event, decision: { action: 'mark' }, payload: { type: 'mark', name: 'Daniel Flores', dni: '1' }, now: AT_POLL });
    assert.deepEqual(sent, {
        at: '2026-11-17T19:25:49.000Z', time: '2026-11-17T15:25:47-04:00', serialNo: 46991, employeeNo: '25',
        outcome: 'mark', reason: null, name: 'Daniel Flores', secondsAgo: null,
    });
    assert.equal('dni' in sent, false, 'la cédula no se guarda en el historial');
    const late = recentEntry({ event, decision: { action: 'ignore', reason: 'fuera_de_tiempo', ageSeconds: 249 }, now: AT_POLL });
    assert.equal(late.outcome, 'late');
    assert.equal(late.ageSeconds, 249);
});

test('Una huella, un marcaje: cada huella tiene un nombre que el kiosco reclama', () => {
    assert.equal(fingerprintEventId('principal', 46991), 'principal:46991');
    assert.equal(isFingerprintEventId('principal:46991'), true);
    assert.equal(isFingerprintEventId('oficina-centro:1'), true);
    for (const bad of ['principal', 'principal:', ':46991', 'Principal:1', 'principal:1:2', 'principal:-1', 'a b:1', 'principal:12345678901', 46991, null]) {
        assert.equal(isFingerprintEventId(bad), false, `${String(bad)} no es una huella`);
    }
    assert.equal(isKioskId('3f9c2a4e-7b1d-4c3a-9e2f-0a1b2c3d4e5f'), true);
    for (const bad of ['corto', 'con espacio dentro', 'x'.repeat(65), '<script>', null, 12345678]) {
        assert.equal(isKioskId(bad), false, `${String(bad)} no es un kiosco`);
    }
});

test('Una huella, un marcaje: solo se reclaman huellas avisadas hace poco', () => {
    const forwarded = new Map<string, number>();
    const start = 1_000_000;
    rememberForwarded(forwarded, 'principal:1', start);
    rememberForwarded(forwarded, 'principal:2', start + 1000);

    assert.equal(isClaimable(forwarded, 'principal:1', start + 5000), true);
    assert.equal(isClaimable(forwarded, 'principal:3', start + 5000), false, 'una huella que no se avisó (o futura) no se reclama');
    assert.equal(isClaimable(forwarded, 'principal:1', start + CLAIM_WINDOW_MS + 1), false, 'pasado el plazo, ya no');

    // Al avisar otra, se olvidan las vencidas y quedan las demás, en orden.
    rememberForwarded(forwarded, 'centro:9', start + CLAIM_WINDOW_MS + 500);
    assert.deepEqual([...forwarded.keys()], ['principal:2', 'centro:9']);
    rememberForwarded(forwarded, 'principal:2', start + CLAIM_WINDOW_MS + 600);
    assert.deepEqual([...forwarded.keys()], ['centro:9', 'principal:2'], 'la que se vuelve a avisar pasa al final');
});

test('Escucha: BIOMETRIC_LISTENER manda; sin ella, solo en producción', () => {
    assert.equal(listenerEnabled('true', 'development'), true);
    assert.equal(listenerEnabled('false', 'production'), false);
    assert.equal(listenerEnabled(undefined, 'production'), true);
    assert.equal(listenerEnabled(undefined, 'development'), false);
});
