import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_STATUSES, acquireValidate, sessionQueryValidate } from '../src/apiServises/verificationSession/verificationSession.schema.js';
import {
    IDLE_MS, SESSION_EVENT, SESSION_ACTIONS, isMine, isIdle, acquireOutcome, takeProblem, releaseProblem,
    guardDecision, personName, present, PEOPLE,
} from '../src/apiServises/verificationSession/verificationSession.lib.js';
import VerificationSessionModel from '../src/apiServises/verificationSession/verificationSession.model.js';

// ══════════════════════════════════════════════════════════════════════
// QUIÉN TIENE UNA VERIFICACIÓN: tomarla, reanudarla, quitársela a otro
// ══════════════════════════════════════════════════════════════════════
// Lo que se prueba es lo que decide el bloqueo: que una verificación sea de una
// sola persona, que quien cerró el navegador la reanude, que nadie se la quite a
// quien sigue trabajando (salvo un administrador) y que sin tenerla no se escriba.

const OPC = { abortEarly: false, stripUnknown: true };
const ANA = '507f1f77bcf86cd799439012';
const LUIS = '507f1f77bcf86cd799439013';
const VERIFICACION = '507f1f77bcf86cd799439051';
const LOCAL = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-11-07T16:00:00Z');

// sessionOf = «una sesión activa», de quien sea y con su última señal hace `minutes`
const sessionOf = (user, minutes = 1, fields = {}) => ({
    _id: '507f1f77bcf86cd799439061',
    verification: VERIFICACION,
    pass: 1,
    user,
    status: 'active',
    operationalDate: new Date('2026-11-06T00:00:00Z'),
    lastSeenAt: new Date(NOW.getTime() - minutes * 60 * 1000),
    ...fields,
});



test('las constantes: 15 minutos, un aviso y cinco cosas que se avisan', () => {
    assert.equal(IDLE_MS, 15 * 60 * 1000);
    assert.equal(SESSION_EVENT, 'verification-session');
    assert.deepEqual(SESSION_ACTIONS, ['claim', 'resume', 'take', 'release', 'close']);
    assert.deepEqual(SESSION_STATUSES, ['active', 'closed', 'released', 'taken', 'expired']);
});

test('tomarla pide la verificación y cuál de las dos; quién, nunca del body', async () => {
    assert.deepEqual(await acquireValidate.validate({ verification: VERIFICACION, pass: '2', user: LUIS }, OPC), { verification: VERIFICACION, pass: 2 });
    await assert.rejects(acquireValidate.validate({ verification: VERIFICACION, pass: 3 }, OPC), /1 o 2/);
    await assert.rejects(acquireValidate.validate({ pass: 1 }, OPC), /Falta la verificación/);
    await assert.rejects(sessionQueryValidate.validate({ day: '2026-13-01' }, OPC), /AAAA-MM-DD/);
});

test('de quién es, poblada o no', () => {
    assert.equal(isMine(sessionOf(ANA), ANA), true);
    assert.equal(isMine(sessionOf({ _id: ANA, name: 'Ana' }), ANA), true);
    assert.equal(isMine(sessionOf(ANA), LUIS), false);
    assert.equal(isMine(null, ANA), false);
    assert.equal(isMine(sessionOf(ANA), null), false);
});

test('inactiva: más de 15 minutos sin señales', () => {
    assert.equal(isIdle(sessionOf(ANA, 14), NOW), false);
    assert.equal(isIdle(sessionOf(ANA, 16), NOW), true);
    assert.equal(isIdle(sessionOf(ANA, 1, { lastSeenAt: null }), NOW), true);
});

test('al abrir: la reanuda quien la tiene, la mira quien no, y una persona no lleva dos a la vez', () => {
    //  Cerró el navegador hace una hora: sigue siendo suya
    assert.deepEqual(acquireOutcome({ held: sessionOf(ANA, 60), own: sessionOf(ANA, 60), userId: ANA, now: NOW }), { outcome: 'resume' });
    assert.deepEqual(acquireOutcome({ held: sessionOf(ANA, 2), own: null, userId: LUIS, now: NOW }), { outcome: 'busy', idle: false });
    assert.deepEqual(acquireOutcome({ held: sessionOf(ANA, 20), own: null, userId: LUIS, now: NOW }), { outcome: 'busy', idle: true });
    assert.deepEqual(acquireOutcome({ held: null, own: sessionOf(LUIS, 1, { verification: 'otra' }), userId: LUIS, now: NOW }), { outcome: 'elsewhere' });
    assert.deepEqual(acquireOutcome({ held: null, own: null, userId: LUIS, now: NOW }), { outcome: 'acquire' });
});

