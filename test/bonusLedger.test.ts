import test from 'node:test';
import assert from 'node:assert/strict';
import { dimensionesDe, DIMENSIONES as DEL_PIPELINE } from '../src/apiServises/bonus/bonusLedger.pipeline.ts';
import bonusLedgerQuerySchema, { MAX_DIAS, DIMENSIONES } from '../src/apiServises/bonus/bonusLedger.schema.ts';

// ══════════════════════════════════════════════════════════════════════
// EL LIBRO DE BONOS
// ══════════════════════════════════════════════════════════════════════
// Solo lo que no toca Mongo: qué columnas se agrupan y qué consultas se
// aceptan. La agregación en sí se prueba contra la base, no acá.

const consulta = (extra: Record<string, unknown> = {}) =>
    bonusLedgerQuerySchema.validate(
        { desde: '2026-08-01', hasta: '2026-08-16', ...extra },
        { abortEarly: false, stripUnknown: true },
    );

const rechaza = async (extra: Record<string, unknown>, parte: string) => {
    await assert.rejects(() => consulta(extra), (e: Error) => {
        assert.match(e.message, new RegExp(parte, 'i'));
        return true;
    });
};


test('la lista de columnas es la misma en el esquema y en el pipeline', () => {
    // Están escritas en los dos archivos porque ninguno puede importar valores
    // del otro sin quedarse sin poder probarse. Esta es la costura.
    assert.deepEqual([...DEL_PIPELINE], [...DIMENSIONES]);
});

test('sin agrupado pedido, agrupa por todo: es el detalle', () => {
    assert.deepEqual(dimensionesDe(null), [...DIMENSIONES]);
    assert.deepEqual(dimensionesDe([]), [...DIMENSIONES]);
});

test('respeta el orden declarado, no el orden en que las pidieron', () => {
    assert.deepEqual(dimensionesDe(['operador', 'dia'] as never), ['dia', 'operador']);
});

test('una dimensión repetida no duplica la columna', () => {
    assert.deepEqual(dimensionesDe(['operador', 'operador'] as never), ['operador']);
});

test('agrupar por una sola columna deja una sola columna', () => {
    assert.deepEqual(dimensionesDe(['alerta'] as never), ['alerta']);
});


test('el rango llega expandido al día civil completo', async () => {
    const { desde, hasta } = await consulta();
    assert.equal(desde.getHours(), 0);
    assert.equal(desde.getMinutes(), 0);
    // `hasta` incluye su día entero: "del 1 al 16" cuenta el 16 completo.
    assert.equal(hasta.getDate(), 16);
    assert.equal(hasta.getHours(), 23);
    assert.equal(hasta.getMinutes(), 59);
});

test('el rango es obligatorio', async () => {
    await assert.rejects(() => bonusLedgerQuerySchema.validate({}, { abortEarly: false }));
});

test('rechaza el rango al revés', async () => {
    await rechaza({ desde: '2026-08-16', hasta: '2026-08-01' }, 'anterior a la final');
});

test(`rechaza más de ${MAX_DIAS} días: sin tope no hay índice que salve la consulta`, async () => {
    await rechaza({ desde: '2026-01-01', hasta: '2026-12-31' }, `${MAX_DIAS} días`);
});

test('acepta justo el rango máximo', async () => {
    const desde = new Date(2026, 0, 1);
    const hasta = new Date(2026, 0, 1 + MAX_DIAS - 1);
    const r = await bonusLedgerQuerySchema.validate({ desde, hasta }, { abortEarly: false });
    assert.ok(r.desde <= r.hasta);
});


test('agrupadoPor acepta una lista separada por comas', async () => {
    const { agrupadoPor } = await consulta({ agrupadoPor: 'dia,operador' });
    assert.deepEqual(agrupadoPor, ['dia', 'operador']);
});

test('agrupadoPor rechaza una columna inventada: los nombres entran al $group', async () => {
    await rechaza({ agrupadoPor: 'operador,__proto__' }, 'no es una columna agrupable');
});

test('un operador que no es ObjectId no llega a Mongo', async () => {
    await rechaza({ operador: 'yo' }, 'identificador válido');
});

test('sin filtros opcionales, todo queda en null y no arma condiciones', async () => {
    const r = await consulta();
    assert.equal(r.operador, null);
    assert.equal(r.establecimiento, null);
    assert.equal(r.aprobadas, null);
    assert.equal(r.agrupadoPor, null);
});

test('aprobadas distingue los tres estados', async () => {
    assert.equal((await consulta({ aprobadas: 'true' })).aprobadas, true);
    assert.equal((await consulta({ aprobadas: 'false' })).aprobadas, false);
    assert.equal((await consulta()).aprobadas, null);
});
