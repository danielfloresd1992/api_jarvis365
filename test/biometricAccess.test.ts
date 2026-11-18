import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHALLENGE_SECONDS, SESSION_MINUTES, newKioskToken, hashKioskToken, isKioskTokenShape, canLogIn, loginRejection,
    newChallenge, challengeAccepts, sessionAccess, accessCheck, kioskGuardDecision, loggedInUser,
} from '../src/apiServises/biometric/biometricAccess.lib.js';
import { startChallenge, offerFingerprint, challengeOutcome, cancelChallenge } from '../src/apiServises/biometric/biometricAccess.service.js';

// ══════════════════════════════════════════════════════════════════════
// ENTRAR A LA CONFIGURACIÓN DEL KIOSCO CON LA HUELLA
// ══════════════════════════════════════════════════════════════════════
// Lo que importa: que solo abra la puerta la huella de un administrador puesta
// DESPUÉS de pedir el acceso, en ESE terminal; que la sesión que da no sirva
// para nada más; y que una huella de cualquiera durante la espera no la abra.

const SECRET = 'una-clave-larga-de-prueba-para-cifrar-0123456789';
const T0 = new Date('2026-11-17T21:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const ADMIN = { _id: 'u-admin', name: 'Daniel', surName: 'Flores', admin: true, inabilited: false };
const EMPLEADO = { _id: 'u-emp', name: 'Paula', surName: 'Guzmán', admin: false };
const huella = (serialNo: number) => ({ serialNo, employeeNo: '25', time: '2026-11-17T17:00:05-04:00' });




test('Llave de la tablet: al azar, y en la base solo su firma', () => {
    const a = newKioskToken();
    const b = newKioskToken();
    assert.equal(isKioskTokenShape(a), true);
    assert.notEqual(a, b);
    assert.equal(hashKioskToken(a, SECRET), hashKioskToken(a, SECRET));
    assert.notEqual(hashKioskToken(a, SECRET), hashKioskToken(a, `${SECRET}-otra`));
    assert.ok(!hashKioskToken(a, SECRET).includes(a));
    for (const junk of ['', 'abc', `${a}x`, 7 as unknown as string, '../'.repeat(15)]) assert.equal(isKioskTokenShape(junk), false);
});

test('Quién puede entrar: un administrador habilitado, nadie más', () => {
    assert.equal(canLogIn(ADMIN), true);
    assert.equal(canLogIn(EMPLEADO), false);
    assert.equal(canLogIn({ ...ADMIN, inabilited: true }), false);
    assert.equal(canLogIn(null), false);
    assert.match(loginRejection(EMPLEADO, 'mark'), /Paula Guzmán no es administrador/);
    assert.match(loginRejection(null, 'mark'), /no está vinculada/);
    assert.match(loginRejection(null, 'rejected'), /no reconoció/);
});

test('Pedido: solo cuenta una huella puesta después de pedirlo, y antes de que venza', () => {
    const challenge = newChallenge({ terminal: 'principal', tokenId: 'k1', afterSerial: 47100, now: T0 });
    assert.equal(challenge.expiresAt - challenge.createdAt, CHALLENGE_SECONDS * 1000);
    assert.equal(challengeAccepts(challenge, { serialNo: 47101, eventAtMs: at(3).getTime() }, at(4)), true);
    assert.equal(challengeAccepts(challenge, { serialNo: 47100, eventAtMs: at(3).getTime() }, at(4)), false, 'ya estaba leída al pedirlo');
    assert.equal(challengeAccepts(challenge, { serialNo: 47101, eventAtMs: at(-10).getTime() }, at(4)), false, 'puesta antes de pedirlo');
    assert.equal(challengeAccepts(challenge, { serialNo: 47101, eventAtMs: at(31).getTime() }, at(31)), false, 'vencido');
    const fresh = newChallenge({ terminal: 'principal', tokenId: 'k1', afterSerial: null, now: T0 });
    assert.equal(challengeAccepts(fresh, { serialNo: 5, eventAtMs: at(1).getTime() }, at(2)), true, 'sin serie conocida, decide la hora');
});

test('Sesión con huella: solo ese terminal y vence sola; no es la de administrador', () => {
    const access = sessionAccess({ user: ADMIN, terminal: 'principal', now: T0 });
    assert.equal(access.expiresAt - access.at, SESSION_MINUTES * 60_000);
    assert.deepEqual(accessCheck(access, 'principal', at(60)), { ok: true });
    assert.equal(accessCheck(access, 'oficina-norte', at(60)).status, 403);
    assert.equal(accessCheck(access, 'principal', at(SESSION_MINUTES * 60 + 1)).status, 401);
    assert.equal(accessCheck(undefined, 'principal', T0).status, 401);
    assert.deepEqual(loggedInUser(access), { _id: 'u-admin', name: 'Daniel', surName: 'Flores', admin: true, via: 'huella', terminal: 'principal' });
});



test('Flujo: la huella del administrador abre, una sola vez, y no se toma como marcaje', () => {
    const { challengeId } = startChallenge({ terminal: 't-ok', tokenId: 'k1', afterSerial: 100, now: T0 });
    assert.deepEqual(challengeOutcome(challengeId, at(1)), { status: 'waiting', secondsLeft: CHALLENGE_SECONDS - 1 });
    const opened = offerFingerprint({ terminal: 't-ok', decision: 'mark', event: huella(101), user: ADMIN, eventAtMs: at(2).getTime(), now: at(3) });
    assert.equal(opened, true, 'la escucha no la avisa al kiosco como marcaje');
    assert.deepEqual(challengeOutcome(challengeId, at(4)), { status: 'approved', user: { _id: 'u-admin', name: 'Daniel', surName: 'Flores' }, terminal: 't-ok' });
    assert.equal(challengeOutcome(challengeId, at(5)).status, 'expired', 'el mismo pedido no da dos sesiones');
});

test('Flujo: la huella de quien no es administrador no abre, y sí cuenta como marcaje', () => {
    const { challengeId } = startChallenge({ terminal: 't-emp', tokenId: 'k1', afterSerial: 100, now: T0 });
    assert.equal(offerFingerprint({ terminal: 't-emp', decision: 'mark', event: huella(101), user: EMPLEADO, eventAtMs: at(2).getTime(), now: at(3) }), false);
    const outcome = challengeOutcome(challengeId, at(4));
    assert.equal(outcome.status, 'rejected');
    assert.match(outcome.message, /no es administrador/);
});

test('Flujo: huella no reconocida, huella vieja, otro terminal y tiempo vencido', () => {
    const rejected = startChallenge({ terminal: 't-49', tokenId: 'k1', afterSerial: 100, now: T0 });
    offerFingerprint({ terminal: 't-49', decision: 'rejected', event: { ...huella(101), employeeNo: null }, user: null, eventAtMs: at(2).getTime(), now: at(3) });
    assert.match(challengeOutcome(rejected.challengeId, at(4)).message, /no reconoció/);

    const old = startChallenge({ terminal: 't-old', tokenId: 'k1', afterSerial: 100, now: T0 });
    assert.equal(offerFingerprint({ terminal: 't-old', decision: 'mark', event: huella(99), user: ADMIN, eventAtMs: at(2).getTime(), now: at(3) }), false);
    assert.equal(offerFingerprint({ terminal: 'otro', decision: 'mark', event: huella(101), user: ADMIN, eventAtMs: at(2).getTime(), now: at(3) }), false);
    assert.equal(challengeOutcome(old.challengeId, at(4)).status, 'waiting', 'ninguna de esas huellas sirve');
    assert.equal(challengeOutcome(old.challengeId, at(CHALLENGE_SECONDS + 1)).status, 'expired');
});

test('Flujo: un pedido por terminal; la misma tablet puede repetirlo, otra no', () => {
    const first = startChallenge({ terminal: 't-uno', tokenId: 'k1', afterSerial: 100, now: T0 });
    assert.throws(() => startChallenge({ terminal: 't-uno', tokenId: 'k2', afterSerial: 100, now: at(1) }), /Ya hay un acceso con huella esperando/);
    const again = startChallenge({ terminal: 't-uno', tokenId: 'k1', afterSerial: 100, now: at(2) });
    assert.notEqual(again.challengeId, first.challengeId);
    assert.equal(challengeOutcome(first.challengeId, at(3)).status, 'expired', 'el anterior se descarta');
    cancelChallenge(again.challengeId);
    assert.equal(challengeOutcome(again.challengeId, at(4)).status, 'expired');
    assert.doesNotThrow(() => startChallenge({ terminal: 't-uno', tokenId: 'k2', afterSerial: 100, now: at(5) }), 'cancelado, otra tablet ya puede');
});



test('Guardián: la sesión con huella abre la configuración de SU terminal y de ninguno más', () => {
    const access = sessionAccess({ user: ADMIN, terminal: 'principal', now: T0 });
    assert.deepEqual(kioskGuardDecision({ session: { biometricAccess: access }, terminal: 'principal', now: at(60) }), { ok: true });
    const other = kioskGuardDecision({ session: { biometricAccess: access }, terminal: 'oficina-norte', now: at(60) });
    assert.equal(other.ok, false);
    assert.equal(other.status, 403);
    assert.equal(other.clearAccess, false, 'de otro terminal no se borra: sigue sirviendo en el suyo');
    const expired = kioskGuardDecision({ session: { biometricAccess: access }, terminal: 'principal', now: at(SESSION_MINUTES * 60 + 1) });
    assert.equal(expired.status, 401);
    assert.equal(expired.clearAccess, true, 'la vencida se borra');
});

test('Guardián: sin sesión con huella decide el guardián de siempre (validateAdminUser)', () => {
    assert.deepEqual(kioskGuardDecision({ session: {}, terminal: 'principal', now: T0 }), { delegate: true }, 'sin sesión: 401 de validateAdminUser');
    assert.deepEqual(kioskGuardDecision({ session: { name: 'Pedro', admin: false }, terminal: 'principal', now: T0 }), { delegate: true }, 'no administrador: 403 de validateAdminUser');
    const both = { name: 'Ana Admin', admin: true, biometricAccess: sessionAccess({ user: ADMIN, terminal: 'otro', now: T0 }) };
    assert.deepEqual(kioskGuardDecision({ session: both, terminal: 'principal', now: T0 }), { delegate: true }, 'con correo y contraseña manda la sesión de siempre');
});
