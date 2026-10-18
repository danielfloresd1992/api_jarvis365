import test from 'node:test';
import assert from 'node:assert/strict';
import { rotationValidate, rotationQueryValidate, rotationTargetValidate, dayToDate, MAX_RANGE_DAYS, SHIFTS } from '../src/apiServises/rotation/rotation.schema.js';
import { applyEdit, targetOf, isTakeOutTable, rotationEvent, ROTATION_METHODS, PEOPLE, addTouchTo, removeTouchFrom } from '../src/apiServises/rotation/rotation.lib.js';
import RotationModel from '../src/apiServises/rotation/rotation.model.js';
import { operationalDateOf } from '../src/apiServises/dvrFailure/dvrFailure.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// EL CICLO DE LA ROTACIÓN: lo que entra y cómo se pide por fechas
// ══════════════════════════════════════════════════════════════════════
// Lo que se prueba es lo que no se ve desde fuera hasta que los datos no cuadran:
// que el autor no se pueda mandar en el body, que una hora mal escrita se rechace
// en vez de guardarse, y que el rango de fechas caiga en los mismos días que
// guarda el modelo.

const OPC = { abortEarly: false, stripUnknown: true };
const ID = '507f1f77bcf86cd799439011';

const ROTACION = {
    establishment: ID,
    clientId: '0414fbd2-da42-4c41-829c-f21dd4271d23',
    date: '2026-10-11T14:02:10.000Z',
    tableNumber: '30',
    hourOccupies: '10:09:12',
    process: [{ ticketNumber: '118', dishType: 'PF', orderTaking: '10:05:10', markedReadyOnTablet: '10:19:40' }],
    touch: [{ ref: ID, name: 'Daylin Acosta', hourTouch: '10:03:07', createdAt: '2026-10-11T14:03:07.412Z' }],
};


test('una rotación completa pasa, con los campos que faltan en su valor por defecto', async () => {
    const valida = await rotationValidate.validate(ROTACION, OPC);
    assert.equal(valida.tableNumber, '30');
    assert.equal(valida.breakUp, '');
    assert.equal(valida.process[0].dishDelivery, '');
    assert.equal(valida.touch[0].name, 'Daylin Acosta');
});

test('el autor no se puede mandar en el body: sale de la sesión', async () => {
    const valida = await rotationValidate.validate({ ...ROTACION, createdBy: ID, operationalDate: '2020-01-01' }, OPC);
    assert.equal('createdBy' in valida, false);
    assert.equal('operationalDate' in valida, false);
});

test('un toque sin gerente de Manager (botón de las cantidades) pasa con ref null', async () => {
    const valida = await rotationValidate.validate({ ...ROTACION, touch: [{ ref: null, name: 'G1', hourTouch: '10:03:07' }] }, OPC);
    assert.equal(valida.touch[0].ref, null);
    assert.equal(valida.touch[0].createdAt, null);
});

test('rechaza una hora mal escrita, sin mesa, o un establecimiento que no es ObjectId', async () => {
    await assert.rejects(rotationValidate.validate({ ...ROTACION, hourOccupies: '25:00:00' }, OPC), /HH:MM:SS/);
    await assert.rejects(rotationValidate.validate({ ...ROTACION, process: [{ orderTaking: '10:5' }] }, OPC), /HH:MM:SS/);
    await assert.rejects(rotationValidate.validate({ ...ROTACION, tableNumber: '  ' }, OPC), /número de mesa/);
    await assert.rejects(rotationValidate.validate({ ...ROTACION, establishment: 'local-30' }, OPC), /ObjectId/);
});


test('la consulta por fechas: un día, o un rango con los dos extremos incluidos', async () => {
    const unDia = await rotationQueryValidate.validate({ establishment: ID, from: '2026-10-11' }, OPC);
    assert.equal(unDia.from, '2026-10-11');
    assert.equal(unDia.to, undefined);   // el controlador lo toma como `from`

    const rango = await rotationQueryValidate.validate({ establishment: ID, from: '2026-10-01', to: '2026-10-11' }, OPC);
    assert.equal(rango.to, '2026-10-11');
});

