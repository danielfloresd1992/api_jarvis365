import test from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveBonusForNovelty,
    resolveWorkShift,
    isInScope,
} from '../src/apiServises/bonus/resolveBonus.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// EL CÁLCULO DEL DINERO
// ══════════════════════════════════════════════════════════════════════
// `resolveBonusForNovelty` decide cuántos bonos vale cada alerta, y de eso sale
// lo que se le paga a la gente. Es la función que más caro sale equivocar y la
// más barata de probar: es PURA, así que acá no hay Mongo, ni Express, ni
// esperas — objetos planos y aserciones.
//
// Se corre con el runner de Node, sin ninguna dependencia:
//
//     npm test
//
// Node ejecuta el TypeScript directamente (borra los tipos), y la función pura no
// importa nada en tiempo de ejecución — sus dos únicos imports son `import type`.
// Por eso este archivo arranca en menos de un segundo.


// ── Ayudas para armar los casos ───────────────────────────────────────

const LOCAL = '507f1f77bcf86cd799439011';
const OTRO_LOCAL = '507f1f77bcf86cd799439012';
const MARCA = '507f1f77bcf86cd799439021';
const OTRA_MARCA = '507f1f77bcf86cd799439022';

/** Una regla, con lo mínimo y lo que se quiera pisar. */
const regla = (extra: Record<string, unknown> = {}) => ({
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    alertsRequired: 1,
    bonusAwarded: { day: 1, night: 1 },
    active: true,
    scope: { mode: 'all', franchises: [], locals: [] },
    overrides: [],
    ...extra,
});

/** El establecimiento donde ocurrió, con su marca. */
const establecimiento = (id = LOCAL, marca = MARCA) => ({
    _id: id,
    franchiseReference: { franchise: marca },
});

/** Un operador con jornada base fija. */
const operador = (turno: string | null) => ({
    workSchedule: { shiftType: turno, scheduleByDay: null },
});

/** Resuelve con valores por defecto razonables. */
const resolver = (extra: Record<string, unknown> = {}) => resolveBonusForNovelty({
    user: operador('diurno'),
    menu: { bonusRule: regla() },
    establishment: establecimiento(),
    settings: { pointValue: 0.20 },
    ...extra,
} as never);


// ══════════════════════════════════════════════════════════════════════
test('los tres casos que escribe el reglamento', async (t) => {

    await t.test('1x1 — una alerta vale un bono', () => {
        const r = resolver({ menu: { bonusRule: regla() } });
        assert.equal(r.applies, true);
        assert.equal(r.applies && r.bonusPerAlert, 1);
    });

    await t.test('4x1 — hacen falta cuatro, cada una vale 0,25', () => {
        const r = resolver({ menu: { bonusRule: regla({ alertsRequired: 4 }) } });
        assert.equal(r.applies && r.bonusPerAlert, 0.25);
        assert.equal(r.applies && r.alertsRequired, 4);
        assert.equal(r.applies && r.bonusAwarded, 1);
    });

    await t.test('1x5 — una alerta vale cinco bonos', () => {
        const r = resolver({ menu: { bonusRule: regla({ bonusAwarded: { day: 5, night: 5 } }) } });
        assert.equal(r.applies && r.bonusPerAlert, 5);
    });
});


test('las alertas suman y el resto NO se pierde', async (t) => {
    // Es la regla que más confusión genera: si hacen falta 4 y hay 6, las dos
    // que sobran del grupo aportan su parte igual.
    const cuatroPorBono = { menu: { bonusRule: regla({ alertsRequired: 4 }) } };
    const porAlerta = (resolver(cuatroPorBono) as { bonusPerAlert: number }).bonusPerAlert;

    await t.test('6 alertas de una regla 4x1 son 1,5 bonos — no 1', () => {
        assert.equal(6 * porAlerta, 1.5);
    });

    await t.test('8 alertas son 2 bonos exactos', () => {
        assert.equal(8 * porAlerta, 2);
    });

    await t.test('2 alertas son medio bono, no cero', () => {
        assert.equal(2 * porAlerta, 0.5);
    });
});


test('el turno decide cuántos bonos otorga, y es el del OPERADOR', async (t) => {

    const distintoPorTurno = regla({ bonusAwarded: { day: 1, night: 1.5 } });

    await t.test('un operador nocturno cobra el valor nocturno', () => {
        const r = resolver({ user: operador('nocturno'), menu: { bonusRule: distintoPorTurno } });
        assert.equal(r.applies && r.workShift, 'night');
        assert.equal(r.applies && r.bonusPerAlert, 1.5);
    });

    await t.test('un operador diurno cobra el diurno', () => {
        const r = resolver({ user: operador('diurno'), menu: { bonusRule: distintoPorTurno } });
        assert.equal(r.applies && r.workShift, 'day');
        assert.equal(r.applies && r.bonusPerAlert, 1);
    });

    await t.test('con 4x1 nocturno a 5, cada alerta vale 1,25', () => {
        const r = resolver({
            user: operador('nocturno'),
            menu: { bonusRule: regla({ alertsRequired: 4, bonusAwarded: { day: 4, night: 5 } }) },
        });
        assert.equal(r.applies && r.bonusPerAlert, 1.25);
    });
});


