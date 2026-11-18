import test from 'node:test';
import assert from 'node:assert/strict';
import {
    sameDeviceName, linkMismatch, buildSyncPlan, planSummary, copyOutcome,
} from '../src/apiServises/biometric/biometricSync.lib.js';
import { kioskPayload } from '../src/apiServises/biometric/biometricStream.lib.js';

// ══════════════════════════════════════════════════════════════════════
// LOS MISMOS DATOS EN TODOS LOS TERMINALES
// ══════════════════════════════════════════════════════════════════════
// La situación de los dos terminales reales el 2026-11-18, con nombres
// inventados: el de Oficina 2 se cargó aparte, cuatro números chocan, una
// persona tiene un número en cada uno, y la mayoría está en uno solo. Lo que
// importa: que se copie lo que falta y que NUNCA se mezcle a dos personas.

type Person = { employeeNo: string; name: string; fingerprints: number[]; menuAccess?: boolean };
const p = (employeeNo: string, name: string, fingerprints: number[], menuAccess = false): Person => ({ employeeNo, name, fingerprints, menuAccess });
const user = (name: string, surName: string) => ({ name, surName });

const PRINCIPAL = {
    code: 'principal',
    name: 'Terminal principal',
    people: [
        p('1', 'Ana Torres', [6], true),
        p('22', 'Bruno Diaz', [6]),
        p('23', 'Carla Perez', [6]),
        p('24', 'Diana Rios', [6]),
        p('25', 'Elias Mora', [1, 5]),
        p('30', 'Olga Ruiz', [1]),
        p('50', 'Pablo Sanz', [3], true),
        p('104', 'Fabio Luna', [6]),
        p('105', 'Gina Soto', [6]),
        p('106', 'Hector Vera', [1]),
    ],
};
const OFICINA = {
    code: 'oficina-2',
    name: 'Oficina 2',
    people: [
        p('1', 'ANA TORRES', [6]),
        p('3', 'Irene Paz', [6]),
        p('4', 'Elias Mora', [6]),
        p('11', 'Jose Leon', [4]),
        p('24', 'Karen Gil', [6]),
        p('30', 'Olga Ruiz', [2]),
        p('83', 'Luis Rey', [7]),
        p('104', 'Mario Cruz', [6]),
        p('105', 'Nora Vega', [6]),
        p('106', 'Hector Arias', [6]),
    ],
};
const LINKS = [
    { employeeNo: '1', user: user('Ana María', 'Torres López') },
    { employeeNo: '22', user: user('Bruno', 'Díaz Silva') },
    { employeeNo: '25', user: user('Elías', 'Mora') },
    { employeeNo: '105', user: user('Gina', 'Soto Rivas') },
    { employeeNo: '106', user: user('Héctor', 'Vera Méndez') },
];

const plan = buildSyncPlan({ terminals: [PRINCIPAL, OFICINA], links: LINKS });
const copyOf = (to: string, employeeNo: string) => plan.copies.find((c: any) => c.to === to && c.employeeNo === employeeNo);



test('Mismo nombre: iguales sin tildes ni mayúsculas, o todas las palabras del más corto', () => {
    assert.equal(sameDeviceName('Ana Torres', 'ANA TORRES'), true);
    assert.equal(sameDeviceName('Bárbara Dulcey', 'Barbara Dulcey'), true);
    assert.equal(sameDeviceName('Ana Torres', 'Ana Maria Torres Lopez'), true, 'el más corto entero dentro del otro');
    assert.equal(sameDeviceName('Darlenys Matute', 'Darlenis Matute'), true, 'una letra de diferencia en palabras largas');
    assert.equal(sameDeviceName('Richard', 'Richard'), true);
    assert.equal(sameDeviceName('Daniel Arias', 'Daniel Flores'), false, 'mismo nombre de pila, otra persona');
    assert.equal(sameDeviceName('Daniel', 'Daniel Flores'), false, 'una sola palabra no alcanza');
    assert.equal(sameDeviceName('', 'Ana'), false);
});

test('Vínculo: el nombre del terminal no es de la persona vinculada si no comparte ni el apellido', () => {
    assert.equal(linkMismatch('Nora Vega', user('Gina', 'Soto Rivas')), true, 'otra persona');
    assert.equal(linkMismatch('Hector Arias', user('Héctor', 'Vera Méndez')), true, 'solo coincide el nombre de pila');
    assert.equal(linkMismatch('Elias Mora', user('Elías', 'Mora')), false);
    assert.equal(linkMismatch('Ana Torres', user('Ana María', 'Torres López')), false);
    assert.equal(linkMismatch('Jhonatan Perez', user('Jonathan', 'Pérez')), false, 'el apellido coincide: otra forma de escribir el nombre');
    assert.equal(linkMismatch('Richard', user('Richard', 'González')), false);
    assert.equal(linkMismatch('Richard', user('Daniel', 'Flores')), true);
    assert.equal(linkMismatch('', user('Daniel', 'Flores')), false, 'sin nombre en el terminal no se puede decir');
    assert.equal(linkMismatch('Ana Torres', null), false);
});

test('Plan: el mismo número con otra persona no se copia (ni de un lado ni del otro)', () => {
    const conflicts = Object.fromEntries(plan.conflicts.map((c: any) => [c.employeeNo, c]));
    assert.deepEqual(Object.keys(conflicts).sort(), ['104', '105', '106', '24']);
    assert.equal(conflicts['24'].kind, 'numero');
    assert.equal(conflicts['104'].kind, 'numero');
    assert.equal(conflicts['105'].kind, 'vinculo', 'en Oficina 2 el 105 no es la persona vinculada en Jarvis');
    assert.equal(conflicts['105'].linkedName, 'Gina Soto Rivas');
    assert.equal(conflicts['106'].kind, 'vinculo', '«Hector Arias» no es «Héctor Vera Méndez»');
    assert.deepEqual(conflicts['24'].entries, [{ code: 'principal', name: 'Diana Rios' }, { code: 'oficina-2', name: 'Karen Gil' }]);
    for (const no of ['24', '104', '105', '106']) assert.equal(plan.copies.some((c: any) => c.employeeNo === no), false, `el ${no} no se copia`);
});

