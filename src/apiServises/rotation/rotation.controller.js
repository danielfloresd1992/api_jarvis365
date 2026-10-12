import RotationModel from './rotation.model.js';
import LocalModel from '../local/local.model.js';
import { rotationValidate, rotationQueryValidate, dayToDate } from './rotation.schema.js';
import { operationalDateOf } from '../dvrFailure/dvrFailure.lib.js';



// Los métodos no atrapan errores: las rutas los envuelven en asyncHandler, que
// traduce lo que falle (yup → 400, índice único → 409, Mongo caído → 503).

const controller = {};

// OPTIONS = «cómo se valida»: todos los errores juntos, y fuera lo que no esté en el esquema
const OPTIONS = { abortEarly: false, stripUnknown: true };



// POST /rotation — guarda una rotación
// El autor sale de la sesión, nunca del body. Una API key no tiene usuario
// detrás, así que no puede guardar (y la puerta de las llaves ya no deja escribir).
controller.setRotation = async (req, res) => {

    if (!req.session?.userId) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Para guardar una rotación hay que iniciar sesión' });
    }

    const rotationValidated = await rotationValidate.validate(req.body, OPTIONS);

    const rotation = new RotationModel({
        ...rotationValidated,
        operationalDate: operationalDateOf(rotationValidated.date),
        createdBy: req.session.userId,
    });
    await rotation.save();

    return res.status(201).json(rotation);
};



// GET /rotation?establishment=<id>|name=<nombre>&from=AAAA-MM-DD&to=AAAA-MM-DD — las rotaciones de unos días
// Ordenadas por la hora en que empezaron, con el nombre de quien las guardó.
controller.getRotations = async (req, res) => {

    const { establishment, name, from, to = from } = await rotationQueryValidate.validate(req.query, OPTIONS);

    // local = «el establecimiento pedido»: por su id o, si no viene, por su nombre (único en Local)
    const local = await LocalModel.findOne(establishment ? { _id: establishment } : { name }).select('_id name').lean();
    if (!local) {
        return res.status(404).json({ status: 404, error: 'Not found', message: name && !establishment ? `No existe un establecimiento llamado «${name}»` : 'No existe ese establecimiento' });
    }

    const documents = await RotationModel.find({
        establishment: local._id,
        operationalDate: { $gte: dayToDate(from), $lte: dayToDate(to) },
    })
        .sort({ date: 1 })
        .populate('createdBy', 'name surName')
        .lean();

    return res.status(200).json({ establishment: local._id, name: local.name, from, to, total: documents.length, documents });
};



export default controller;
