import test from 'node:test';
import assert from 'node:assert/strict';
import {
    operationalDateOf,
    downtimeMinutesBetween,
} from '../src/apiServises/dvrFailure/dvrFailure.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// LAS DOS CUENTAS DE LAS CAÍDAS DE DVR
// ══════════════════════════════════════════════════════════════════════
// De `operationalDateOf` depende EN QUÉ DÍA cae cada caída, y de
// `downtimeMinutesBetween`, el número que después se suma para decir cuánto
// estuvo ciego un establecimiento. Equivocarlas no rompe nada visible: la
// estadística sale igual, solo que mal.
//
// Las dos son PURAS, así que acá no hay Mongo ni Express — fechas y aserciones.
//
//     npm test
//
// Ojo con la zona: los casos se escriben en UTC porque es lo que devuelve
// `toISOString()`, pero la jornada se define en America/Caracas (UTC−4). Por eso
// las 12:00 UTC son las 08:00 locales.


// ══════════════════════════════════════════════════════════════════════
// EL DÍA OPERATIVO
// ══════════════════════════════════════════════════════════════════════
// La jornada de monitoreo va de las 08:00 a las 07:00 del día siguiente. Lo que
// se prueba acá es que la madrugada quede en el día que le corresponde: sin eso,
// un turno nocturno aparece partido entre dos fechas y ninguna de las dos dice
// la verdad.

test('el día operativo: una caída de la mañana es del día en curso', () => {
    // 14:00 UTC = 10:00 en Caracas, después de que abrió la jornada.
    assert.equal(
        operationalDateOf(new Date('2026-08-20T14:00:00Z')).toISOString(),
        '2026-08-20T00:00:00.000Z',
    );
});

test('el día operativo: una caída de la madrugada es del día ANTERIOR', () => {
    // 06:00 UTC del 21 = 02:00 en Caracas: la jornada abrió el 20 a las 08:00 y
    // todavía no cerró. Es el caso que justifica toda la función.
    assert.equal(
        operationalDateOf(new Date('2026-08-21T06:00:00Z')).toISOString(),
        '2026-08-20T00:00:00.000Z',
    );
});

test('el día operativo: a las 07:00 locales la jornada anterior sigue abierta', () => {
    // 11:00 UTC = 07:00 en Caracas. El último minuto del día anterior.
    assert.equal(
        operationalDateOf(new Date('2026-08-21T11:00:00Z')).toISOString(),
        '2026-08-20T00:00:00.000Z',
    );
});

test('el día operativo: a las 08:00 locales abre el día nuevo', () => {
    // 12:00 UTC = 08:00 en Caracas. El primer minuto del día siguiente.
    assert.equal(
        operationalDateOf(new Date('2026-08-21T12:00:00Z')).toISOString(),
        '2026-08-21T00:00:00.000Z',
    );
});

test('el día operativo: devuelve medianoche UTC, sin arrastrar la hora', () => {
    // Es lo que permite comparar días por igualdad. Si quedara la hora adentro,
    // agrupar por fecha daría un grupo por caída.
    const dia = operationalDateOf(new Date('2026-08-20T19:37:42Z'));

    assert.equal(dia.getUTCHours(), 0);
    assert.equal(dia.getUTCMinutes(), 0);
    assert.equal(dia.getUTCSeconds(), 0);
    assert.equal(dia.getUTCMilliseconds(), 0);
});


// ══════════════════════════════════════════════════════════════════════
// EL TIEMPO CIEGO
// ══════════════════════════════════════════════════════════════════════

test('el tiempo ciego: minutos exactos', () => {
    assert.equal(
        downtimeMinutesBetween(
            new Date('2026-08-20T10:00:00Z'),
            new Date('2026-08-20T10:45:00Z'),
        ),
        45,
    );
});

test('el tiempo ciego: una caída de segundos cuenta como un minuto', () => {
    // Redondea hacia arriba con mínimo 1 a propósito: la caída ocurrió, y un 0
    // en la columna de tiempo ciego se lee como "no pasó nada".
    assert.equal(
        downtimeMinutesBetween(
            new Date('2026-08-20T10:00:00Z'),
            new Date('2026-08-20T10:00:40Z'),
        ),
        1,
    );
});

test('el tiempo ciego: redondea hacia arriba', () => {
    assert.equal(
        downtimeMinutesBetween(
            new Date('2026-08-20T10:00:00Z'),
            new Date('2026-08-20T10:01:30Z'),
        ),
        2,
    );
});

test('el tiempo ciego: un reloj invertido da 0, nunca un negativo', () => {
    // Pasa de verdad: relojes de estación desfasados, o una carga a mano con la
    // hora mal. Un negativo envenenaría la suma del mes entero; el episodio
    // queda registrado igual para poder revisarlo.
    assert.equal(
        downtimeMinutesBetween(
            new Date('2026-08-20T10:00:00Z'),
            new Date('2026-08-20T09:00:00Z'),
        ),
        0,
    );
});

test('el tiempo ciego: el mismo instante da 0', () => {
    const instante = new Date('2026-08-20T10:00:00Z');
    assert.equal(downtimeMinutesBetween(instante, instante), 0);
});

test('el tiempo ciego: una fecha inválida da 0 y no NaN', () => {
    // Un NaN se propaga por toda la agregación y deja el total del mes en NaN.
    assert.equal(
        downtimeMinutesBetween(
            new Date('2026-08-20T10:00:00Z'),
            new Date('no es una fecha'),
        ),
        0,
    );
});
