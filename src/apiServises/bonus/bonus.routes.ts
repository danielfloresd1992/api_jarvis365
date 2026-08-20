import express from 'express';
import { Types } from 'mongoose';
import nameApi from '../../libs/name_api.js';
import { validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import BonusSettingsModel from './bonusSettings.model.js';
import BonusRuleModel from './bonusRule.model.js';
import BonusCategoryModel from './bonusCategory.model.js';
import MenuModel from '../menu/menu.model.js';
import UserModel from '../user/user.model.js';
import LocalModel from '../local/local.model.js';
import { buildBonusLedger, countNovelties, MAX_DIAS } from './bonusLedger.lib.js';
import { getBonusPointValue, saveBonusSettings, DEFAULT_POINT_VALUE, DEFAULT_EXCHANGE_RATE } from './bonusSettings.lib.js';
import bonusSettingsSchema from './bonusSettings.schema.js';
import bonusRuleSchema, { menuBonusRulesSchema } from './bonusRule.schema.js';
import bonusCategorySchema from './bonusCategory.schema.js';
import bonusLedgerQuerySchema from './bonusLedger.schema.js';

const routerBonus = express.Router();


/** Cómo validar un cuerpo: todos los errores juntos y sin claves de más. */
const OPCIONES_VALIDACION = { abortEarly: false, stripUnknown: true };


// ══════════════════════════════════════════════════════════════════════
// LOS VALORES GLOBALES
// ══════════════════════════════════════════════════════════════════════
// Cuánto vale un bono y a qué cambio se paga. Dos números para todo el sistema.


/**
 * GET /bonus/settings — las dos variables globales del sistema.
 *
 *   pointValue    cuánto vale UN bono, en dólares
 *   exchangeRate  la tasa del BCV con la que se paga en bolívares
 *
 * Lo lee cualquiera con sesión: la pantalla las muestra y el informe las
 * necesita para explicar los totales. Cambiarlas sí es de admin.
 *
 * Si nunca se configuró devuelve los valores por defecto sin crear nada: leer
 * no debería escribir en la base.
 */
routerBonus.get(`${nameApi}/bonus/settings`, validateSession, asyncHandler(async (req, res) => {
    const ajustes = await BonusSettingsModel.findOne().lean();

    return res.status(200).json({
        status: 200,
        pointValue: ajustes?.pointValue ?? DEFAULT_POINT_VALUE,
        exchangeRate: ajustes?.exchangeRate ?? DEFAULT_EXCHANGE_RATE,
        updatedAt: ajustes?.updatedAt ?? null,
        updatedBy: ajustes?.updatedBy ?? null,
        configured: Boolean(ajustes),
    });
}));


/**
 * PUT /bonus/settings — cambia el valor del bono, la tasa, o las dos.
 * Solo administradores.
 *
 * Acepta cambios parciales: mandar solo `exchangeRate` deja el valor del bono
 * como estaba. Es lo habitual, porque la tasa cambia mucho más seguido.
 *
 * El par anterior se conserva en el historial con quién lo cambió: un corte se
 * audita semanas después y hay que poder responder por qué se pagó lo que se
 * pagó.
 *
 * No recalcula nada hacia atrás. Las novedades ya selladas conservan el valor
 * con el que se sellaron; el nuevo rige de acá en adelante.
 */
routerBonus.put(`${nameApi}/bonus/settings`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const validado = await bonusSettingsSchema.validate(req.body, OPCIONES_VALIDACION);

    // Solo lo que vino de verdad. Un campo en null es "no lo toques", y mandarlo
    // igual dejaría en el historial un cambio del valor del bono cada vez que
    // alguien actualiza la tasa.
    const cambios = Object.fromEntries(
        Object.entries(validado).filter(([, valor]) => valor != null),
    );

    const ajustes = await saveBonusSettings(cambios, {
        nameUser: req.session.name,
        _id: req.session.userId,
    });

    return res.status(200).json({
        status: 200,
        message: 'ok',
        pointValue: ajustes.pointValue,
        exchangeRate: ajustes.exchangeRate,
        updatedAt: ajustes.updatedAt,
        updatedBy: ajustes.updatedBy,
    });
}));


/**
 * GET /bonus/settings/history — los cambios del valor, del más reciente al más
 * viejo. Solo administradores: es información de auditoría.
 */
