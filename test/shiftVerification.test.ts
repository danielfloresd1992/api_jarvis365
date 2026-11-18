import test from 'node:test';
import assert from 'node:assert/strict';
import {
    summaryQueryValidate, openValidate, checkValidate, recoveredRotationValidate, recoveredTouchValidate, closeValidate,
    PASSES, CHECK_STATUSES, ORIGINS, HISTORY_ACTIONS, DELAY_KINDS,
} from '../src/apiServises/shiftVerification/shiftVerification.schema.js';
import {
    secondsOfClock, operationalInstant, dayKeyOf, shiftOfRotation, isVerifiable, majorityCreator, syncEntries,
    operatorRotations, findEntry, passKey, finalCheck, checkOf, passProgress, passProblem, closeProblem, totalsOf,
    withSummary, summarizeDay, PEOPLE, historyEntry, DEFAULT_LIMIT, limitsOf, elapsedBetween, delaysOf,
} from '../src/apiServises/shiftVerification/shiftVerification.lib.js';
import ShiftVerificationModel from '../src/apiServises/shiftVerification/shiftVerification.model.js';

// ══════════════════════════════════════════════════════════════════════
// LA VERIFICACIÓN DE UN TURNO: qué entra, cómo se cuenta y cuándo se cierra
// ══════════════════════════════════════════════════════════════════════
// Lo que se prueba es lo que decide el resultado sin que se vea: qué rotaciones
// son del turno, que lo ya marcado no se pierda al ponerla al día, que el 100 %
// sea lo anotado que está en el video más lo recuperado, y que la segunda
// verificación no empiece antes de cerrar la primera.

const OPC = { abortEarly: false, stripUnknown: true };
const LOCAL = '507f1f77bcf86cd799439011';
const ANA = '507f1f77bcf86cd799439012';
const LUIS = '507f1f77bcf86cd799439013';
const VERIFICADORA = '507f1f77bcf86cd799439014';
const ROTACION = '507f1f77bcf86cd799439021';
const TOQUE = '507f1f77bcf86cd799439031';

// confirmed / notFound = «una marca», como la deja checkOf
const confirmed = { status: 'confirmed', note: '', checkedBy: VERIFICADORA, checkedAt: new Date('2026-11-07T15:00:00Z') };
const notFound = { status: 'notFound', note: '', checkedBy: VERIFICADORA, checkedAt: new Date('2026-11-07T15:00:00Z') };

// entry = «una rotación de la verificación», con sus toques
const entry = (rotation, fields = {}) => ({ rotation, origin: 'operator', first: null, second: null, touches: [], ...fields });
const touchEntry = (touch, fields = {}) => ({ touch, origin: 'operator', first: null, second: null, ...fields });



//  ── LAS CONSTANTES Y LOS ESQUEMAS ───────────────────────────────────────────

test('dos verificaciones, dos marcas y dos orígenes', () => {
    assert.deepEqual(PASSES, [1, 2]);
    assert.deepEqual(CHECK_STATUSES, ['confirmed', 'notFound']);
    assert.deepEqual(ORIGINS, ['operator', 'verification']);
});

test('abrir pide un local, un día que exista y un turno de los dos', async () => {
    const valid = await openValidate.validate({ establishment: LOCAL, day: '2026-11-06', shift: 'night', createdBy: ANA }, OPC);
    assert.deepEqual(valid, { establishment: LOCAL, day: '2026-11-06', shift: 'night' });

    await assert.rejects(openValidate.validate({ establishment: LOCAL, day: '2026-02-30', shift: 'day' }, OPC), /AAAA-MM-DD y existir/);
    await assert.rejects(openValidate.validate({ establishment: LOCAL, day: '2026-11-06', shift: 'all' }, OPC), /«day» o «night»/);
    await assert.rejects(openValidate.validate({ day: '2026-11-06', shift: 'day' }, OPC), /Falta el establecimiento/);
});

