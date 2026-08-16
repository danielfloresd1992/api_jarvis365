import { Types } from 'mongoose';
import BonusRuleModel from './bonusRule.model.js';
import MenuModel from '../menu/menu.model.js';

// ══════════════════════════════════════════════════════════════════════
// CRUD DE LAS REGLAS DE BONIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Una regla dice cuánto bonifica una alerta, dónde y cuántas hacen falta. Se
// define una vez y la comparten todas las alertas que tengan las mismas
// condiciones — el reglamento las repite en decenas de ítems.


/** Cuántas alertas usan cada regla. Es lo que decide si se puede borrar. */
const alertasQueLaUsan = (id) => MenuModel.countDocuments({ bonusRule: id });


/**
 * Deja el cuerpo con la forma del modelo y con números usables.
 *
 * Se arma campo por campo y no con un spread del body: así una clave de más en
 * la petición no llega a la base, y los números que son divisores quedan
 * siempre dentro de rango.
 */
const normalizar = (body = {}) => {
    const numero = (valor, porDefecto, minimo = 0) => {
        const n = Number(valor);
        return Number.isFinite(n) && n >= minimo ? n : porDefecto;
    };

    // Cuánto otorga, con la misma forma en la regla y en cada excepción.
    const cuantoOtorga = (fuente = {}, porDefecto = 1) => ({
        // Mínimo 1: es divisor al calcular cuánto vale cada alerta.
        alertsRequired: numero(fuente.alertsRequired, 1, 1),
        bonusAwarded: {
            day: numero(fuente.bonusAwarded?.day, porDefecto),
            night: numero(fuente.bonusAwarded?.night, porDefecto),
        },
    });

    const ids = (lista) => (Array.isArray(lista) ? lista : [])
        .filter(id => Types.ObjectId.isValid(id));

    return {
        name: String(body.name || '').trim(),
        description: String(body.description || '').trim(),
        regulationCode: String(body.regulationCode || '').trim(),

        ...cuantoOtorga(body),

        scope: {
            mode: ['all', 'only', 'except'].includes(body.scope?.mode) ? body.scope.mode : 'all',
            franchises: ids(body.scope?.franchises),
            locals: ids(body.scope?.locals),
        },

        // Una excepción sin marca ni establecimiento no aplica en ningún lado:
        // se descarta acá en vez de guardarla y que nadie entienda por qué no
        // hace nada.
        overrides: (Array.isArray(body.overrides) ? body.overrides : [])
            .filter(o => o?.local || o?.franchise)
            .map(o => ({
                franchise: Types.ObjectId.isValid(o.franchise) ? o.franchise : null,
                local: Types.ObjectId.isValid(o.local) ? o.local : null,
                ...cuantoOtorga(o),
                note: String(o.note || '').trim(),
            })),

        active: body.active !== false,
    };
};


const controller = {

    /**
     * GET /bonus/rules — todas, con cuántas alertas usa cada una.
     *
     * `inUse` es lo que permite avisar antes de borrar, y lo que responde
     * "¿a cuántas alertas les cambio el valor si toco esta regla?".
     */
    async getBonusRules(req, res) {
        try {
            const reglas = await BonusRuleModel.find().sort({ name: 1 }).lean();

            // Un solo conteo agrupado en vez de una consulta por regla.
            const uso = await MenuModel.aggregate([
                { $match: { bonusRule: { $ne: null } } },
                { $group: { _id: '$bonusRule', total: { $sum: 1 } } },
            ]);
            const porRegla = new Map(uso.map(u => [String(u._id), u.total]));

            return res.status(200).json({
                status: 200,
                rules: reglas.map(r => ({ ...r, inUse: porRegla.get(String(r._id)) || 0 })),
            });
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
        }
    },


    /** POST /bonus/rules */
    async createBonusRule(req, res) {
        try {
            const datos = normalizar(req.body);

            if (!datos.name) {
                return res.status(400).json({ status: 400, error: 'Bad request', message: 'La regla necesita un nombre' });
            }

            const regla = await BonusRuleModel.create({ ...datos, createdBy: req.session.userId });
            return res.status(201).json({ status: 201, message: 'ok', rule: { ...regla.toObject(), inUse: 0 } });
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
        }
    },


    /** PUT /bonus/rules/id=:id */
    async updateBonusRule(req, res) {
        try {
            const { id } = req.params;
            if (!Types.ObjectId.isValid(id)) {
                return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });
            }

            const datos = normalizar(req.body);
            if (!datos.name) {
                return res.status(400).json({ status: 400, error: 'Bad request', message: 'La regla necesita un nombre' });
            }

            const regla = await BonusRuleModel.findByIdAndUpdate(
                id,
                { ...datos, updatedBy: req.session.userId },
                { new: true, runValidators: true },
            ).lean();

            if (!regla) return res.status(404).json({ status: 404, error: 'Not found', message: 'La regla no existe' });

            const enUso = await alertasQueLaUsan(id);
            return res.status(200).json({ status: 200, message: 'ok', rule: { ...regla, inUse: enUso } });
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
        }
    },


    /**
     * DELETE /bonus/rules/id=:id
     *
     * Una regla EN USO no se borra. Borrarla dejaría a sus alertas apuntando a
     * un documento que no existe, y saldrían de los cortes sin dar ningún
     * error — la peor forma de dejar de pagar. Para eso está desactivarla.
     */
    async deleteBonusRule(req, res) {
        try {
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
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
        }
    },


    /**
     * PUT /bonus/menu/id=:id — le asigna (o le quita) la regla a una alerta.
     *
     * Endpoint propio y no el PUT general de menú por dos razones: aquel exige
     * SUPER usuario y esto es trabajo de administración de bonos, y además
     * manda la alerta entera cuando acá solo cambian dos campos.
     *
     * `bonusReviewed` se marca siempre: aunque se deje sin regla, alguien ya
     * decidió sobre esta alerta. Sin eso, "no bonifica" y "nadie la miró" serían
     * el mismo dato.
     */
    async setMenuBonusRule(req, res) {
        try {
            const { id } = req.params;
            if (!Types.ObjectId.isValid(id)) {
                return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });
            }

            const { bonusRule } = req.body ?? {};

            // null es válido y significa "esta alerta no bonifica".
            if (bonusRule !== null && bonusRule !== undefined && !Types.ObjectId.isValid(bonusRule)) {
                return res.status(400).json({ status: 400, error: 'Bad request', message: 'bonusRule inválido' });
            }

            if (bonusRule) {
                const existe = await BonusRuleModel.exists({ _id: bonusRule });
                if (!existe) return res.status(404).json({ status: 404, error: 'Not found', message: 'La regla no existe' });
            }

            const alerta = await MenuModel.findByIdAndUpdate(
                id,
                { bonusRule: bonusRule || null, bonusReviewed: true },
                { new: true },
            ).select('es en category bonusRule bonusReviewed').lean();

            if (!alerta) return res.status(404).json({ status: 404, error: 'Not found', message: 'La alerta no existe' });

            return res.status(200).json({ status: 200, message: 'ok', menu: alerta });
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
        }
    },
};


export default controller;
