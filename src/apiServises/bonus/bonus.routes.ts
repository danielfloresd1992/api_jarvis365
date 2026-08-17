import express from 'express';
import { Types } from 'mongoose';
import nameApi from '../../libs/name_api.js';
import { validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import BonusSettingsModel from './bonusSettings.model.js';
import BonusRuleModel from './bonusRule.model.js';
import MenuModel from '../menu/menu.model.js';
import { getBonusPointValue, saveBonusSettings, DEFAULT_POINT_VALUE, DEFAULT_EXCHANGE_RATE } from './bonusSettings.lib.js';
import bonusSettingsSchema from './bonusSettings.schema.js';
import bonusRuleSchema, { menuBonusRuleSchema } from './bonusRule.schema.js';

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
    MenuModel.countDocuments({ bonusRule: id });


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
    const uso: { _id: Types.ObjectId; total: number }[] = await MenuModel.aggregate([
        { $match: { bonusRule: { $ne: null } } },
        { $group: { _id: '$bonusRule', total: { $sum: 1 } } },
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
 * PUT /bonus/menu/id=:id — le asigna (o le quita) la regla a una alerta.
 *
 * Vive acá y no en el router de menú porque es administración de bonos: aquel
 * exige SUPER usuario y esto lo hace un administrador, además de que manda la
 * alerta entera cuando acá solo cambian dos campos.
 *
 * `bonusReviewed` se marca siempre: aunque se deje sin regla, alguien ya decidió
 * sobre esta alerta. Sin eso, "no bonifica" y "nadie la miró" serían el mismo
 * dato.
 */
routerBonus.put(`${nameApi}/bonus/menu/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });
    }

    // `bonusRule: null` es válido y significa "esta alerta no bonifica".
    const { bonusRule } = await menuBonusRuleSchema.validate(req.body, OPCIONES_VALIDACION);

    if (bonusRule) {
        const existe = await BonusRuleModel.exists({ _id: bonusRule });
        if (!existe) return res.status(404).json({ status: 404, error: 'Not found', message: 'La regla no existe' });
    }

    const alerta = await MenuModel.findByIdAndUpdate(
        id,
        { bonusRule, bonusReviewed: true },
        { new: true },
    ).select('es en category bonusRule bonusReviewed').lean();

    if (!alerta) return res.status(404).json({ status: 404, error: 'Not found', message: 'La alerta no existe' });

    return res.status(200).json({ status: 200, message: 'ok', menu: alerta });
}));


export { routerBonus, getBonusPointValue };
