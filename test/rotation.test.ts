import test from 'node:test';
import assert from 'node:assert/strict';
import { rotationValidate, rotationQueryValidate, dayToDate, MAX_RANGE_DAYS } from '../src/apiServises/rotation/rotation.schema.js';
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