test('el resumen del día pide el día; el local es opcional', async () => {
    assert.deepEqual(await summaryQueryValidate.validate({ day: '2026-11-06' }, OPC), { day: '2026-11-06' });
    await assert.rejects(summaryQueryValidate.validate({}, OPC), /Falta el día operativo/);
    await assert.rejects(summaryQueryValidate.validate({ day: '2026-11-06', establishment: 'nope' }, OPC), /ObjectId/);
});

test('una marca: verificación 1 o 2, lo que dice o null para quitarla, y el toque opcional', async () => {
    const rotation = await checkValidate.validate({ pass: '2', rotation: ROTACION, status: 'notFound', note: '  no está  ' }, OPC);
    assert.deepEqual(rotation, { pass: 2, rotation: ROTACION, touch: null, status: 'notFound', note: 'no está' });

    const cleared = await checkValidate.validate({ pass: 1, rotation: ROTACION, touch: TOQUE, status: null }, OPC);
    assert.equal(cleared.status, null);
    assert.equal(cleared.touch, TOQUE);

    await assert.rejects(checkValidate.validate({ pass: 3, rotation: ROTACION, status: 'confirmed' }, OPC), /1 o 2/);
    await assert.rejects(checkValidate.validate({ pass: 1, rotation: ROTACION, status: 'maybe' }, OPC), /«confirmed» o «notFound»/);
    await assert.rejects(checkValidate.validate({ pass: 1, rotation: ROTACION }, OPC), /Falta lo que dice la verificación/);
});

test('una rotación recuperada es de una mesa y trae su hora de Ocupa', async () => {
    const valid = await recoveredRotationValidate.validate({ pass: 1, tableNumber: ' 12 ', hourOccupies: '13:05:00' }, OPC);
    assert.deepEqual(valid, { pass: 1, tableNumber: '12', hourOccupies: '13:05:00', hourFirstAttention: '', breakUp: '', tableCleaning: '' });

    await assert.rejects(recoveredRotationValidate.validate({ pass: 1, tableNumber: '#110', hourOccupies: '13:05:00' }, OPC), /no un pedido para llevar/);
    await assert.rejects(recoveredRotationValidate.validate({ pass: 1, tableNumber: '12' }, OPC), /Falta la hora de Ocupa/);
    await assert.rejects(recoveredRotationValidate.validate({ pass: 1, tableNumber: '12', hourOccupies: '1:05' }, OPC), /HH:MM:SS/);
});

test('un toque recuperado trae su gerente y su hora de inicio', async () => {
    const valid = await recoveredTouchValidate.validate({ pass: 2, name: 'G1', hourTouch: '13:10:00', hourTouchFinish: '13:10:40' }, OPC);
    assert.deepEqual(valid, { pass: 2, ref: null, name: 'G1', hourTouch: '13:10:00', hourTouchFinish: '13:10:40' });

    await assert.rejects(recoveredTouchValidate.validate({ pass: 1, hourTouch: '13:10:00' }, OPC), /Falta el gerente/);
    await assert.rejects(recoveredTouchValidate.validate({ pass: 1, name: 'G1' }, OPC), /Falta la hora de inicio/);
});

test('cerrar pide qué verificación', async () => {
    assert.deepEqual(await closeValidate.validate({ pass: 1 }, OPC), { pass: 1 });
    await assert.rejects(closeValidate.validate({}, OPC), /Falta qué verificación/);
});



//  ── LAS HORAS Y EL TURNO ────────────────────────────────────────────────────

test('una hora del día operativo: antes de las 08:00 es de la madrugada siguiente, en Caracas', () => {
    assert.equal(operationalInstant('2026-11-06', '13:05:00').toISOString(), '2026-11-06T17:05:00.000Z');
    assert.equal(operationalInstant('2026-11-06', '02:10:00').toISOString(), '2026-11-07T06:10:00.000Z');
    assert.equal(operationalInstant('2026-11-06', '08:00:00').toISOString(), '2026-11-06T12:00:00.000Z');
    assert.equal(operationalInstant('2026-11-06', '25:00:00'), null);
    assert.equal(dayKeyOf(new Date('2026-11-06T00:00:00.000Z')), '2026-11-06');
    assert.equal(secondsOfClock('13:05:10'), 47110);
    assert.equal(secondsOfClock('nada'), null);
});

