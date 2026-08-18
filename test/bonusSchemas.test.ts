import test from 'node:test';
import assert from 'node:assert/strict';
import bonusRuleSchema, { menuBonusRulesSchema, scopeSchema } from '../src/apiServises/bonus/bonusRule.schema.ts';
import bonusSettingsSchema from '../src/apiServises/bonus/bonusSettings.schema.ts';
import { describeError } from '../src/middleware/asyncHandler.ts';

// ══════════════════════════════════════════════════════════════════════
// LA VALIDACIÓN DE ENTRADA
// ══════════════════════════════════════════════════════════════════════
// Estos esquemas reemplazaron a una normalización que CORREGÍA en silencio lo que
// venía mal: un `alertsRequired: 0` quedaba en 1, y un `scope.mode` mal escrito
// caía en 'all' y ensanchaba el alcance a TODOS los establecimientos — con 200 y
// sin una señal.
//
// Lo que se prueba acá es justamente eso: que ahora rechazan. Es la mitad del
// valor del cambio, y sin test se pierde en la primera "simplificación".

const OPC = { abortEarly: false, stripUnknown: true };
const ID = '507f1f77bcf86cd799439011';
const REGLA_OK = { name: 'Perimetrales' };

/** Afirma que el esquema rechaza, y devuelve el primer mensaje. */
const rechaza = async (esquema: { validate: Function }, cuerpo: unknown): Promise<string> => {
    try {
        await esquema.validate(cuerpo, OPC);
        assert.fail(`debió rechazar: ${JSON.stringify(cuerpo)}`);
    }
    catch (e) {
        const error = e as { errors?: string[]; message?: string };
        assert.ok(error.errors?.length, 'no parece un error de validación');
        return error.errors![0];
    }
};


test('la regla rechaza lo que antes corregía en silencio', async (t) => {

    await t.test('alertsRequired en cero — era divisor, daría infinito', async () => {
        await rechaza(bonusRuleSchema, { ...REGLA_OK, alertsRequired: 0 });
    });

    await t.test('alertsRequired no numérico', async () => {
        await rechaza(bonusRuleSchema, { ...REGLA_OK, alertsRequired: 'cuatro' });
    });

    await t.test('alertsRequired decimal — no existen 2,5 alertas', async () => {
        await rechaza(bonusRuleSchema, { ...REGLA_OK, alertsRequired: 2.5 });
    });

    await t.test('bonos negativos', async () => {
        await rechaza(bonusRuleSchema, { ...REGLA_OK, bonusAwarded: { day: 1, night: -5 } });
    });

    await t.test('sin nombre', async () => {
        await rechaza(bonusRuleSchema, {});
    });

    await t.test('nombre en blanco', async () => {
        await rechaza(bonusRuleSchema, { name: '   ' });
    });
});


test('la regla rechaza configuraciones que no pagarían nunca', async (t) => {

    await t.test('una excepción sin marca ni establecimiento', async () => {
        await rechaza(bonusRuleSchema, { ...REGLA_OK, overrides: [{ note: 'x' }] });
    });

    await t.test('una excepción con las dos — la de marca quedaría muerta', async () => {
        await rechaza(bonusRuleSchema, { ...REGLA_OK, overrides: [{ franchise: ID, local: ID }] });
    });
});