test('de qué capa del horario salió el turno', async (t) => {
    const sabado = new Date('2026-08-15T12:00:00Z'); // getDay() === 6

    await t.test('el override del día le gana a todo', () => {
        const { workShift, shiftSource } = resolveWorkShift(
            operador('diurno') as never,
            { scheduleOverride: { shift: 'nocturno' } },
            sabado,
        );
        assert.equal(workShift, 'night');
        assert.equal(shiftSource, 'override');
    });

    await t.test('el horario del día le gana a la jornada base', () => {
        const { workShift, shiftSource } = resolveWorkShift(
            { workSchedule: { shiftType: 'diurno', scheduleByDay: { '6': { shift: 'nocturno' } } } } as never,
            null,
            sabado,
        );
        assert.equal(workShift, 'night');
        assert.equal(shiftSource, 'regla');
    });

    await t.test('sin horario del día cae a la jornada base', () => {
        const { shiftSource } = resolveWorkShift(operador('nocturno') as never, null, sabado);
        assert.equal(shiftSource, 'shiftType');
    });

    await t.test('sin nada se asume diurno, pero queda dicho', () => {
        // `default` importa: son las novedades que conviene revisar antes de
        // pagar, porque nadie declaró el turno.
        const { workShift, shiftSource } = resolveWorkShift(null, null, sabado);
        assert.equal(workShift, 'day');
        assert.equal(shiftSource, 'default');
    });

    await t.test('el Map de Mongoose y el objeto plano se tratan igual', () => {
        const conMap = { workSchedule: { scheduleByDay: new Map([['6', { shift: 'nocturno' }]]) } };
        assert.equal(resolveWorkShift(conMap as never, null, sabado).workShift, 'night');
    });
});


test('dónde aplica la regla', async (t) => {

    await t.test("'all' aplica en todos lados", () => {
        assert.equal(isInScope(regla() as never, establecimiento() as never), true);
    });

    await t.test("'only' aplica solo en los listados — por local", () => {
        const r = regla({ scope: { mode: 'only', franchises: [], locals: [LOCAL] } });
        assert.equal(isInScope(r as never, establecimiento(LOCAL) as never), true);
        assert.equal(isInScope(r as never, establecimiento(OTRO_LOCAL) as never), false);
    });

    await t.test("'only' por MARCA cubre a los locales de esa marca", () => {
        // Es lo que hace que una Francisca nueva quede cubierta sin que nadie
        // la agregue a mano.
        const r = regla({ scope: { mode: 'only', franchises: [MARCA], locals: [] } });
        assert.equal(isInScope(r as never, establecimiento(OTRO_LOCAL, MARCA) as never), true);
        assert.equal(isInScope(r as never, establecimiento(OTRO_LOCAL, OTRA_MARCA) as never), false);
    });

    await t.test("'except' aplica en todos MENOS los listados", () => {
        const r = regla({ scope: { mode: 'except', franchises: [], locals: [LOCAL] } });
        assert.equal(isInScope(r as never, establecimiento(LOCAL) as never), false);
        assert.equal(isInScope(r as never, establecimiento(OTRO_LOCAL) as never), true);
    });
});


test('las excepciones — gana la más específica', async (t) => {

    await t.test('una excepción del local pisa el valor general', () => {
        const r = resolver({
            menu: { bonusRule: regla({
                overrides: [{ local: LOCAL, franchise: null, alertsRequired: 1, bonusAwarded: { day: 5, night: 5 }, note: '' }],
            }) },
            establishment: establecimiento(LOCAL),
        });
        assert.equal(r.applies && r.bonusPerAlert, 5);
        assert.equal(r.applies && r.appliedFrom, 'override');
    });

    await t.test('la del LOCAL le gana a la de su MARCA', () => {
        // Sin esta prioridad, el resultado dependería del orden de carga — que
        // es lo peor posible cuando decide un pago.
        const r = resolver({
            menu: { bonusRule: regla({
                overrides: [
                    { local: null, franchise: MARCA, alertsRequired: 1, bonusAwarded: { day: 2, night: 2 }, note: '' },
                    { local: LOCAL, franchise: null, alertsRequired: 1, bonusAwarded: { day: 9, night: 9 }, note: '' },
                ],
            }) },
            establishment: establecimiento(LOCAL, MARCA),
        });
        assert.equal(r.applies && r.bonusPerAlert, 9);
    });

    await t.test('una excepción de otro local no afecta', () => {
        const r = resolver({
            menu: { bonusRule: regla({
                overrides: [{ local: OTRO_LOCAL, franchise: null, alertsRequired: 1, bonusAwarded: { day: 5, night: 5 }, note: '' }],
            }) },
            establishment: establecimiento(LOCAL),
        });
        assert.equal(r.applies && r.bonusPerAlert, 1);
        assert.equal(r.applies && r.appliedFrom, 'rule');
    });
});