test('el turno: el que trae la rotación; si no, el de su hora de Ocupa o el del momento en que nació', () => {
    assert.equal(shiftOfRotation({ shift: 'night', hourOccupies: '12:00:00' }), 'night');
    assert.equal(shiftOfRotation({ hourOccupies: '12:30:12' }), 'day');
    assert.equal(shiftOfRotation({ hourOccupies: '17:30:00' }), 'day');      //  la primera mitad del cambio de la tarde
    assert.equal(shiftOfRotation({ hourOccupies: '18:00:00' }), 'night');    //  la segunda
    assert.equal(shiftOfRotation({ hourOccupies: '07:30:00' }), 'night');    //  el cambio de la mañana es de la noche, que termina
    assert.equal(shiftOfRotation({ hourOccupies: '', date: '2026-11-06T16:00:00Z' }), 'day');   //  12:00 en Caracas
    assert.equal(shiftOfRotation({}), null);
});

test('se verifican las rotaciones de mesa del turno; los pedidos para llevar no', () => {
    assert.equal(isVerifiable({ tableNumber: '2', shift: 'night' }, 'night'), true);
    assert.equal(isVerifiable({ tableNumber: '2', shift: 'night' }, 'day'), false);
    assert.equal(isVerifiable({ tableNumber: '#110', shift: 'night' }, 'night'), false);
    assert.equal(isVerifiable({ tableNumber: '5', takeOut: true, shift: 'night' }, 'night'), false);
});



//  ── LAS ROTACIONES DEL TURNO ────────────────────────────────────────────────

test('el operador es quien creó la mayoría; en un empate, el que empezó antes', () => {
    const rotations = [
        { createdBy: ANA, date: '2026-11-06T23:10:00Z' },
        { createdBy: LUIS, date: '2026-11-06T23:00:00Z' },
        { createdBy: { _id: ANA, name: 'Ana' }, date: '2026-11-06T23:20:00Z' },
    ];
    assert.equal(String(majorityCreator(rotations)), ANA);
    assert.equal(String(majorityCreator(rotations.slice(0, 2))), LUIS);
    assert.equal(majorityCreator([]), null);
});

test('poner al día: entran las nuevas y sus toques, y lo ya marcado se queda', () => {
    const before = [entry('r1', { first: confirmed, touches: [touchEntry('t1', { first: confirmed }), touchEntry('t-borrado', { first: confirmed })] })];
    const rotations = [
        { _id: 'r1', touch: [{ _id: 't1' }, { _id: 't2' }] },
        { _id: 'r2', touch: [{ _id: 't3' }] },
    ];

    const { entries, added, removed } = syncEntries(before, rotations);

    assert.equal(added, 1);
    assert.equal(removed, 0);
    assert.deepEqual(entries.map(item => item.rotation), ['r1', 'r2']);
    assert.equal(entries[0].first, confirmed, 'la marca de la rotación sigue');
    assert.deepEqual(entries[0].touches.map(item => [item.touch, item.first?.status ?? null]), [['t1', 'confirmed'], ['t2', null]], 'el toque borrado sale y el nuevo entra');
    assert.deepEqual(entries[1].touches.map(item => item.touch), ['t3']);
    assert.equal(entries[1].origin, 'operator');
});

test('poner al día: una que ya no es del turno sale; una recuperada por la verificación se queda', () => {
    const before = [entry('r1'), entry('r-cambiada'), entry('r-recuperada', { origin: 'verification', first: confirmed })];
    const { entries, removed } = syncEntries(before, [{ _id: 'r1', touch: [] }]);
    assert.deepEqual(entries.map(item => item.rotation), ['r1', 'r-recuperada']);
    assert.equal(removed, 1);
});

test('las que anotó el operador son todas menos las recuperadas', () => {
    const rotations = [{ _id: 'r1' }, { _id: 'r2' }];
    assert.deepEqual(operatorRotations([entry('r1'), entry('r2', { origin: 'verification' })], rotations), [{ _id: 'r1' }]);
});