test('la consulta por fechas acepta el establecimiento por su nombre, en vez de su id', async () => {
    const porNombre = await rotationQueryValidate.validate({ name: ' Bucare ', from: '2026-10-11' }, OPC);
    assert.equal(porNombre.name, 'Bucare');
    assert.equal(porNombre.establishment, undefined);
});

test('la consulta rechaza días que no existen, un rango al revés y uno demasiado largo', async () => {
    await assert.rejects(rotationQueryValidate.validate({ establishment: ID, from: '2026-02-30' }, OPC), /from/);
    await assert.rejects(rotationQueryValidate.validate({ establishment: ID, from: '11-10-2026' }, OPC), /from/);
    await assert.rejects(rotationQueryValidate.validate({ establishment: ID, from: '2026-10-11', to: '2026-10-01' }, OPC), /rango/);
    await assert.rejects(rotationQueryValidate.validate({ establishment: ID, from: '2026-01-01', to: '2026-12-31' }, OPC), new RegExp(String(MAX_RANGE_DAYS)));
    await assert.rejects(rotationQueryValidate.validate({ from: '2026-10-11' }, OPC), /establecimiento/);
});

test('el día pedido es el mismo que guarda el modelo: una mesa de las 02:00 es del día anterior', () => {
    // 14:02 en Caracas del 11 → día operativo 11; 02:30 en Caracas del 12 → todavía el 11
    assert.deepEqual(operationalDateOf('2026-10-11T18:02:00.000Z'), dayToDate('2026-10-11'));
    assert.deepEqual(operationalDateOf('2026-10-12T06:30:00.000Z'), dayToDate('2026-10-11'));
});


test('el modelo: referencias, autor inmutable y la misma rotación una sola vez por establecimiento', () => {
    const esquema = RotationModel.schema;
    assert.equal(esquema.path('establishment').options.ref, 'Local');
    assert.equal(esquema.path('createdBy').options.ref, 'user');
    assert.equal(esquema.path('createdBy').options.immutable, true);
    assert.equal(esquema.path('touch').schema.path('ref').options.ref, 'Manager');

    const unico = esquema.indexes().find(([campos]) => campos.establishment === 1 && campos.clientId === 1);
    assert.ok(unico, 'falta el índice de establishment + clientId');
    assert.equal(unico[1].unique, true);
});

test('los cambios: nacen vacíos, no se mandan en el body, y procesos y toques tienen _id para señalarlos', async () => {
    const valida = await rotationValidate.validate({ ...ROTACION, changes: [{ user: ID, property: 'tableNumber' }] }, OPC);
    assert.equal('changes' in valida, false);

    const rotacion = new RotationModel({ ...valida, operationalDate: operationalDateOf(valida.date), createdBy: ID });
    assert.deepEqual(rotacion.changes.toObject(), []);
    assert.ok(rotacion.process[0]._id, 'el proceso no tiene _id');
    assert.ok(rotacion.touch[0]._id, 'el toque no tiene _id');

    const cambio = RotationModel.schema.path('changes').schema;
    assert.equal(cambio.path('user').options.ref, 'user');
    assert.deepEqual(Object.keys(cambio.paths).sort(), ['changedAt', 'newValue', 'oldValue', 'property', 'target', 'user']);
});



// ── PUT /rotation/id=:id — corregir lo guardado (applyEdit, sin Mongo) ──

const OTRO = '507f1f77bcf86cd799439022';

// guardada = «una rotación como la que devuelve findOne»: un documento de Mongoose, con _id en sus procesos y toques
const guardada = async () => {
    const valida = await rotationValidate.validate(ROTACION, OPC);
    return new RotationModel({ ...valida, operationalDate: operationalDateOf(valida.date), createdBy: ID });
};


