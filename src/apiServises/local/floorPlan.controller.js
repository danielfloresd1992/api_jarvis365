import LocalModel from './local.model.js';
import FloorPlanModel, { FLOOR_PLAN_VERSION } from './floorPlan.model.js';
import { floorPlanValidate } from './floorPlan.schema.js';
import { allowedLocalIds, canSeeLocalId, forbidden } from '../access/access.middleware.js';



// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE MESAS DE UN LOCAL: leerlo y guardarlo
// ══════════════════════════════════════════════════════════════════════
//   GET /local/id=:id/floor-plan   el croquis, o `data: null` si el local no tiene
//   PUT /local/id=:id/floor-plan   lo guarda entero (lo crea la primera vez)
//   GET /local/floor-plans         todos los croquis de una vez (los locales que tienen)
//
// Que un local sin croquis conteste 200 con null, y no 404, es a propósito: así
// un 404 solo puede ser «la ruta no existe», que es lo que contesta un servidor
// al que todavía no se le desplegó esto, y Client365 puede decirlo.
//
// Los errores los traduce asyncHandler: un cuerpo que no pasa floorPlanValidate
// sale 400 con su mensaje.



const OPTIONS = { abortEarly: false, stripUnknown: true };

export const floorPlanController = {};


floorPlanController.getFloorPlan = async (req, res) => {
    // Solo el croquis de un local que puede ver quien llama (user.access)
    if (!(await canSeeLocalId(req.access, req.params.id))) return forbidden(res);
    const plan = await FloorPlanModel.findOne({ establishment: req.params.id }).lean();
    return res.status(200).json({ data: plan ?? null });
};


// GET /local/floor-plans   TODOS los croquis, uno por local que tiene: { data: [croquis…] }
// Para el visor de mesas del lobby de Client365, que deja elegir entre todos los locales: una petición en vez de
// una por cada uno de los ~120. Los locales sin croquis no salen; quien llama los cruza con su lista de locales.
floorPlanController.getFloorPlans = async (req, res) => {
    // Solo los de los locales que puede ver quien llama (user.access); null es «todos»
    const allowed = await allowedLocalIds(req.access);
    const filter = allowed === null ? {} : { establishment: { $in: [...allowed] } };
    const plans = await FloorPlanModel.find(filter).select('-__v -updatedBy').lean();
    return res.status(200).json({ data: plans });
};


floorPlanController.putFloorPlan = async (req, res) => {
    if (!req.session?.userId) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Para guardar el croquis hay que iniciar sesión' });
    }

    const plan = await floorPlanValidate.validate(req.body, OPTIONS);

    const exists = await LocalModel.exists({ _id: req.params.id });
    if (!exists) {
        return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe ese establecimiento' });
    }

    const saved = await FloorPlanModel.findOneAndUpdate(
        { establishment: req.params.id },
        {
            $set: { board: plan.board, zonas: plan.zonas, piezas: plan.piezas, version: FLOOR_PLAN_VERSION, updatedBy: req.session.userId },
            $setOnInsert: { establishment: req.params.id },
        },
        { new: true, upsert: true, runValidators: true },
    ).lean();

    return res.status(200).json({ data: saved });
};