test('el alcance de una asignación', async (t) => {

    await t.test("'only' sin ninguna marca ni local se rechaza", async () => {
        // Una asignación que no aplica en ningún lado: se guardaría sin error y
        // no pagaría jamás.
        await rechaza(scopeSchema, { mode: 'only' });
    });

    await t.test("'except' vacío SÍ se acepta — equivale a 'en todos'", async () => {
        const r = await scopeSchema.validate({ mode: 'except' }, OPC);
        assert.equal(r.mode, 'except');
    });

    await t.test('un modo mal escrito se rechaza — antes ensanchaba el alcance a TODOS', async () => {
        // Escribirlo en español es el error más natural del mundo, y convertía
        // "solo en estos 3 locales" en "en todos los establecimientos".
        await rechaza(scopeSchema, { mode: 'solo' });
    });

    await t.test('un id de marca mal tipeado se rechaza — antes se descartaba solo', async () => {
        // Se descartaba en silencio y la asignación quedaba con alcance
        // incompleto: no aplicaba en una marca que el admin creía haber incluido.
        await rechaza(scopeSchema, { mode: 'only', franchises: ['typo'] });
    });

    await t.test('el alcance en la REGLA se ignora: ya no vive ahí', async () => {
        // Un cliente viejo que todavía mande `scope` en la regla no rompe nada:
        // se descarta. El alcance ahora vive en cada asignación de la alerta.
        const r = await bonusRuleSchema.validate({ ...REGLA_OK, scope: { mode: 'only' } }, OPC) as Record<string, unknown>;
        assert.equal(r.scope, undefined);
    });
});


test('la regla acepta lo válido y pone los defectos', async (t) => {

    await t.test('una regla mínima queda 1x1 y activa', async () => {
        const r = await bonusRuleSchema.validate(REGLA_OK, OPC);
        assert.equal(r.alertsRequired, 1);
        assert.equal(r.bonusAwarded.day, 1);
        assert.equal(r.active, true);
    });

    await t.test('3x1 con nocturno a 1,5 — el caso del reglamento', async () => {
        const r = await bonusRuleSchema.validate(
            { ...REGLA_OK, alertsRequired: 3, bonusAwarded: { day: 1, night: 1.5 } }, OPC);
        assert.equal(r.alertsRequired, 3);
        assert.equal(r.bonusAwarded.night, 1.5);
    });

    await t.test('createdBy se descarta — lo pone el servidor', async () => {
        const r = await bonusRuleSchema.validate({ ...REGLA_OK, createdBy: ID }, OPC) as Record<string, unknown>;
        assert.equal(r.createdBy, undefined);
    });
});


test('los valores globales', async (t) => {

    await t.test('un cuerpo vacío se rechaza — no es "no cambies nada"', async () => {
        await rechaza(bonusSettingsSchema, {});
    });

    await t.test('valores negativos', async () => {
        await rechaza(bonusSettingsSchema, { pointValue: -1 });
        await rechaza(bonusSettingsSchema, { exchangeRate: -0.5 });
    });

    await t.test('una tasa no numérica', async () => {
        await rechaza(bonusSettingsSchema, { exchangeRate: 'setecientos' });
    });

    await t.test('mandar solo la tasa deja el otro sin tocar', async () => {
        // Es lo habitual: la tasa cambia mucho más seguido que el valor del bono,
        // y mandar los dos ensuciaría el historial con un cambio que no ocurrió.
        const r = await bonusSettingsSchema.validate({ exchangeRate: 700 }, OPC);
        assert.equal(r.exchangeRate, 700);
        assert.equal(r.pointValue ?? null, null);
    });

    await t.test('un string numérico se castea', async () => {
        // Llega así desde un <input type=number> del front.
        const r = await bonusSettingsSchema.validate({ pointValue: '0.20' }, OPC);
        assert.equal(r.pointValue, 0.2);
    });

    await t.test('el cero es un valor legítimo', async () => {
        // La tasa arranca en cero hasta que alguien la carga.
        const r = await bonusSettingsSchema.validate({ exchangeRate: 0 }, OPC);
        assert.equal(r.exchangeRate, 0);
    });
});