routerBonus.get(`${nameApi}/bonus/settings/history`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const ajustes = await BonusSettingsModel.findOne().lean();
    const historial = [...(ajustes?.history ?? [])].reverse();

    return res.status(200).json({
        status: 200,
        current: {
            pointValue: ajustes?.pointValue ?? DEFAULT_POINT_VALUE,
            exchangeRate: ajustes?.exchangeRate ?? DEFAULT_EXCHANGE_RATE,
        },
        history: historial,
    });
}));


// ══════════════════════════════════════════════════════════════════════
// LAS REGLAS
// ══════════════════════════════════════════════════════════════════════
// Cuántos bonos otorga cada alerta, dónde, y cuántas hacen falta. Una regla la
// comparten muchas alertas: el reglamento repite las mismas condiciones en
// decenas de ítems, así que se define una vez y se reutiliza.
//
// La lista la ve cualquier sesión —la pantalla de una novedad muestra cuánto
// bonificó, y el corte la necesita para explicar sus totales—; tocarlas es de
// administrador, porque cambiar una regla cambia lo que se paga.


/** Cuántas alertas usan cada regla. Es lo que decide si se puede borrar. */
const alertasQueLaUsan = (id: string): Promise<number> =>
    MenuModel.countDocuments({ 'bonusRules.rule': id });


/**
 * GET /bonus/rules — todas, con cuántas alertas usa cada una.
 *
 * `inUse` es lo que permite avisar antes de borrar, y lo que responde "¿a
 * cuántas alertas les cambio el valor si toco esta regla?".
 */
routerBonus.get(`${nameApi}/bonus/rules`, validateSession, asyncHandler(async (req, res) => {
    const reglas = await BonusRuleModel.find().sort({ name: 1 }).lean();

    // Un solo conteo agrupado en vez de una consulta por regla.
    //
    // El tipo va escrito a mano porque `MenuModel` todavia es JavaScript sin
    // tipos: un aggregate no puede inferir su forma de salida ni cuando el modelo
    // esta tipado, asi que declararla es lo unico que evita un `any` suelto.
    //
    // Se desenrolla el array de asignaciones y se cuenta por ALERTA distinta:
    // una alerta que usa la misma regla en dos alcances distintos cuenta una
    // vez, no dos.
    const uso: { _id: Types.ObjectId; total: number }[] = await MenuModel.aggregate([
        { $unwind: '$bonusRules' },
        { $group: { _id: { rule: '$bonusRules.rule', menu: '$_id' } } },
        { $group: { _id: '$_id.rule', total: { $sum: 1 } } },
    ]);
    const porRegla = new Map(uso.map(u => [String(u._id), u.total]));

    return res.status(200).json({
        status: 200,
        rules: reglas.map(r => ({ ...r, inUse: porRegla.get(String(r._id)) || 0 })),
    });
}));


/** POST /bonus/rules — lo que acepta está en bonusRule.schema.js */
routerBonus.post(`${nameApi}/bonus/rules`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const datos = await bonusRuleSchema.validate(req.body, OPCIONES_VALIDACION);

    const regla = await BonusRuleModel.create({ ...datos, createdBy: req.session.userId });
    return res.status(201).json({ status: 201, message: 'ok', rule: { ...regla.toObject(), inUse: 0 } });
}));


/** PUT /bonus/rules/id=:id */
routerBonus.put(`${nameApi}/bonus/rules/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });
    }

    const datos = await bonusRuleSchema.validate(req.body, OPCIONES_VALIDACION);

    const regla = await BonusRuleModel.findByIdAndUpdate(
        id,
        { ...datos, updatedBy: req.session.userId },
        { new: true, runValidators: true },
    ).lean();

    if (!regla) return res.status(404).json({ status: 404, error: 'Not found', message: 'La regla no existe' });

    const enUso = await alertasQueLaUsan(id);
    return res.status(200).json({ status: 200, message: 'ok', rule: { ...regla, inUse: enUso } });
}));


/**
 * DELETE /bonus/rules/id=:id
 *
 * Una regla EN USO no se borra. Borrarla dejaría a sus alertas apuntando a un
 * documento que no existe, y saldrían de los cortes sin dar ningún error — la
 * peor forma de dejar de pagar. Para eso está desactivarla.
 */
routerBonus.delete(`${nameApi}/bonus/rules/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });
    }

    const enUso = await alertasQueLaUsan(id);
    if (enUso > 0) {
        return res.status(409).json({
            status: 409,
            error: 'conflict',
            inUse: enUso,
            message: `La usan ${enUso} alerta(s). Desactivala en lugar de borrarla: deja de ofrecerse pero las que ya la tienen no cambian.`,
        });
    }

    const borrada = await BonusRuleModel.findByIdAndDelete(id);
    if (!borrada) return res.status(404).json({ status: 404, error: 'Not found', message: 'La regla no existe' });

    return res.status(200).json({ status: 200, message: 'ok' });
}));


