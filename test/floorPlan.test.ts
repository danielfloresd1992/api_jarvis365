import test from 'node:test';
import assert from 'node:assert/strict';
import { floorPlanValidate, floorPlanProblems, FLOOR_PLAN_KINDS, MAX_PIECES, tableKey } from '../src/apiServises/local/floorPlan.schema.js';
import FRANCISCA_DORAL from '../src/scripts/croquis/francisca-doral.js';

// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE MESAS: lo que se acepta al guardarlo
// ══════════════════════════════════════════════════════════════════════
// Lo que importa es que el croquis que se guarde se pueda montar después sin
// sorpresas: cada pieza en una zona que existe, dentro del plano, y sin dos
// mesas con el mismo número (las rotaciones se enlazan por ese número).

const OPC = { abortEarly: false, stripUnknown: true };

const PLANO = {
    board: { w: 900, h: 560, grid: 20 },
    zonas: [{ id: 'salon', label: 'Salón' }, { id: 'terraza', label: 'Terraza' }],
    piezas: [
        { id: 'p1', zona: 'salon', kind: 'cuadrada', label: '1', x: 40, y: 40, w: 80, h: 80, cap: 4 },
        { id: 'p2', zona: 'salon', kind: 'taburete', label: 'B1', x: 700, y: 200, w: 40, h: 40, cap: 1 },
        { id: 'p3', zona: 'salon', kind: 'mueble', label: 'Mueble', x: 300, y: 500, w: 160, h: 40, cap: 0 },
        { id: 'p4', zona: 'salon', kind: 'mueble', label: 'Mueble', x: 500, y: 500, w: 160, h: 40, cap: 0 },
        { id: 'p5', zona: 'terraza', kind: 'redonda', label: '2', x: 40, y: 300, w: 60, h: 60, cap: 2 },
    ],
};

const falla = async (plano: unknown) => {
    try {
        await floorPlanValidate.validate(plano, OPC);
    }
    catch (error) {
        return (error as { errors?: string[] }).errors?.join(' | ') ?? String(error);
    }
    return null;
};


test('un croquis bien hecho pasa, y lo que no es del formato se descarta', async () => {
    const valido = await floorPlanValidate.validate({ ...PLANO, establishment: 'x', updatedBy: 'y' }, OPC);
    assert.equal(valido.piezas.length, 5);
    assert.equal('establishment' in valido, false);
    assert.equal('updatedBy' in valido, false);
});

test('la cuadrícula y la capacidad tienen su valor por defecto', async () => {
    const { board, piezas } = await floorPlanValidate.validate({
        board: { w: 900, h: 560 },
        zonas: [{ id: 'salon', label: 'Salón' }],
        piezas: [{ id: 'p1', zona: 'salon', kind: 'mueble', label: 'Cocina', x: 0, y: 0, w: 100, h: 60 }],
    }, OPC);
    assert.equal(board.grid, 20);
    assert.equal(piezas[0].cap, 0);
});

test('un croquis necesita al menos una zona, y las formas son las del editor', async () => {
    assert.match(await falla({ ...PLANO, zonas: [], piezas: [] }) ?? '', /al menos una zona/);
    assert.match(await falla({ ...PLANO, piezas: [{ ...PLANO.piezas[0], kind: 'hexagonal' }] }) ?? '', /forma/);
    assert.deepEqual(FLOOR_PLAN_KINDS, ['redonda', 'cuadrada', 'larga', 'taburete', 'barra', 'mueble']);
});

test('una pieza en una zona que no existe no pasa', async () => {
    const mensaje = await falla({ ...PLANO, piezas: [{ ...PLANO.piezas[0], zona: 'patio' }] });
    assert.match(mensaje ?? '', /zona que no existe: 1/);
});