test('Plan: la misma persona con otro número en otro terminal no se copia (quedaría dos veces)', () => {
    assert.deepEqual(plan.duplicates, [{ name: 'Elias Mora', entries: [{ code: 'principal', employeeNo: '25' }, { code: 'oficina-2', employeeNo: '4' }] }]);
    assert.equal(plan.copies.some((c: any) => c.employeeNo === '25' || c.employeeNo === '4'), false);
});

test('Plan: a cada terminal se le agrega quien le falta, con sus huellas', () => {
    assert.deepEqual(copyOf('principal', '3'), { to: 'principal', employeeNo: '3', name: 'Irene Paz', createPerson: true, fingerprints: [{ id: 6, from: 'oficina-2' }], menuAccess: false });
    assert.deepEqual(copyOf('principal', '11')?.fingerprints, [{ id: 4, from: 'oficina-2' }], 'en la misma posición');
    assert.ok(copyOf('principal', '83'));
    assert.deepEqual(copyOf('oficina-2', '22'), { to: 'oficina-2', employeeNo: '22', name: 'Bruno Diaz', createPerson: true, fingerprints: [{ id: 6, from: 'principal' }], menuAccess: false });
    assert.ok(copyOf('oficina-2', '23'));
});

test('Plan: si está en los dos con huellas distintas, se completa cada uno; si está igual, no se toca', () => {
    assert.deepEqual(copyOf('principal', '30'), { to: 'principal', employeeNo: '30', name: 'Olga Ruiz', createPerson: false, fingerprints: [{ id: 2, from: 'oficina-2' }], menuAccess: false });
    assert.deepEqual(copyOf('oficina-2', '30')?.fingerprints, [{ id: 1, from: 'principal' }]);
    assert.equal(plan.copies.some((c: any) => c.employeeNo === '1'), false, 'Ana está igual en los dos');
    assert.equal(plan.same, 1);
});

test('Plan: el acceso al menú del terminal no se copia, y se avisa', () => {
    assert.equal(copyOf('oficina-2', '50')?.menuAccess, true, 'Pablo tiene acceso al menú en el principal: en Oficina 2 entra sin él');
});

test('Plan: cuánto se copia a cada uno', () => {
    assert.deepEqual(planSummary(plan, [PRINCIPAL, OFICINA]), [
        { code: 'principal', name: 'Terminal principal', persons: 3, fingerprints: 4 },
        { code: 'oficina-2', name: 'Oficina 2', persons: 3, fingerprints: 4 },
    ]);
});

test('Plan: con tres terminales, quien está en uno solo va a los otros dos', () => {
    const tres = buildSyncPlan({
        terminals: [
            { code: 'a', name: 'A', people: [p('7', 'Rosa Blanco', [2, 3])] },
            { code: 'b', name: 'B', people: [] },
            { code: 'c', name: 'C', people: [p('7', 'Rosa Blanco', [2])] },
        ],
    });
    assert.deepEqual(tres.copies.map((c: any) => `${c.to}:${c.createPerson ? 'nueva' : 'completa'}:${c.fingerprints.map((f: any) => `${f.id}<${f.from}`).join(',')}`), ['b:nueva:2<a,3<a', 'c:completa:3<a']);
});

test('Plan: sin nada distinto, no hay nada que copiar', () => {
    const igual = buildSyncPlan({ terminals: [{ code: 'a', name: 'A', people: [p('1', 'Ana Torres', [6])] }, { code: 'b', name: 'B', people: [p('1', 'Ana Torres', [6])] }] });
    assert.deepEqual(igual, { copies: [], conflicts: [], duplicates: [], same: 1 });
});

test('Al copiar una huella: si el terminal ya la tiene, se omite; si se llenó, se deja de copiar ahí', () => {
    assert.deepEqual(copyOutcome(null), { result: 'copied' });
    assert.equal(copyOutcome({ saveStatus: 5, message: 'x' }).result, 'skipped');
    assert.equal(copyOutcome({ saveStatus: 6, message: 'x' }).result, 'skipped');
    assert.deepEqual(copyOutcome({ saveStatus: 4, message: 'llena' }), { result: 'error', stopTerminal: true, message: 'llena' });
    assert.deepEqual(copyOutcome({ saveStatus: 3, message: 'mala' }), { result: 'error', message: 'mala' });
});

test('Escucha: si el número es de otra persona en este terminal, el kiosco no marca y no viaja nada del vinculado', () => {
    const event = { employeeNo: '105', serialNo: 70001, time: '2026-11-18T08:00:00-04:00' };
    const payload = kioskPayload({ action: 'mark' }, event, null, { mismatchName: 'Nora Vega' });
    assert.deepEqual(payload, { type: 'unlinked', reason: 'otra_persona', name: 'Nora Vega', employeeNo: '105', serialNo: 70001, at: '2026-11-18T08:00:00-04:00' });
    assert.equal(kioskPayload({ action: 'repeated', secondsAgo: 5 }, event, null, { mismatchName: 'Nora Vega' }).type, 'unlinked', 'tampoco como repetida');
    assert.equal(kioskPayload({ action: 'rejected' }, event, null, { mismatchName: 'Nora Vega' }).type, 'rejected');
});