test('buscar una rotación (también poblada) y uno de sus toques', () => {
    const entries = [entry({ _id: 'r1' }, { touches: [touchEntry('t1')] })];
    assert.equal(findEntry(entries, 'r1').entry, entries[0]);
    assert.equal(findEntry(entries, 'r1', 't1').touchEntry, entries[0].touches[0]);
    assert.equal(findEntry(entries, 'r1', 't9'), null);
    assert.equal(findEntry(entries, 'r9'), null);
});



//  ── LAS DOS VERIFICACIONES ──────────────────────────────────────────────────

test('la marca: lo que dice, quién y cuándo; null la quita', () => {
    const now = new Date('2026-11-07T15:00:00Z');
    assert.deepEqual(checkOf({ status: 'confirmed', note: 'ok' }, VERIFICADORA, now), { status: 'confirmed', note: 'ok', checkedBy: VERIFICADORA, checkedAt: now });
    assert.equal(checkOf({ status: null }, VERIFICADORA, now), null);
    assert.equal(passKey(1), 'first');
    assert.equal(passKey('2'), 'second');
});

test('lo que queda: la segunda manda sobre la primera', () => {
    assert.equal(finalCheck({ first: confirmed, second: notFound }), notFound);
    assert.equal(finalCheck({ first: confirmed, second: null }), confirmed);
    assert.equal(finalCheck({ first: null, second: null }), null);
});

test('el avance cuenta rotaciones y toques; los toques de una que no existe no hay que mirarlos', () => {
    const entries = [
        entry('r1', { first: confirmed, touches: [touchEntry('t1', { first: confirmed }), touchEntry('t2')] }),
        entry('r2', { first: notFound, touches: [touchEntry('t3'), touchEntry('t4')] }),
        entry('r3'),
    ];
    assert.deepEqual(passProgress(entries, 1), { checked: 5, total: 7 });
    assert.deepEqual(passProgress(entries, 2), { checked: 0, total: 7 });
    assert.deepEqual(passProgress([], 1), { checked: 0, total: 0 });
});

test('la segunda empieza cuando se cierra la primera, y una cerrada ya no cambia', () => {
    assert.equal(passProblem({}, 1), null);
    assert.match(passProblem({}, 2), /empieza cuando se cierra la 1/);
    assert.equal(passProblem({ firstClosedAt: new Date() }, 2), null);
    assert.match(passProblem({ firstClosedAt: new Date() }, 1), /ya está cerrada/);
    assert.match(passProblem({ firstClosedAt: new Date(), secondClosedAt: new Date() }, 2), /ya está cerrada/);
});

test('cerrar pide todo marcado', () => {
    const pending = { rotations: [entry('r1', { first: confirmed, touches: [touchEntry('t1')] }), entry('r2')] };
    assert.match(closeProblem(pending, 1), /Faltan 2 por revisar en la verificación 1/);

    const done = { rotations: [entry('r1', { first: confirmed, touches: [touchEntry('t1', { first: notFound })] }), entry('r2', { first: notFound, touches: [touchEntry('t2')] })] };
    assert.equal(closeProblem(done, 1), null);
    assert.match(closeProblem(done, 2), /empieza cuando se cierra la 1/);
});



//  ── EL RESULTADO ────────────────────────────────────────────────────────────

test('el ejemplo del usuario: 45 anotadas, las 45 en el video y 1 recuperada → 46 son el 100 %', () => {
    const entries = [
        ...Array.from({ length: 45 }, (unused, index) => entry(`r${index}`, { first: confirmed })),
        entry('r-video', { origin: 'verification', first: confirmed }),
    ];
    const { rotations } = totalsOf(entries);
    assert.deepEqual(rotations, { recorded: 45, confirmed: 45, notFound: 0, pending: 0, recovered: 1, total: 46 });
});