test('corregir la rotación: cambia la propiedad y anota quién, en qué, y el antes y el después', async () => {
    const rotacion = await guardada();
    const cambios = await applyEdit(rotacion, String(rotacion._id), { tableNumber: ' 33 ', hourOccupies: '10:09:12' }, OTRO);

    assert.equal(rotacion.tableNumber, '33');
    assert.equal(cambios.length, 1, 'Ocupa no cambió: no se anota');
    assert.equal(rotacion.changes.length, 1);

    const linea = rotacion.changes[0];
    assert.equal(String(linea.user), OTRO);
    assert.equal(String(linea.target), String(rotacion._id));
    assert.equal(linea.property, 'tableNumber');
    assert.equal(linea.oldValue, '30');
    assert.equal(linea.newValue, '33');
    assert.ok(linea.changedAt instanceof Date);
});

test('corregir un proceso o un toque por su _id, sin tocar lo demás', async () => {
    const rotacion = await guardada();
    const proceso = rotacion.process[0];
    const toque = rotacion.touch[0];

    await applyEdit(rotacion, String(proceso._id), { dishDelivery: '10:59:00', dishType: 'POSTRE' }, OTRO);
    await applyEdit(rotacion, String(toque._id), { hourTouch: '10:45:00' }, OTRO);

    assert.equal(proceso.dishDelivery, '10:59:00');
    assert.equal(proceso.dishType, 'POSTRE');
    assert.equal(proceso.ticketNumber, '118', 'lo que no se mandó sigue igual');
    assert.equal(toque.hourTouch, '10:45:00');
    assert.deepEqual(rotacion.changes.map(linea => [linea.property, linea.oldValue, linea.newValue]), [
        ['dishDelivery', '', '10:59:00'],
        ['dishType', 'PF', 'POSTRE'],
        ['hourTouch', '10:03:07', '10:45:00'],
    ]);
    assert.equal(String(rotacion.changes[2].target), String(toque._id));
});

test('lo que identifica no se corrige: el local, el clientId, la fecha, el gerente y el momento del toque', async () => {
    const rotacion = await guardada();
    const local = String(rotacion.establishment);
    await applyEdit(rotacion, String(rotacion._id), { establishment: OTRO, clientId: 'otro', tableNumber: '31' }, OTRO);
    assert.equal(String(rotacion.establishment), local);
    assert.equal(rotacion.clientId, ROTACION.clientId);
    assert.deepEqual(rotacion.changes.map(linea => linea.property), ['tableNumber']);

    const toque = rotacion.touch[0];
    await assert.rejects(applyEdit(rotacion, String(toque._id), { ref: OTRO, createdAt: '2020-01-01' }, OTRO), /nada que corregir/);
    assert.equal(String(toque.ref), ID);
});

test('rechaza un valor que no vale, un body sin nada que corregir, la mesa vacía y un id ajeno', async () => {
    const rotacion = await guardada();
    await assert.rejects(applyEdit(rotacion, String(rotacion._id), { hourOccupies: '25:00:00' }, OTRO), /HH:MM:SS/);
    await assert.rejects(applyEdit(rotacion, String(rotacion._id), { tableNumber: '   ' }, OTRO), /número de mesa/);
    await assert.rejects(applyEdit(rotacion, String(rotacion._id), {}, OTRO), /nada que corregir/);
    await assert.rejects(applyEdit(rotacion, OTRO, { tableNumber: '31' }, OTRO), /no es de esta rotación/);
    assert.equal(rotacion.changes.length, 0, 'nada rechazado deja rastro');

    assert.equal(targetOf(rotacion, OTRO), null);
    await assert.rejects(rotationTargetValidate.validate('mesa-30'), /ObjectId/);
});