test('una pieza que se sale del plano no pasa', async () => {
    assert.match(await falla({ ...PLANO, piezas: [{ ...PLANO.piezas[0], x: 860 }] }) ?? '', /se salen del plano: 1/);
    assert.match(await falla({ ...PLANO, piezas: [{ ...PLANO.piezas[0], y: -20 }] }) ?? '', /salirse del plano/);
});

test('dos mesas con el mismo número no pasan, aunque una lleve espacios o minúsculas', async () => {
    const repetidas = [...PLANO.piezas, { id: 'p6', zona: 'terraza', kind: 'cuadrada', label: ' b1 ', x: 200, y: 300, w: 40, h: 40, cap: 2 }];
    assert.match(await falla({ ...PLANO, piezas: repetidas }) ?? '', /Número de mesa repetido: B1/);
    assert.equal(tableKey(' b1 '), 'B1');
});

test('los muebles sí pueden repetir nombre', () => {
    assert.deepEqual(floorPlanProblems(PLANO), []);
});

test('ids y zonas repetidas no pasan', () => {
    const problemas = floorPlanProblems({
        ...PLANO,
        zonas: [...PLANO.zonas, { id: 'salon', label: 'Otro salón' }],
        piezas: [...PLANO.piezas, { ...PLANO.piezas[4], label: '3' }],
    });
    assert.ok(problemas.some(texto => texto.startsWith('Zona repetida: salon')));
    assert.ok(problemas.some(texto => texto.startsWith('Pieza con el id repetido: p5')));
});

test('hay un tope de piezas', async () => {
    const muchas = Array.from({ length: MAX_PIECES + 1 }, (_, index) => ({ id: `p${index}`, zona: 'salon', kind: 'mueble', label: 'Mueble', x: 0, y: 0, w: 20, h: 20 }));
    assert.match(await falla({ ...PLANO, piezas: muchas }) ?? '', /no tiene más de/);
});


// ── El croquis de Francisca Doral, pasado de su plano ─────────────────

test('el croquis de Francisca Doral pasa la misma validación que el PUT', async () => {
    const { establishment, name, ...cuerpo } = FRANCISCA_DORAL;
    assert.equal(establishment, '637a7ae31a8ed7ed7d7e71e0');
    assert.equal(name, 'Francisca Doral');
    const valido = await floorPlanValidate.validate(cuerpo, OPC);
    assert.equal(valido.piezas.length, 56);
    assert.deepEqual(valido.zonas.map(zona => zona.label), ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 5', 'Barra', 'Terraza']);
});

test('Francisca Doral: cada zona tiene sus mesas, y ninguna se pisa con otra', () => {
    const { piezas } = FRANCISCA_DORAL;
    const deZona = (zona: string) => piezas.filter(pieza => pieza.zona === zona).map(pieza => pieza.label);
    assert.deepEqual(deZona('zona-3'), ['33', '32', '31', '34', '35', '36', '37']);
    assert.deepEqual(deZona('zona-2'), ['24', '23', '22', '21', '25', '26', '27', '28']);
    assert.deepEqual(deZona('zona-1'), ['11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '12.3 y 12.1', '1']);
    assert.deepEqual(deZona('barra'), ['B10', 'B11', 'B9', 'B12', 'B5', 'B4', 'B3', 'B2', 'B1', 'B6', 'B7', 'B8']);
    assert.deepEqual(deZona('zona-5'), ['60', '59', '58', '57', '56', '55', '54', '53', '52', '51', '61', '62', '63']);
    assert.deepEqual(deZona('terraza'), ['41', '42', '44', '43']);

    const seSolapan = (una: typeof piezas[number], otra: typeof piezas[number]) =>
        una.x < otra.x + otra.w && otra.x < una.x + una.w && una.y < otra.y + otra.h && otra.y < una.y + una.h;
    const choques = piezas.flatMap((una, index) => piezas.slice(index + 1).filter(otra => seSolapan(una, otra)).map(otra => `${una.label}/${otra.label}`));
    assert.deepEqual(choques, []);
});