test('lo anotado que no está en el video no cuenta en el 100 %; lo que nadie miró queda pendiente', () => {
    const entries = [entry('r1', { first: confirmed }), entry('r2', { first: notFound }), entry('r3')];
    assert.deepEqual(totalsOf(entries).rotations, { recorded: 3, confirmed: 1, notFound: 1, pending: 1, recovered: 0, total: 1 });
});

test('los toques igual, y los de una rotación que no existe tampoco existen', () => {
    const entries = [
        entry('r1', { first: confirmed, touches: [touchEntry('t1', { first: confirmed }), touchEntry('t2', { first: notFound }), touchEntry('t-video', { origin: 'verification', first: confirmed })] }),
        entry('r2', { first: notFound, touches: [touchEntry('t3', { first: confirmed })] }),
    ];
    assert.deepEqual(totalsOf(entries).touches, { recorded: 3, confirmed: 1, notFound: 2, pending: 0, recovered: 1, total: 2 });
});

test('el resultado sale de lo que quedó: la segunda corrige a la primera', () => {
    const entries = [
        entry('r1', { first: confirmed, second: notFound }),
        entry('r-video', { origin: 'verification', first: confirmed, second: notFound }),
    ];
    assert.deepEqual(totalsOf(entries).rotations, { recorded: 1, confirmed: 0, notFound: 1, pending: 0, recovered: 0, total: 0 });
});

test('la verificación sale con su resumen: el avance de cada una y el resultado de ahora', () => {
    const verification = { _id: 'v1', rotations: [entry('r1', { first: confirmed })] };
    const { summary } = withSummary(verification);
    assert.deepEqual(summary.first, { checked: 1, total: 1 });
    assert.deepEqual(summary.second, { checked: 0, total: 1 });
    assert.equal(summary.totals.rotations.total, 1);
});



//  ── EL RESUMEN DEL DÍA ──────────────────────────────────────────────────────

test('el día de cada local: sus turnos con rotaciones de mesa y cómo van sus verificaciones', () => {
    const rotations = [
        { establishment: LOCAL, shift: 'day', tableNumber: '2' },
        { establishment: LOCAL, shift: 'day', tableNumber: '4' },
        { establishment: LOCAL, hourOccupies: '20:15:00', tableNumber: '6' },
        { establishment: LOCAL, shift: 'night', tableNumber: '#110' },
        { establishment: ANA, shift: 'day', tableNumber: '1' },
    ];
    const closedAt = new Date('2026-11-07T14:00:00Z');
    const verifications = [{
        _id: 'v1', establishment: LOCAL, shift: 'day', operator: LUIS, firstClosedAt: closedAt, firstVerifier: VERIFICADORA,
        rotations: [entry('r1', { first: confirmed }), entry('r2', { first: confirmed })],
    }];

    const [local, other] = summarizeDay(rotations, verifications);

    assert.equal(local.establishment, LOCAL);
    assert.deepEqual(local.shifts.map(slot => [slot.shift, slot.rotations]), [['day', 2], ['night', 1]], 'el pedido para llevar no cuenta');
    assert.deepEqual(local.shifts[0].verification.first, { checked: 2, total: 2, closedAt, verifiedBy: VERIFICADORA });
    assert.deepEqual(local.shifts[0].verification.second, { checked: 0, total: 2, closedAt: null, verifiedBy: null });
    assert.equal(local.shifts[1].verification, null, 'la noche nadie la abrió');
    assert.deepEqual(other.shifts.map(slot => slot.shift), ['day']);
});



//  ── EL MODELO ───────────────────────────────────────────────────────────────

test('el modelo: una por local, día y turno, con sus tres personas y las rotaciones con sus marcas', () => {
    const verification = new ShiftVerificationModel({
        establishment: LOCAL,
        operationalDate: new Date('2026-11-06T00:00:00Z'),
        shift: 'night',
        operator: ANA,
        rotations: [{ rotation: ROTACION, first: { status: 'confirmed', checkedBy: VERIFICADORA }, touches: [{ touch: TOQUE }] }],
    });
    assert.equal(verification.validateSync(), undefined);
    assert.equal(verification.rotations[0].origin, 'operator');
    assert.equal(verification.rotations[0].second, null);
    assert.equal(verification.rotations[0].touches[0].origin, 'operator');
    assert.equal(verification.firstVerifier, null);
    assert.equal(verification.totals, null);

    const unique = ShiftVerificationModel.schema.indexes().find(([fields]) => fields.establishment === 1 && fields.operationalDate === 1 && fields.shift === 1);
    assert.equal(unique?.[1]?.unique, true);
});