test('pedido para llevar: la mesa con «#» delante es un ticket, no una mesa', () => {
    assert.equal(isTakeOutTable('#110'), true);
    assert.equal(isTakeOutTable(' #110 '), true);
    assert.equal(isTakeOutTable('33'), false);
    assert.equal(isTakeOutTable('B7'), false);
    assert.equal(isTakeOutTable(''), false);
    assert.equal(isTakeOutTable(undefined), false);
});

test('takeOut sale de la mesa al validar: no se manda, y no puede contradecirla', async () => {
    const paraLlevar = await rotationValidate.validate({ ...ROTACION, tableNumber: '#110', hourOccupies: '' }, OPC);
    const rotacion = new RotationModel({ ...paraLlevar, operationalDate: operationalDateOf(paraLlevar.date), createdBy: ID });
    assert.equal(rotacion.takeOut, false, 'nace en false');
    await rotacion.validate();
    assert.equal(rotacion.takeOut, true);

    const mentirosa = new RotationModel({ ...paraLlevar, tableNumber: '30', takeOut: true, operationalDate: operationalDateOf(paraLlevar.date), createdBy: ID });
    await mentirosa.validate();
    assert.equal(mentirosa.takeOut, false, 'una mesa de verdad no es para llevar aunque el body diga que sí');

    const valida = await rotationValidate.validate({ ...ROTACION, takeOut: true }, OPC);
    assert.equal('takeOut' in valida, false, 'el body no lo trae: lo decide la mesa');
});

test('corregir la mesa cambia takeOut con ella', async () => {
    const rotacion = await guardada();
    await applyEdit(rotacion, String(rotacion._id), { tableNumber: '#110' }, OTRO);
    await rotacion.validate();
    assert.equal(rotacion.takeOut, true);

    await applyEdit(rotacion, String(rotacion._id), { tableNumber: '28' }, OTRO);
    await rotacion.validate();
    assert.equal(rotacion.takeOut, false);
});

test('el aviso en vivo: un evento por local y por método, con las personas del GET', () => {
    assert.deepEqual(ROTATION_METHODS, ['post', 'put']);
    assert.equal(rotationEvent('post', 'Francisca Doral'), 'Francisca Doral-post');
    assert.equal(rotationEvent('put', 'Francisca Doral'), 'Francisca Doral-put');
    assert.deepEqual(PEOPLE.map(person => person.path), ['createdBy', 'changes.user']);
});

test('añadir un toque a una rotación guardada: con su _id, su momento y su línea en los cambios', async () => {
    const rotacion = await guardada();
    const toque = await addTouchTo(rotacion, { ref: ID, name: 'Daniel Flores', hourTouch: '10:45:00', createdBy: OTRO }, OTRO);

    assert.equal(rotacion.touch.length, 2);
    assert.ok(toque._id, 'nace con _id, para poder corregirlo o quitarlo');
    assert.ok(toque.createdAt instanceof Date, 'sin createdAt se toma ahora');
    assert.deepEqual(rotacion.changes.map(linea => [linea.property, linea.oldValue, linea.newValue, String(linea.target)]), [
        ['touch', null, 'Daniel Flores · 10:45:00', String(toque._id)],
    ]);
});

test('no se añade un toque sin hora, ni a un pedido para llevar', async () => {
    const rotacion = await guardada();
    await assert.rejects(addTouchTo(rotacion, { name: 'Daniel Flores' }, OTRO), /hora del toque/);
    await assert.rejects(addTouchTo(rotacion, { name: 'Daniel Flores', hourTouch: '25:00:00' }, OTRO), /HH:MM:SS/);

    rotacion.tableNumber = '#110';
    await assert.rejects(addTouchTo(rotacion, { name: 'Daniel Flores', hourTouch: '10:45:00' }, OTRO), /para llevar/);
    assert.equal(rotacion.touch.length, 1);
    assert.equal(rotacion.changes.length, 0, 'nada rechazado deja rastro');
});

