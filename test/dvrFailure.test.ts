import test from 'node:test';
import assert from 'node:assert/strict';
import {
    operationalDateOf,
    downtimeMinutesBetween,
    overlapMinutes,
} from '../src/apiServises/dvrFailure/dvrFailure.lib.ts';
import { debeRechazarLaAlerta } from '../src/apiServises/dvrFailure/dvrGate.lib.ts';

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


// ══════════════════════════════════════════════════════════════════════
// LO QUE CAE DENTRO DE LA JORNADA
// ══════════════════════════════════════════════════════════════════════
// El reporte de novedades no pregunta cuánto duró la caída, sino cuánto tiempo
// de ESA jornada el establecimiento estuvo ciego. Una caída puede venir de ayer,
// o cruzar el cierre, y en los dos casos solo cuenta el pedazo que se solapa.

// La jornada del 20: de las 08:00 a las 07:00 del 21, hora Caracas (UTC−4).
const ABRE = new Date('2026-08-20T12:00:00Z');   // 08:00 local
const CIERRA = new Date('2026-08-21T11:00:00Z'); // 07:00 local del dia siguiente

test('solapamiento: un episodio entero dentro de la jornada cuenta completo', () => {
    assert.equal(
        overlapMinutes(
            new Date('2026-08-20T14:00:00Z'),
            new Date('2026-08-20T15:30:00Z'),
            ABRE, CIERRA,
        ),
        90,
    );
});

test('solapamiento: una caída que viene de ayer cuenta solo desde que abrió', () => {
    // Se cayó a las 06:00 locales —dos horas antes de abrir— y volvió a las
    // 09:00. Estuvo tres horas caída, pero la jornada solo vio una.
    assert.equal(
        overlapMinutes(
            new Date('2026-08-20T10:00:00Z'),
            new Date('2026-08-20T13:00:00Z'),
            ABRE, CIERRA,
        ),
        60,
    );
});

test('solapamiento: una caída que cruza el cierre corta en el cierre', () => {
    // Se cayó a las 06:00 del 21 y volvió a las 09:00, ya en la jornada
    // siguiente. Esta jornada solo vio hasta las 07:00.
    assert.equal(
        overlapMinutes(
            new Date('2026-08-21T10:00:00Z'),
            new Date('2026-08-21T13:00:00Z'),
            ABRE, CIERRA,
        ),
        60,
    );
});

test('solapamiento: un episodio todavía ABIERTO cuenta hasta el corte', () => {
    // Sin restablecimiento, la caída sigue. Cuenta hasta donde llegue la
    // ventana — que en un corte parcial es "ahora".
    const corte = new Date('2026-08-20T16:00:00Z');
    assert.equal(
        overlapMinutes(new Date('2026-08-20T14:00:00Z'), null, ABRE, corte),
        120,
    );
});

test('solapamiento: una caída de otro día no cuenta nada', () => {
    // Existió, pero no en esta jornada. Es la diferencia entre "cuánto duró" y
    // "cuánto de esta jornada estuvo ciego".
    assert.equal(
        overlapMinutes(
            new Date('2026-08-18T14:00:00Z'),
            new Date('2026-08-18T15:00:00Z'),
            ABRE, CIERRA,
        ),
        0,
    );
});

test('solapamiento: una caída que envuelve la jornada entera cuenta la jornada', () => {
    // Cayó anteayer y sigue abierta: estuvo ciega las 23 horas de la ventana.
    assert.equal(
        overlapMinutes(new Date('2026-08-18T14:00:00Z'), null, ABRE, CIERRA),
        23 * 60,
    );
});


// ══════════════════════════════════════════════════════════════════════
// EL CANDADO: UN LOCAL SIN CÁMARAS NO REPORTA
// ══════════════════════════════════════════════════════════════════════
// Decide si se le acepta una alerta a un establecimiento con el DVR caído.
// Equivocarlo de más deja a los locales sin poder cargar su trabajo, y eso se
// nota tarde y mal.

test('el candado: con el DVR sano NO se bloquea nada', () => {
    assert.equal(debeRechazarLaAlerta({
        dvrEffect: null, hayCaidaAbierta: false, hayComoDesbloquear: true,
    }), false);
});

test('el candado: caído, se rechaza una alerta cualquiera', () => {
    assert.equal(debeRechazarLaAlerta({
        dvrEffect: null, hayCaidaAbierta: true, hayComoDesbloquear: true,
    }), true);
});

test('el candado: la alerta de RESTABLECIMIENTO siempre pasa', () => {
    // Es la única que puede reabrir el local. Bloquearla lo dejaría encerrado.
    assert.equal(debeRechazarLaAlerta({
        dvrEffect: 'up', hayCaidaAbierta: true, hayComoDesbloquear: true,
    }), false);
});

test('el candado: la alerta que REPORTA la caída también se rechaza si ya está caído', () => {
    // No es un descuido: el local ya está registrado como caído, y una segunda
    // caída sobre la misma no aporta nada — el episodio abierto es uno solo.
    assert.equal(debeRechazarLaAlerta({
        dvrEffect: 'down', hayCaidaAbierta: true, hayComoDesbloquear: true,
    }), true);
});

test('el candado: SIN alerta de restablecimiento en el catálogo, no se cierra', () => {
    // La condición que más importa. `dvrEffect` es nuevo y arranca en null: si
    // nadie marcó todavía una alerta como 'up', echar el candado dejaría al
    // local encerrado para siempre porque no habría con qué abrirlo.
    assert.equal(debeRechazarLaAlerta({
        dvrEffect: null, hayCaidaAbierta: true, hayComoDesbloquear: false,
    }), false);
});

test('el candado: sin catálogo marcado, ni siquiera la de caída se bloquea', () => {
    assert.equal(debeRechazarLaAlerta({
        dvrEffect: 'down', hayCaidaAbierta: true, hayComoDesbloquear: false,
    }), false);
});

test('el candado: un dvrEffect desconocido se trata como alerta cualquiera', () => {
    // Un valor que no es 'up' no abre nada. Ante la duda, no se desbloquea.
    assert.equal(debeRechazarLaAlerta({
        dvrEffect: 'cualquier-cosa', hayCaidaAbierta: true, hayComoDesbloquear: true,
    }), true);
});