test('quitársela a otro: solo si lleva un rato sin señales, o siendo administrador', () => {
    assert.match(takeProblem(sessionOf(ANA, 2), { userId: LUIS, now: NOW }), /15 minutos sin actividad/);
    assert.equal(takeProblem(sessionOf(ANA, 20), { userId: LUIS, now: NOW }), null);
    assert.equal(takeProblem(sessionOf(ANA, 2), { userId: LUIS, isAdmin: true, now: NOW }), null);
    assert.match(takeProblem(sessionOf(ANA, 20), { userId: ANA, now: NOW }), /ya es tuya/);
    assert.match(takeProblem(sessionOf(ANA, 20, { status: 'released' }), { userId: LUIS, now: NOW }), /ya no la tiene nadie/);
    assert.match(takeProblem(null, { userId: LUIS, now: NOW }), /ya no la tiene nadie/);
});

test('soltarla: quien la tiene, o un administrador', () => {
    assert.equal(releaseProblem(sessionOf(ANA), { userId: ANA }), null);
    assert.equal(releaseProblem(sessionOf(ANA), { userId: LUIS, isAdmin: true }), null);
    assert.match(releaseProblem(sessionOf(ANA), { userId: LUIS }), /Solo quien la tiene/);
    assert.match(releaseProblem(sessionOf(ANA, 1, { status: 'closed' }), { userId: ANA }), /ya no está tomada/);
});

test('sin tenerla no se escribe: ni si es de otra persona, ni si no es de nadie', () => {
    assert.equal(guardDecision(sessionOf(ANA), ANA), null);
    const busy = guardDecision(sessionOf({ _id: ANA, name: 'Ana', surName: 'Pérez' }), LUIS);
    assert.equal(busy.code, 'busy');
    assert.match(busy.message, /Ana Pérez/);
    assert.equal(guardDecision(null, LUIS).code, 'unclaimed');
});

test('el nombre de una persona, y «otra persona» si no viene', () => {
    assert.equal(personName({ name: 'Ana', surName: 'Pérez' }), 'Ana Pérez');
    assert.equal(personName({ name: 'Ana' }), 'Ana');
    assert.equal(personName(null), 'otra persona');
});

test('la sesión como la recibe el panel: su día, si es mía y si ya se puede tomar', () => {
    const shown = present(sessionOf(ANA, 20), ANA, NOW);
    assert.equal(shown.day, '2026-11-06');
    assert.equal(shown.mine, true);
    assert.equal(shown.idle, true);
    assert.equal(present(null, ANA, NOW), null);
});

test('el modelo: una sesión activa por verificación y por persona, solo entre las activas', () => {
    const indexes = VerificationSessionModel.schema.indexes();
    const unique = indexes.filter(([, options]) => options?.unique);
    assert.deepEqual(unique.map(([fields]) => Object.keys(fields)), [['verification', 'pass'], ['user']]);
    for (const [, options] of unique) assert.deepEqual(options.partialFilterExpression, { status: 'active' });

    const valid = new VerificationSessionModel({ verification: VERIFICACION, pass: 1, establishment: LOCAL, operationalDate: new Date(), shift: 'day', user: ANA });
    assert.equal(valid.validateSync(), undefined);
    assert.equal(valid.status, 'active');

    const wrong = new VerificationSessionModel({ verification: VERIFICACION, pass: 3, establishment: LOCAL, operationalDate: new Date(), shift: 'day', status: 'paused' });
    const errors = wrong.validateSync()?.errors ?? {};
    assert.ok(errors.pass);
    assert.ok(errors.status);
    assert.ok(errors.user);
});

test('viaja poblada: quién la tiene, quién la terminó y el local', () => {
    assert.deepEqual(PEOPLE.map(item => item.path), ['user', 'endedBy', 'establishment']);
});