/**
 * PUT /bonus/menu/id=:id — escribe las asignaciones de una alerta.
 *
 * Recibe la lista COMPLETA de sus asignaciones: cada una con su regla y su
 * alcance. La misma alerta puede ir con reglas distintas según el
 * establecimiento —"3 por bono" en las Franciscas, "1 por bono" en los
 * Mister—, y por eso es una lista y por eso lleva el alcance de su lado.
 *
 * Es la lista completa y no un delta para que el conjunto se pueda validar
 * junto: dos asignaciones generales serían ambiguas, y eso solo se ve mirando
 * todas. Lista vacía es válida: "esta alerta no bonifica".
 *
 * Vive acá y no en el router de menú porque es administración de bonos: aquel
 * exige SUPER usuario y esto lo hace un administrador.
 *
 * `bonusReviewed` se marca siempre: aunque quede vacía, alguien ya decidió
 * sobre esta alerta. Sin eso, "no bonifica" y "nadie la miró" serían el mismo
 * dato.
 */
routerBonus.put(`${nameApi}/bonus/menu/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });
    }

    const { bonifies, bonusRules } = await menuBonusRulesSchema.validate(req.body, OPCIONES_VALIDACION);

    // Todas las reglas referidas tienen que existir. Se comprueba antes de
    // escribir: una asignación a una regla inexistente pasaría el esquema
    // —el id tiene forma válida— y dejaría la alerta apuntando a la nada, que
    // saldría del corte sin dar ningún error.
    const idsDeRegla = [...new Set(bonusRules.map(a => a.rule))];
    if (idsDeRegla.length) {
        const existentes = await BonusRuleModel.countDocuments({ _id: { $in: idsDeRegla } });
        if (existentes !== idsDeRegla.length) {
            return res.status(404).json({ status: 404, error: 'Not found', message: 'Alguna de las reglas no existe' });
        }
    }

    const alerta = await MenuModel.findByIdAndUpdate(
        id,
        { bonifies, bonusRules, bonusReviewed: true },
        { new: true, runValidators: true },
    ).select('es en category bonifies bonusRules bonusReviewed').lean();

    if (!alerta) return res.status(404).json({ status: 404, error: 'Not found', message: 'La alerta no existe' });

    return res.status(200).json({ status: 200, message: 'ok', menu: alerta });
}));


// ══════════════════════════════════════════════════════════════════════
// LAS CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════
// El catálogo con el que se agrupan las REGLAS en los cortes.
//
// Vivía en /menu/bonus-categories y categorizaba la alerta. Se mudó acá con el
// resto del sistema: ahora categoriza la regla, que es donde el criterio de
// bonificación ya estaba definido.


/**
 * Un texto convertido en clave.
 *
 * Sin esto, "Servicio" y "servicio " serían dos categorías distintas a la vista
 * iguales, y se repartirían las reglas entre ambas.
 */
const aClave = (texto = '') => texto
    // NFD separa cada acento de su letra y \p{M} se lleva esas marcas. Se usa la
    // clase Unicode y no un rango escrito a mano: un rango de combinantes queda
    // como caracteres invisibles y cualquier editor puede comérselos.
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');


/** Escapa lo que en una expresión regular significaría otra cosa. */
const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


/** Cuántas reglas usan esta categoría. Es lo que decide si se puede borrar. */
const reglasQueLaUsan = (value: string) => BonusRuleModel.countDocuments({ bonusCategory: value });


/**
 * GET /bonus/categories?includeInactive=true
 *
 * Por defecto solo las activas, que es lo que necesita el selector al crear una
 * regla. La pantalla de gestión pide también las inactivas para reactivarlas.
 *
 * Cada una viene con `inUse`: cuántas reglas la tienen. Pedirlo aparte por fila
 * serían tantas consultas como categorías.
 */
routerBonus.get(`${nameApi}/bonus/categories`, validateSession, asyncHandler(async (req, res) => {
    const filtro = req.query.includeInactive === 'true' ? {} : { active: true };

    const categorias = await BonusCategoryModel.find(filtro)
        .sort({ order: 1, es: 1 })
        .populate('createdBy updatedBy', 'name surName img')
        .lean();

    const usos: { _id: string; total: number }[] = await BonusRuleModel.aggregate([
        { $match: { bonusCategory: { $ne: null } } },
        { $group: { _id: '$bonusCategory', total: { $sum: 1 } } },
    ]);
    const porValue = new Map(usos.map(u => [u._id, u.total]));

    return res.status(200).json({
        status: 200,
        categories: categorias.map(c => ({ ...c, inUse: porValue.get(c.value) || 0 })),
    });
}));


/** POST /bonus/categories — la clave se deriva de la etiqueta en español. */
routerBonus.post(`${nameApi}/bonus/categories`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const datos = await bonusCategorySchema.validate(req.body, OPCIONES_VALIDACION);
    const value = aClave(datos.es);

    if (!value) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'El nombre no deja armar una clave usable' });
    }

    // Sin distinguir mayúsculas: el índice único sí las distingue, así que sin
    // esto podrían convivir 'Servicio' y 'servicio'.
    const repetida = await BonusCategoryModel.findOne({ value: new RegExp(`^${escaparRegex(value)}$`, 'i') }).lean();
    if (repetida) {
        return res.status(409).json({ status: 409, error: 'conflict', message: `Ya existe la categoría "${repetida.es}"` });
    }

    const categoria = await BonusCategoryModel.create({ ...datos, value, createdBy: req.session.userId });
    return res.status(201).json({ status: 201, message: 'ok', category: { ...categoria.toObject(), inUse: 0 } });
}));


/**
 * PUT /bonus/categories/id=:id
 *
 * `value` NO se puede cambiar y el esquema lo descarta aunque llegue: las reglas
 * guardan esa cadena, y cambiarla las dejaría apuntando a una clave que no
 * existe — saldrían de los cortes sin dar ningún error.
 */
routerBonus.put(`${nameApi}/bonus/categories/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });
    }

    // `value` no viene en el esquema, así que no hay forma de que un PUT lo
    // cambie ni por accidente ni a propósito.
    const datos = await bonusCategorySchema.validate(req.body, OPCIONES_VALIDACION);

    const categoria = await BonusCategoryModel.findByIdAndUpdate(
        id, { ...datos, updatedBy: req.session.userId }, { new: true, runValidators: true },
    ).lean();

    if (!categoria) return res.status(404).json({ status: 404, error: 'Not found', message: 'La categoría no existe' });

    const enUso = await reglasQueLaUsan(categoria.value);
    return res.status(200).json({ status: 200, message: 'ok', category: { ...categoria, inUse: enUso } });
}));