test('las asignaciones de una alerta', async (t) => {
    // Es una LISTA con alcance porque la misma alerta puede ir con reglas
    // distintas según el establecimiento.

    await t.test('una regla con id inválido se rechaza', async () => {
        await rechaza(menuBonusRulesSchema, { bonusRules: [{ rule: 'nope', scope: { mode: 'all' } }] });
    });

    await t.test('una asignación sin regla se rechaza', async () => {
        await rechaza(menuBonusRulesSchema, { bonusRules: [{ scope: { mode: 'all' } }] });
    });

    await t.test('lista vacía es VÁLIDA y significa "no bonifica"', async () => {
        const r = await menuBonusRulesSchema.validate({ bonusRules: [] }, OPC);
        assert.deepEqual(r.bonusRules, []);
    });

    await t.test('ausente se trata como lista vacía', async () => {
        const r = await menuBonusRulesSchema.validate({}, OPC);
        assert.deepEqual(r.bonusRules, []);
    });

    await t.test('dos asignaciones GENERALES se rechazan — no habría forma de saber cuál aplica', async () => {
        await rechaza(menuBonusRulesSchema, { bonusRules: [
            { rule: ID, scope: { mode: 'all' } },
            { rule: ID, scope: { mode: 'all' } },
        ] });
    });

    await t.test('una general más una por marca SÍ: es el caso de uso', async () => {
        const r = await menuBonusRulesSchema.validate({ bonusRules: [
            { rule: ID, scope: { mode: 'all' } },
            { rule: ID, scope: { mode: 'only', franchises: [ID] } },
        ] }, OPC);
        assert.equal(r.bonusRules.length, 2);
    });

    await t.test('el alcance de cada asignación se valida igual que suelto', async () => {
        await rechaza(menuBonusRulesSchema, { bonusRules: [{ rule: ID, scope: { mode: 'only' } }] });
    });
});


// ══════════════════════════════════════════════════════════════════════
test('describeError traduce cada fallo a su código', async (t) => {
    // De esta función depende que un fallo salga 400 o 500. Es pura, así que se
    // prueba con objetos que imitan lo que lanzan yup, Mongoose y multer.

    await t.test('yup y Mongoose: ValidationError → 400', () => {
        const r = describeError({ name: 'ValidationError', errors: ['falta el nombre', 'tasa inválida'] });
        assert.equal(r.status, 400);
        // Con abortEarly:false vienen todos, y se juntan para arreglar de una vez.
        assert.equal(r.message, 'falta el nombre. tasa inválida');
    });

    await t.test('Mongoose usa `errors` como OBJETO, no arreglo', () => {
        // De ahí el isArray antes de tocarlo: sin eso, un error de Mongoose
        // saldría con un mensaje ilegible.
        const r = describeError({ name: 'ValidationError', errors: { name: {} }, message: 'Path `name` is required.' });
        assert.equal(r.status, 400);
        assert.equal(r.message, 'Path `name` is required.');
    });

    await t.test('CastError → 400 con el campo', () => {
        const r = describeError({ name: 'CastError', path: 'bonusRule' });
        assert.equal(r.status, 400);
        assert.equal(r.field, 'bonusRule');
    });

    await t.test('duplicado (11000) → 409, no 500', () => {
        // Antes salía 500 y hacía parecer roto al servidor cuando el problema
        // era un nombre repetido.
        const r = describeError({ code: 11000, keyValue: { es: 'Mesa sucia' } });
        assert.equal(r.status, 409);
        assert.equal(r.field, 'es');
    });

    await t.test('edición concurrente → 409', () => {
        assert.equal(describeError({ name: 'VersionError' }).status, 409);
    });

    await t.test('multer → 400, es entrada del cliente', () => {
        assert.equal(describeError({ name: 'MulterError', message: 'File too large' }).status, 400);
    });

    await t.test('base caída → 503, para que el front reintente', () => {
        assert.equal(describeError({ name: 'MongooseServerSelectionError' }).status, 503);
    });

    await t.test('lo desconocido → 500', () => {
        assert.equal(describeError(new Error('boom')).status, 500);
    });

    await t.test('no explota con null', () => {
        // En JavaScript se puede lanzar cualquier cosa, no solo un Error.
        assert.equal(describeError(null).status, 500);
    });

    await t.test('siempre devuelve `message` — es lo que lee Client365', () => {
        for (const caso of [null, new Error('x'), { name: 'CastError' }, { code: 11000 }]) {
            assert.equal(typeof describeError(caso).message, 'string');
        }
    });
});