test('el modelo rechaza un turno que no existe y una marca sin lo que dice', () => {
    const wrongShift = new ShiftVerificationModel({ establishment: LOCAL, operationalDate: new Date(), shift: 'evening' });
    assert.ok(wrongShift.validateSync()?.errors?.shift);

    const noStatus = new ShiftVerificationModel({ establishment: LOCAL, operationalDate: new Date(), shift: 'day', rotations: [{ rotation: ROTACION, first: { checkedBy: VERIFICADORA } }] });
    assert.ok(noStatus.validateSync()?.errors?.['rotations.0.first.status']);
});

test('viaja poblado: el local, las tres personas, cada rotación con quién la creó y quién hizo cada cosa', () => {
    assert.deepEqual(PEOPLE.map(item => item.path), ['establishment', 'operator', 'firstVerifier', 'secondVerifier', 'rotations.rotation', 'history.user']);
    assert.match(PEOPLE[4].select, /hourOccupies/);
    assert.match(PEOPLE[4].select, /touch/);
    assert.match(PEOPLE[4].select, /firstAttentionDelay/);
    assert.match(PEOPLE[4].select, /cleaningDelay/);
});



//  ── EL HISTORIAL ────────────────────────────────────────────────────────────

test('el historial apunta quién, qué, en cuál de las dos y de qué marca a cuál', () => {
    const now = new Date('2026-11-07T16:00:00Z');
    assert.deepEqual(historyEntry({ action: 'mark', userId: VERIFICADORA, pass: '2', rotation: ROTACION, from: 'confirmed', to: 'notFound', note: 'Mesa 4 a las 13:05:00', now }), {
        at: now, user: VERIFICADORA, action: 'mark', pass: 2, rotation: ROTACION, touch: null, from: 'confirmed', to: 'notFound', note: 'Mesa 4 a las 13:05:00',
    });
    //  Tomarla no es de ninguna rotación
    const claim = historyEntry({ action: 'claim', userId: ANA, pass: 1, now });
    assert.equal(claim.rotation, null);
    assert.equal(claim.from, null);
    assert.equal(claim.note, '');
});

test('el modelo guarda el historial y rechaza una acción que no existe o sin quién', () => {
    assert.deepEqual(HISTORY_ACTIONS, ['claim', 'resume', 'take', 'release', 'mark', 'recoverRotation', 'recoverTouch', 'close']);
    const valid = new ShiftVerificationModel({ establishment: LOCAL, operationalDate: new Date(), shift: 'day', history: [historyEntry({ action: 'close', userId: ANA, pass: 1 })] });
    assert.equal(valid.validateSync(), undefined);
    assert.equal(valid.history[0].action, 'close');

    const wrong = new ShiftVerificationModel({ establishment: LOCAL, operationalDate: new Date(), shift: 'day', history: [{ action: 'borrar', user: ANA }, { action: 'mark' }] });
    const errors = wrong.validateSync()?.errors ?? {};
    assert.ok(errors['history.0.action']);
    assert.ok(errors['history.1.user']);
});



//  ── LAS DEMORAS ─────────────────────────────────────────────────────────────

test('los límites del local; sin configurar (o en cero), el general de Jarvis Express', () => {
    assert.equal(DEFAULT_LIMIT, '00:03:30');
    assert.deepEqual(limitsOf({ firstAtenttion: '00:02:00', TableCleaning: '00:05:00' }), { attention: '00:02:00', cleaning: '00:05:00' });
    assert.deepEqual(limitsOf({ firstAtenttion: '00:00:00', TableCleaning: '' }), { attention: DEFAULT_LIMIT, cleaning: DEFAULT_LIMIT });
    assert.deepEqual(limitsOf(null), { attention: DEFAULT_LIMIT, cleaning: DEFAULT_LIMIT });
});