test('cuándo NO bonifica, y por qué', async (t) => {
    // Los tres motivos son distintos y solo uno es un problema. Sin `reason` los
    // tres se guardan idénticos y sobre una novedad ya sellada no hay forma de
    // saber cuál fue.

    await t.test('sin regla asignada', () => {
        const r = resolver({ menu: { bonusRule: null } });
        assert.equal(r.applies, false);
        assert.equal(!r.applies && r.reason, 'sin-regla');
    });

    await t.test('la regla llega SIN popular — se trata como sin regla', () => {
        // El error más caro del sellado: un `bonusRule` sin popular es un
        // ObjectId, y el cero que produce queda congelado.
        const r = resolver({ menu: { bonusRule: 'aaaaaaaaaaaaaaaaaaaaaaaa' } });
        assert.equal(!r.applies && r.reason, 'sin-regla');
    });

    await t.test('la regla está desactivada', () => {
        // Éste es el que importa: son alertas que DEJARON de pagar sin que
        // nadie las tocara y sin que salte ningún error.
        const r = resolver({ menu: { bonusRule: regla({ active: false }) } });
        assert.equal(!r.applies && r.reason, 'regla-inactiva');
    });

    await t.test('el establecimiento queda fuera del alcance', () => {
        const r = resolver({
            menu: { bonusRule: regla({ scope: { mode: 'only', franchises: [], locals: [OTRO_LOCAL] } }) },
            establishment: establecimiento(LOCAL),
        });
        assert.equal(!r.applies && r.reason, 'fuera-de-alcance');
    });

    await t.test('aun sin bonificar, el sello queda fechado', () => {
        // "No bonifica" es una DECISIÓN. Verse igual que "nunca se selló"
        // borraría esa diferencia.
        const r = resolver({ menu: { bonusRule: null } });
        assert.ok(r.frozenAt instanceof Date);
    });
});


test('el dinero se congela', async (t) => {

    await t.test('guarda cuánto valía un bono en ese momento', () => {
        const r = resolver({ settings: { pointValue: 0.35 } });
        assert.equal(r.applies && r.pointValue, 0.35);
    });

    await t.test('sin valor cargado queda null, no cero', () => {
        // Un cero diría "el bono vale nada"; null dice "no había valor", que es
        // lo que pasó y se puede revisar.
        const r = resolver({ settings: {} });
        assert.equal(r.applies && r.pointValue, null);
    });

    await t.test('la tasa de cambio NO se congela', () => {
        const r = resolver({ settings: { pointValue: 0.20, exchangeRate: 700 } });
        assert.equal('exchangeRate' in (r as object), false);
    });
});


test('`at` y `frozenAt` son fechas distintas', async (t) => {
    // Estuvieron juntas y era un error esperando: `at` es cuándo OCURRIÓ —con eso
    // se busca el turno— y `frozenAt` es cuándo se DECIDIÓ. Una novedad del
    // sábado validada el lunes tiene que resolver el sábado y sellarse el lunes.

    const sabado = new Date('2026-08-15T12:00:00Z');  // getDay() === 6
    const lunes = new Date('2026-08-17T09:00:00Z');

    await t.test('el sello lleva la fecha de la decisión, no la del hecho', () => {
        const r = resolver({ at: sabado, frozenAt: lunes });
        assert.equal(r.frozenAt.toISOString(), lunes.toISOString());
    });

    await t.test('el turno se busca con la fecha del hecho', () => {
        // Horario solo para el sábado: si se resolviera con el lunes, no lo
        // encontraría y caería a la jornada base.
        const r = resolver({
            user: { workSchedule: { shiftType: 'diurno', scheduleByDay: { '6': { shift: 'nocturno' } } } },
            at: sabado,
            frozenAt: lunes,
        });
        assert.equal(r.applies && r.workShift, 'night');
        assert.equal(r.applies && r.shiftSource, 'regla');
    });

    await t.test('también en el sello de "no bonifica"', () => {
        const r = resolver({ menu: { bonusRule: null }, at: sabado, frozenAt: lunes });
        assert.equal(r.frozenAt.toISOString(), lunes.toISOString());
    });
});


test('es una función pura', async (t) => {

    await t.test('no modifica lo que recibe', () => {
        const entrada = {
            user: operador('diurno'),
            menu: { bonusRule: regla({ alertsRequired: 4 }) },
            establishment: establecimiento(),
            settings: { pointValue: 0.20 },
        };
        const copia = JSON.parse(JSON.stringify(entrada));

        resolveBonusForNovelty(entrada as never);

        assert.deepEqual(JSON.parse(JSON.stringify(entrada)), copia);
    });

    await t.test('con la misma entrada devuelve lo mismo', () => {
        const args = {
            user: operador('nocturno'),
            menu: { bonusRule: regla({ alertsRequired: 3, bonusAwarded: { day: 1, night: 1.5 } }) },
            establishment: establecimiento(),
            settings: { pointValue: 0.20 },
            at: new Date('2026-08-15T12:00:00Z'),
            frozenAt: new Date('2026-08-17T09:00:00Z'),
        };
        assert.deepEqual(
            resolveBonusForNovelty(args as never),
            resolveBonusForNovelty(args as never),
        );
    });
});
