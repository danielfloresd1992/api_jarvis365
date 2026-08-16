import express from 'express';
import nameApi from '../../libs/name_api.js';
import { validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import BonusSettingsModel from './bonusSettings.model.js';
import { getBonusPointValue, saveBonusSettings, DEFAULT_POINT_VALUE, DEFAULT_EXCHANGE_RATE } from './bonusSettings.lib.js';
import bonusRuleController from './bonusRule.controller.js';

const routerBonus = express.Router();


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
routerBonus.get(`${nameApi}/bonus/settings`, validateSession, async (req, res) => {
    try {
        const ajustes = await BonusSettingsModel.findOne().lean();

        return res.status(200).json({
            status: 200,
            pointValue: ajustes?.pointValue ?? DEFAULT_POINT_VALUE,
            exchangeRate: ajustes?.exchangeRate ?? DEFAULT_EXCHANGE_RATE,
            updatedAt: ajustes?.updatedAt ?? null,
            updatedBy: ajustes?.updatedBy ?? null,
            configured: Boolean(ajustes),
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
    }
});


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
routerBonus.put(`${nameApi}/bonus/settings`, validateSession, validateAdminUser, async (req, res) => {
    try {
        const cambios = {};

        // Se valida solo lo que viene: un campo ausente es "no lo toques", y un
        // campo presente con basura es un error que hay que avisar, no ignorar.
        for (const campo of ['pointValue', 'exchangeRate']) {
            if (req.body?.[campo] === undefined || req.body?.[campo] === null) continue;

            const numero = Number(req.body[campo]);
            if (!Number.isFinite(numero) || numero < 0) {
                return res.status(400).json({
                    status: 400,
                    error: 'Bad request',
                    message: `${campo} debe ser un número mayor o igual a cero`,
                });
            }
            cambios[campo] = numero;
        }

        if (Object.keys(cambios).length === 0) {
            return res.status(400).json({
                status: 400,
                error: 'Bad request',
                message: 'Hay que enviar pointValue, exchangeRate o ambos',
            });
        }

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
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
    }
});


/**
 * GET /bonus/settings/history — los cambios del valor, del más reciente al más
 * viejo. Solo administradores: es información de auditoría.
 */
routerBonus.get(`${nameApi}/bonus/settings/history`, validateSession, validateAdminUser, async (req, res) => {
    try {
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
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
    }
});


// ══════════════════════════════════════════════════════════════════════
// REGLAS
// ══════════════════════════════════════════════════════════════════════
// Cuántos bonos otorga cada alerta, dónde, y cuántas hacen falta.
//
// La lista la ve cualquier sesión —la pantalla de una novedad muestra cuánto
// bonificó, y el corte la necesita para explicar sus totales—; tocarlas es de
// administrador, porque cambiar una regla cambia lo que se paga.

routerBonus.get(`${nameApi}/bonus/rules`, validateSession, bonusRuleController.getBonusRules);

routerBonus.post(`${nameApi}/bonus/rules`, validateSession, validateAdminUser, bonusRuleController.createBonusRule);

routerBonus.put(`${nameApi}/bonus/rules/id=:id`, validateSession, validateAdminUser, bonusRuleController.updateBonusRule);

routerBonus.delete(`${nameApi}/bonus/rules/id=:id`, validateSession, validateAdminUser, bonusRuleController.deleteBonusRule);


/**
 * Le asigna la regla a una alerta.
 *
 * Vive acá y no en el router de menú porque es administración de bonos: aquel
 * exige SUPER usuario y esto lo hace un administrador, además de que manda la
 * alerta entera cuando acá solo cambian dos campos.
 */
routerBonus.put(`${nameApi}/bonus/menu/id=:id`, validateSession, validateAdminUser, bonusRuleController.setMenuBonusRule);


export { routerBonus, getBonusPointValue };