test('lo que pasó entre dos horas, también pasada la medianoche', () => {
    assert.equal(elapsedBetween('13:00:00', '13:04:10'), 250);
    assert.equal(elapsedBetween('23:59:00', '00:01:00'), 120);
    assert.equal(elapsedBetween('13:00:00', ''), null);
    assert.equal(elapsedBetween(null, '13:00:00'), null);
});

test('las demoras: las que pasan del límite y las reportadas, sin las mesas que no están en el video', () => {
    assert.deepEqual(DELAY_KINDS, ['attention', 'cleaning']);
    const MESA_LENTA = '507f1f77bcf86cd799439041';
    const MESA_SUCIA = '507f1f77bcf86cd799439042';
    const MESA_BIEN = '507f1f77bcf86cd799439043';
    const MESA_FANTASMA = '507f1f77bcf86cd799439044';
    const rotations = [
        { _id: MESA_LENTA, hourOccupies: '13:00:00', hourFirstAttention: '13:05:00', breakUp: '14:00:00', tableCleaning: '14:01:00', firstAttentionDelay: 'novedad1' },
        { _id: MESA_SUCIA, hourOccupies: '15:00:00', hourFirstAttention: '15:01:00', breakUp: '23:58:00', tableCleaning: '00:03:00', firstAttentionDelay: null, cleaningDelay: null },
        { _id: MESA_BIEN, hourOccupies: '16:00:00', hourFirstAttention: '16:01:00', breakUp: '17:00:00', tableCleaning: '17:01:00' },
        { _id: MESA_FANTASMA, hourOccupies: '18:00:00', hourFirstAttention: '18:30:00', breakUp: '', tableCleaning: '' },
    ];
    const entries = [
        entry(MESA_LENTA, { first: confirmed }),
        entry(MESA_SUCIA, { first: confirmed }),
        entry(MESA_BIEN, { first: confirmed }),
        entry(MESA_FANTASMA, { first: confirmed, second: notFound }),
    ];
    const delays = delaysOf(entries, rotations, { attention: '00:03:30', cleaning: '00:03:30' });

    assert.deepEqual(delays.limits, { attention: '00:03:30', cleaning: '00:03:30' });
    assert.equal(delays.attention, 1);   // la lenta (300 s); la fantasma no cuenta: la 2 dijo que no está
    assert.equal(delays.cleaning, 1);    // la sucia, pasada la medianoche (300 s)
    assert.equal(delays.reported, 1);    // la lenta la reportó el operador
    assert.deepEqual(delays.items, [
        { rotation: MESA_LENTA, kind: 'attention', seconds: 300, over: true, reported: true },
        { rotation: MESA_SUCIA, kind: 'cleaning', seconds: 300, over: true, reported: false },
    ]);
});

test('una demora reportada entra aunque no pase del límite, y las de una mesa sin horas no', () => {
    const MESA = '507f1f77bcf86cd799439045';
    const reportedOnly = delaysOf(
        [entry(MESA, { first: confirmed })],
        [{ _id: MESA, hourOccupies: '13:00:00', hourFirstAttention: '13:01:00', breakUp: '', tableCleaning: '', cleaningDelay: 'novedad2' }],
        { attention: '00:03:30', cleaning: '00:03:30' },
    );
    assert.equal(reportedOnly.attention, 0);
    assert.equal(reportedOnly.cleaning, 0);
    assert.equal(reportedOnly.reported, 1);
    assert.deepEqual(reportedOnly.items, [{ rotation: MESA, kind: 'cleaning', seconds: null, over: false, reported: true }]);

    const model = new ShiftVerificationModel({ establishment: LOCAL, operationalDate: new Date(), shift: 'day', delays: reportedOnly });
    assert.equal(model.validateSync(), undefined);
    assert.equal(model.delays.items[0].kind, 'cleaning');
});