/**
 * DELETE /bonus/categories/id=:id
 *
 * Una categoría EN USO no se borra: se desactiva. Borrarla dejaría a sus reglas
 * agrupando por una clave inexistente y desaparecerían del corte sin avisar.
 */
routerBonus.delete(`${nameApi}/bonus/categories/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });
    }

    const categoria = await BonusCategoryModel.findById(id).lean();
    if (!categoria) return res.status(404).json({ status: 404, error: 'Not found', message: 'La categoría no existe' });

    const enUso = await reglasQueLaUsan(categoria.value);
    if (enUso > 0) {
        return res.status(409).json({
            status: 409, error: 'conflict', inUse: enUso,
            message: `La usan ${enUso} regla(s). Desactivala en lugar de borrarla: deja de ofrecerse pero las que ya la tienen no cambian.`,
        });
    }

    await BonusCategoryModel.findByIdAndDelete(id);
    return res.status(200).json({ status: 200, message: 'ok' });
}));




// ══════════════════════════════════════════════════════════════════════
// EL LIBRO DE BONOS
// ══════════════════════════════════════════════════════════════════════
// Lo que en la hoja de cálculo es `Op_DataBase`, cargado a mano: una fila por
// día, turno, local, operador y código, con su cantidad. Acá sale de las
// novedades ya selladas, sin que nadie escriba nada.


/** Cuántas novedades se agrupan sin pensarlo dos veces. */
const TECHO_NOVEDADES = 400_000;

/**
 * Los nombres de los ids que aparecieron, una sola vez cada uno.
 *
 * Es la diferencia entre mandar "Bocas Grill Doral" nueve mil veces y mandarlo
 * una. Sobre un resultado de ese tamaño, repetir los nombres en cada fila más
 * que duplica el JSON — y son tres consultas chicas por `$in`, no un `$lookup`
 * por fila.
 */
const catalogosDe = async (filas: { local?: unknown; operador?: unknown; alerta?: unknown }[]) => {
    const unicos = (clave: 'local' | 'operador' | 'alerta') =>
        [...new Set(filas.map(f => f[clave]).filter(Boolean).map(String))];

    const [locales, operadores, alertas] = await Promise.all([
        LocalModel.find({ _id: { $in: unicos('local') } }).select('name').lean(),
        UserModel.find({ _id: { $in: unicos('operador') } }).select('name surName').lean(),
        MenuModel.find({ _id: { $in: unicos('alerta') } }).select('es en category').lean(),
    ]);

    const porId = <T extends { _id: unknown }>(lista: T[], texto: (x: T) => unknown) =>
        Object.fromEntries(lista.map(x => [String(x._id), texto(x)]));

    return {
        locales: porId(locales as never[], (l: never) => (l as { name?: string }).name ?? null),
        operadores: porId(operadores as never[], (u: never) => {
            const x = u as { name?: string; surName?: string };
            return [x.name, x.surName].filter(Boolean).join(' ') || null;
        }),
        alertas: porId(alertas as never[], (m: never) => {
            const x = m as { es?: string; en?: string; category?: string };
            return { es: x.es ?? null, en: x.en ?? null, category: x.category ?? null };
        }),
    };
};


/**
 * GET /bonus/ledger — las novedades de un rango, ya agrupadas.
 *
 *     ?desde=2026-08-01&hasta=2026-08-16
 *     &operador=<id>            opcional, para el corte individual
 *     &establecimiento=<id>     opcional
 *     &aprobadas=true           opcional; sin esto vienen todas
 *
 * DEVUELVE EL AGRUPADO, NO LAS NOVEDADES. Tres meses son del orden de cien mil
 * documentos con imágenes y validaciones adentro; agrupados por (día, turno,
 * local, operador, alerta) quedan unos pocos miles de filas. Mandar los
 * documentos crudos no es "más flexible": es la forma segura de quedarse sin
 * memoria en el server y de colgar el navegador después.
 *
 * Tres cosas lo mantienen parado:
 *
 *   1. El rango es obligatorio y tope de MAX_DIAS. Se valida con yup antes de
 *      tocar Mongo, así que un rango absurdo cuesta un 400 y cero base.
 *   2. Se CUENTA antes de agrupar. Si el rango trae una barbaridad, responde
 *      413 con el número — mejor que dejar la agregación corriendo diez
 *      minutos para caerse igual.
 *   3. La agregación proyecta seis campos antes de agrupar y corre con
 *      allowDiskUse, así no choca contra el límite de 100 MB por etapa.
 *
 * Los nombres van aparte, en `catalogos`, indexados por id: en las filas van
 * los ids pelados.
 *
 * Lo puede leer cualquier sesión. Es lo mismo que ya se ve novedad por novedad
 * en la aplicación; acá solo está sumado.
 */
routerBonus.get(`${nameApi}/bonus/ledger`, validateSession, asyncHandler(async (req, res) => {

    const { desde, hasta, operador, establecimiento, aprobadas } =
        await bonusLedgerQuerySchema.validate(req.query, OPCIONES_VALIDACION);

    const params = { desde, hasta, operador, establecimiento, aprobadas };

    const novedades = await countNovelties(params);
    if (novedades > TECHO_NOVEDADES) {
        return res.status(413).json({
            status: 413,
            error: 'Payload too large',
            message: `El rango abarca ${novedades.toLocaleString('es-VE')} novedades, más de las que se pueden agrupar de una. `
                + 'Achicá el rango o filtrá por operador o establecimiento.',
            novedades,
            maximo: TECHO_NOVEDADES,
        });
    }

    const filas = await buildBonusLedger(params);
    const catalogos = await catalogosDe(filas);

    return res.status(200).json({
        status: 200,
        rango: { desde, hasta, dias: Math.round((+hasta - +desde) / 86_400_000) + 1, maximoDias: MAX_DIAS },
        totales: {
            novedades,
            filas: filas.length,
            bonos: filas.reduce((n, f) => n + (f.bonos || 0), 0),
            selladas: filas.reduce((n, f) => n + (f.selladas || 0), 0),
        },
        catalogos,
        filas,
    });
}));


export { routerBonus, getBonusPointValue };