test('quitar un toque: sale de la lista y deja su línea en los cambios; uno ajeno no se quita', async () => {
    const rotacion = await guardada();
    const toque = rotacion.touch[0];

    assert.throws(() => removeTouchFrom(rotacion, OTRO, OTRO), /no es de esta rotación/);
    assert.equal(rotacion.changes.length, 0);

    removeTouchFrom(rotacion, String(toque._id), OTRO);
    assert.equal(rotacion.touch.length, 0);
    assert.deepEqual(rotacion.changes.map(linea => [linea.property, linea.oldValue, linea.newValue, String(linea.target)]), [
        ['touch', 'Daylin Acosta · 10:03:07', null, String(toque._id)],
    ]);
});

test('el turno: solo «day» o «night», y sin mandarlo queda en null', async () => {
    assert.deepEqual(SHIFTS, ['day', 'night']);

    assert.equal((await rotationValidate.validate({ ...ROTACION, shift: 'day' }, OPC)).shift, 'day');
    assert.equal((await rotationValidate.validate({ ...ROTACION, shift: 'night' }, OPC)).shift, 'night');
    assert.equal((await rotationValidate.validate(ROTACION, OPC)).shift, null, 'sin mandarlo');
    assert.equal((await rotationValidate.validate({ ...ROTACION, shift: null }, OPC)).shift, null);

    for (const malo of ['nigth', 'Day', 'tarde', '']) {
        await assert.rejects(rotationValidate.validate({ ...ROTACION, shift: malo }, OPC), /turno solo puede ser/, JSON.stringify(malo));
    }
});

test('el turno en el modelo: el enum rechaza lo que no sea day o night, y se corrige con el PUT', async () => {
    const valida = await rotationValidate.validate(ROTACION, OPC);
    const base = { ...valida, operationalDate: operationalDateOf(valida.date), createdBy: ID };

    const sinTurno = new RotationModel(base);
    assert.equal(sinTurno.shift, null);
    await sinTurno.validate();

    await new RotationModel({ ...base, shift: 'night' }).validate();
    await assert.rejects(new RotationModel({ ...base, shift: 'nigth' }).validate(), /shift/);

    const rotacion = await guardada();
    await applyEdit(rotacion, String(rotacion._id), { shift: 'night' }, OTRO);
    assert.equal(rotacion.shift, 'night');
    assert.deepEqual(rotacion.changes.map(linea => [linea.property, linea.oldValue, linea.newValue]), [['shift', null, 'night']]);
    await assert.rejects(applyEdit(rotacion, String(rotacion._id), { shift: 'tarde' }, OTRO), /turno solo puede ser/);
});

test('recovered: una marca de la rotación y de cada toque, false si no se manda', async () => {
    const sinMarca = await rotationValidate.validate(ROTACION, OPC);
    assert.equal(sinMarca.recovered, false, 'la rotación, sin mandarla');
    assert.equal(sinMarca.touch[0].recovered, false, 'el toque, sin mandarla');

    const conMarca = await rotationValidate.validate({ ...ROTACION, recovered: true, touch: [{ ...ROTACION.touch[0], recovered: true }] }, OPC);
    assert.equal(conMarca.recovered, true);
    assert.equal(conMarca.touch[0].recovered, true);

    await assert.rejects(rotationValidate.validate({ ...ROTACION, recovered: 'quizás' }, OPC), /recovered» de la rotación/);
    await assert.rejects(rotationValidate.validate({ ...ROTACION, touch: [{ ...ROTACION.touch[0], recovered: 'quizás' }] }, OPC), /recovered» del toque/);
});

