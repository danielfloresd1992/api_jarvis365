import RotationModel from './rotation.model.js';
import LocalModel from '../local/local.model.js';
import { rotationValidate, rotationQueryValidate, rotationTargetValidate, dayToDate } from './rotation.schema.js';
import { applyEdit, addTouchTo, removeTouchFrom, PEOPLE } from './rotation.lib.js';
import { emitRotation } from './rotation.socket.js';
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

    //  En vivo, a los que tienen abiertos los registros de ese local. Sin await: no retrasa la respuesta.
    emitRotation('post', rotation);

    return res.status(201).json(rotation);
};



// GET /rotation?establishment=<id>|name=<nombre>&from=AAAA-MM-DD&to=AAAA-MM-DD — las rotaciones de unos días
// Ordenadas por la hora en que empezaron, con el nombre de quien las guardó y de
// quien hizo cada corrección (PEOPLE).
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
        .populate(PEOPLE)
        .lean();

    return res.status(200).json({ establishment: local._id, name: local.name, from, to, total: documents.length, documents });
};



// PUT /rotation/id=:id — corrige una rotación guardada
// El id es el de lo que se corrige: la rotación, uno de sus procesos o uno de sus
// toques (cada uno tiene su _id). Lo de en medio lo hace applyEdit
// (rotation.lib.js): aplica el body y anota en `changes` cada propiedad que de
// verdad cambie, con quién, cuándo, y el valor de antes y el nuevo. Responde con
// la rotación entera, con los mismos nombres que el GET (PEOPLE).
controller.editRotation = async (req, res) => {

    if (!req.session?.userId) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Para corregir una rotación hay que iniciar sesión' });
    }

    const id = await rotationTargetValidate.validate(req.params.id);

    const rotation = await RotationModel.findOne({ $or: [{ _id: id }, { 'process._id': id }, { 'touch._id': id }] });
    if (!rotation) {
        return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe una rotación, un proceso o un toque con ese id' });
    }

    const changes = await applyEdit(rotation, id, req.body, req.session.userId);

    //  Solo se guarda, y solo se avisa en vivo, si algo cambió de verdad
    if (changes.length > 0) {
        await rotation.save();
        emitRotation('put', rotation);
    }

    await rotation.populate(PEOPLE);
    return res.status(200).json(rotation);
};



// POST /rotation/id=:id/touch — apunta un toque nuevo en una rotación guardada
// El id es el de la rotación. Body: { ref, name, hourTouch, createdAt? }, como un toque al guardarla.
// Lo de en medio lo hace addTouchTo (rotation.lib.js), que lo anota en `changes`. Responde 201 con la
// rotación entera, como el GET, y avisa en vivo como una corrección ('put').
controller.addTouch = async (req, res) => {

    if (!req.session?.userId) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Para apuntar un toque hay que iniciar sesión' });
    }

    const id = await rotationTargetValidate.validate(req.params.id);

    const rotation = await RotationModel.findById(id);
    if (!rotation) {
        return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe esa rotación' });
    }

    await addTouchTo(rotation, req.body, req.session.userId);
    await rotation.save();
    emitRotation('put', rotation);

    await rotation.populate(PEOPLE);
    return res.status(201).json(rotation);
};



// DELETE /rotation/touch/id=:id — quita un toque de una rotación guardada
// El id es el del TOQUE, no el de la rotación: con el de la rotación no se borra nada. Lo de en medio lo
// hace removeTouchFrom (rotation.lib.js), que lo anota en `changes`. Responde con la rotación entera, como
// el GET, y avisa en vivo como una corrección ('put').
controller.removeTouch = async (req, res) => {

    if (!req.session?.userId) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Para quitar un toque hay que iniciar sesión' });
    }

    const id = await rotationTargetValidate.validate(req.params.id);

    const rotation = await RotationModel.findOne({ 'touch._id': id });
    if (!rotation) {
        return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe un toque con ese id' });
    }

    removeTouchFrom(rotation, id, req.session.userId);
    await rotation.save();
    emitRotation('put', rotation);

    await rotation.populate(PEOPLE);
    return res.status(200).json(rotation);
};



export default controller;