test('recovered en el modelo: nace en false, se guarda, y se corrige con el PUT en la rotación y en el toque', async () => {
    const valida = await rotationValidate.validate(ROTACION, OPC);
    const base = { ...valida, operationalDate: operationalDateOf(valida.date), createdBy: ID };

    const { recovered, touch, ...sinMarcas } = base;
    const vieja = new RotationModel({ ...sinMarcas, touch: touch.map(({ recovered: marca, ...resto }) => resto) });
    assert.equal(vieja.recovered, false, 'una rotación que llega sin el campo');
    assert.equal(vieja.touch[0].recovered, false, 'un toque que llega sin el campo');

    const rotacion = await guardada();
    await applyEdit(rotacion, String(rotacion._id), { recovered: true }, OTRO);
    assert.equal(rotacion.recovered, true);

    const toque = rotacion.touch[0];
    await applyEdit(rotacion, String(toque._id), { recovered: true }, OTRO);
    assert.equal(rotacion.touch[0].recovered, true);
    assert.deepEqual(rotacion.changes.map(linea => [linea.property, linea.oldValue, linea.newValue]), [['recovered', false, true], ['recovered', false, true]]);

    const nuevo = await addTouchTo(rotacion, { name: 'G1', hourTouch: '10:50:00', recovered: true }, OTRO);
    assert.equal(nuevo.recovered, true, 'un toque añadido después también la lleva');
});

test('hourTouchFinish: la hora de fin del toque, se guarda, se valida y se corrige con el PUT', async () => {
    const sinFin = await rotationValidate.validate(ROTACION, OPC);
    assert.equal(sinFin.touch[0].hourTouchFinish, '', 'sin mandarla, vacía');

    const conFin = await rotationValidate.validate({ ...ROTACION, touch: [{ ...ROTACION.touch[0], hourTouchFinish: '10:31:15' }] }, OPC);
    assert.equal(conFin.touch[0].hourTouchFinish, '10:31:15');
    await assert.rejects(rotationValidate.validate({ ...ROTACION, touch: [{ ...ROTACION.touch[0], hourTouchFinish: '25:00:00' }] }, OPC), /HH:MM:SS/);

    const base = { ...conFin, operationalDate: operationalDateOf(conFin.date), createdBy: ID };
    assert.equal(new RotationModel(base).touch[0].hourTouchFinish, '10:31:15', 'el modelo la guarda');

    const rotacion = await guardada();
    await applyEdit(rotacion, String(rotacion.touch[0]._id), { hourTouchFinish: '10:32:00' }, OTRO);
    assert.equal(rotacion.touch[0].hourTouchFinish, '10:32:00', 'se corrige con el PUT');

    const nuevo = await addTouchTo(rotacion, { name: 'G1', hourTouch: '10:50:00', hourTouchFinish: '10:50:40' }, OTRO);
    assert.equal(nuevo.hourTouchFinish, '10:50:40', 'un toque añadido después también la lleva');
});

test('las demoras reportadas: firstAttentionDelay y cleaningDelay referencian Noveltie y nacen en null', async () => {
    for (const campo of ['firstAttentionDelay', 'cleaningDelay']) {
        const ruta = RotationModel.schema.path(campo);
        assert.equal(ruta.instance.toLowerCase(), 'objectid', campo);   //  Mongoose 6 lo llama 'ObjectID'
        assert.equal(ruta.options.ref, 'Noveltie', campo);
    }

    const valida = await rotationValidate.validate(ROTACION, OPC);
    const base = { ...valida, operationalDate: operationalDateOf(valida.date), createdBy: ID };

    const sinDemoras = new RotationModel(base);
    assert.equal(sinDemoras.firstAttentionDelay, null);
    assert.equal(sinDemoras.cleaningDelay, null);
    await sinDemoras.validate();

    const conDemoras = new RotationModel({ ...base, firstAttentionDelay: ID, cleaningDelay: OTRO });
    await conDemoras.validate();
    assert.equal(String(conDemoras.firstAttentionDelay), ID);
    assert.equal(String(conDemoras.cleaningDelay), OTRO);
    await assert.rejects(new RotationModel({ ...base, cleaningDelay: 'no-es-un-id' }).validate(), /cleaningDelay/);

    //  El POST las acepta (las apunta Jarvis-express365 al enviar la alerta), sin mandarlas son null, y un id falso no pasa
    const mandadas = await rotationValidate.validate({ ...ROTACION, firstAttentionDelay: ID, cleaningDelay: OTRO }, OPC);
    assert.equal(mandadas.firstAttentionDelay, ID);
    assert.equal(mandadas.cleaningDelay, OTRO);
    const sinMandar = await rotationValidate.validate(ROTACION, OPC);
    assert.equal(sinMandar.firstAttentionDelay, null);
    assert.equal(sinMandar.cleaningDelay, null);
    await assert.rejects(rotationValidate.validate({ ...ROTACION, cleaningDelay: 'novedad-12' }, OPC), /demora de limpieza/);

    //  Y se corrigen con el PUT, con su línea en los cambios
    const rotacion = await guardada();
    await applyEdit(rotacion, String(rotacion._id), { firstAttentionDelay: ID }, OTRO);
    assert.equal(String(rotacion.firstAttentionDelay), ID);
    assert.deepEqual(rotacion.changes.map(linea => linea.property), ['firstAttentionDelay']);
});

test('los avisos: firstAttentionWarning y cleaningWarning referencian Noveltie y nacen en null, como las demoras', async () => {
    for (const campo of ['firstAttentionWarning', 'cleaningWarning']) {
        const ruta = RotationModel.schema.path(campo);
        assert.equal(ruta.instance.toLowerCase(), 'objectid', campo);
        assert.equal(ruta.options.ref, 'Noveltie', campo);
    }

    const valida = await rotationValidate.validate(ROTACION, OPC);
    const base = { ...valida, operationalDate: operationalDateOf(valida.date), createdBy: ID };

    const sinAvisos = new RotationModel(base);
    assert.equal(sinAvisos.firstAttentionWarning, null);
    assert.equal(sinAvisos.cleaningWarning, null);
    await sinAvisos.validate();

    const conAvisos = new RotationModel({ ...base, firstAttentionWarning: ID, cleaningWarning: OTRO });
    await conAvisos.validate();
    assert.equal(String(conAvisos.firstAttentionWarning), ID);
    assert.equal(String(conAvisos.cleaningWarning), OTRO);
    await assert.rejects(new RotationModel({ ...base, cleaningWarning: 'no-es-un-id' }).validate(), /cleaningWarning/);

    //  El POST los acepta (los apunta Jarvis-express365 al enviar el aviso), sin mandarlos son null, y un id falso no pasa
    const mandados = await rotationValidate.validate({ ...ROTACION, firstAttentionWarning: ID, cleaningWarning: OTRO }, OPC);
    assert.equal(mandados.firstAttentionWarning, ID);
    assert.equal(mandados.cleaningWarning, OTRO);
    const sinMandar = await rotationValidate.validate(ROTACION, OPC);
    assert.equal(sinMandar.firstAttentionWarning, null);
    assert.equal(sinMandar.cleaningWarning, null);
    await assert.rejects(rotationValidate.validate({ ...ROTACION, firstAttentionWarning: 'aviso-3' }, OPC), /aviso de primera atención/);

    //  Un aviso no es una demora: cada uno va a su propiedad
    const ambos = await rotationValidate.validate({ ...ROTACION, firstAttentionDelay: ID, firstAttentionWarning: OTRO }, OPC);
    assert.equal(ambos.firstAttentionDelay, ID);
    assert.equal(ambos.firstAttentionWarning, OTRO);

    //  Y se corrigen con el PUT, con su línea en los cambios
    const rotacion = await guardada();
    await applyEdit(rotacion, String(rotacion._id), { cleaningWarning: ID }, OTRO);
    assert.equal(String(rotacion.cleaningWarning), ID);
    assert.deepEqual(rotacion.changes.map(linea => linea.property), ['cleaningWarning']);
});
