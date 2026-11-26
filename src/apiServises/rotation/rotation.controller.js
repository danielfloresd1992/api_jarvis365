import RotationModel from './rotation.model.js';
import LocalModel from '../local/local.model.js';
import { rotationValidate, rotationQueryValidate, rotationTargetValidate, syncValidate, rotationRemoveValidate, rotationSummaryValidate, dayToDate } from './rotation.schema.js';
import { applyEdit, addTouchTo, removeTouchFrom, abandonedOf, operationalDaysOf, syncOutcome, applySync, summaryOfRotations, PEOPLE } from './rotation.lib.js';
import { emitRotation, emitRotationSync } from './rotation.socket.js';
import { operationalDateOf } from '../dvrFailure/dvrFailure.lib.js';



// Los métodos no atrapan errores: las rutas los envuelven en asyncHandler, que
// traduce lo que falle (yup → 400, índice único → 409, Mongo caído → 503).

const controller = {};

// OPTIONS = «cómo se valida»: todos los errores juntos, y fuera lo que no esté en el esquema
const OPTIONS = { abortEarly: false, stripUnknown: true };


// syncContext = «lo que pone el servidor al guardar o subir una rotación de Mesas»: quién, su día operativo y, por si
// se cierra, la marca de abandonada (abandonedOf). Los días son los que vio el equipo con la hora de Windows (`day` y
// `today`, pedido del usuario); un Jarvis Express de antes no los manda, y salen de `date` y del reloj del servidor,
// en Caracas (operationalDaysOf).
const syncContext = (incoming, userId, now = new Date()) => {
    const { operationalDate, savedOperationalDate } = operationalDaysOf(incoming, {
        fromDate: operationalDateOf(incoming.date),
        fromNow: operationalDateOf(now),
    });
    return {
        userId,
        now,
        operationalDate,
        abandoned: abandonedOf({ operationalDate, savedOperationalDate, savedBy: userId, savedAt: now }),
    };
};



// POST /rotation — guarda una rotación
// El autor sale de la sesión, nunca del body. Una API key no tiene usuario
// detrás, así que no puede guardar (y la puerta de las llaves ya no deja escribir).
// Si Mesas ya la había subido abierta (PUT /rotation/client=), esto la CIERRA en vez de chocar con ella: es el
// disquete de un Jarvis-express365 que todavía no cierra por el PUT.
controller.setRotation = async (req, res) => {

    if (!req.session?.userId) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Para guardar una rotación hay que iniciar sesión' });
    }

    const rotationValidated = await rotationValidate.validate(req.body, OPTIONS);

    const open = await RotationModel.findOne({ establishment: rotationValidated.establishment, clientId: rotationValidated.clientId, status: 'open' });
    if (open) {
        applySync(open, { ...rotationValidated, status: 'closed', clientUpdatedAt: null }, syncContext(rotationValidated, req.session.userId));
        await open.save();
        emitRotationSync('upsert', { establishment: rotationValidated.establishment, clientId: rotationValidated.clientId, rotationId: open._id });
        emitRotation('post', open);
        return res.status(201).json(open);
    }

    //  Su día operativo es el que vio el equipo, y 'abandoned' dice si se guarda después de él (syncContext). Los
    //  días mismos no se guardan aparte: ya están en operationalDate y en la marca.
    const { day, today, ...fields } = rotationValidated;
    const { operationalDate, abandoned } = syncContext(rotationValidated, req.session.userId);

    const rotation = new RotationModel({
        ...fields,
        operationalDate,
        createdBy: req.session.userId,
        abandoned,
    });
    await rotation.save();

    //  En vivo, a los que tienen abiertos los registros de ese local. Sin await: no retrasa la respuesta.
    emitRotation('post', rotation);

    return res.status(201).json(rotation);
};



// GET /rotation?establishment=<id>|name=<nombre>&from=AAAA-MM-DD&to=AAAA-MM-DD&status=closed|open — las rotaciones de unos días
// Ordenadas por la hora en que empezaron, con el nombre de quien las guardó y de
// quien hizo cada corrección (PEOPLE). Sin `status`, las guardadas (Registros): las
// de antes de existir el campo también lo son. Con status=open, las que siguen en
// Mesas; ahí las fechas son opcionales: sin ellas vienen todas las abiertas.
controller.getRotations = async (req, res) => {

    const { establishment, name, status, from, to = from } = await rotationQueryValidate.validate(req.query, OPTIONS);

    // local = «el establecimiento pedido»: por su id o, si no viene, por su nombre (único en Local)
    const local = await LocalModel.findOne(establishment ? { _id: establishment } : { name }).select('_id name').lean();
    if (!local) {
        return res.status(404).json({ status: 404, error: 'Not found', message: name && !establishment ? `No existe un establecimiento llamado «${name}»` : 'No existe ese establecimiento' });
    }

    // filter = «qué rotaciones»: las del local, las abiertas o las que no lo están, y en los días pedidos si se pidieron
    const filter = { establishment: local._id, status: status === 'open' ? 'open' : { $ne: 'open' } };
    if (from) filter.operationalDate = { $gte: dayToDate(from), $lte: dayToDate(to) };

    const documents = await RotationModel.find(filter)
        .sort({ date: 1 })
        .populate(PEOPLE)
        .lean();

    return res.status(200).json({ establishment: local._id, name: local.name, status, from: from ?? null, to: from ? to : null, total: documents.length, documents });
};


// GET /rotation/summary?day=AAAA-MM-DD — lo de un día operativo de CADA local, ya contado (summaryOfRotations)
// Para el tablero del lobby de Client365: una sola petición en vez de dos por local. Sin `day`, el día operativo de
// ahora, y entonces cuentan también las abiertas (en vivo), de cualquier día, como en el visor de mesas; con un día
// pasado, solo sus guardadas. Solo vienen los locales que tuvieron alguna rotación, ordenados por nombre.
controller.getRotationSummary = async (req, res) => {

    const { day } = await rotationSummaryValidate.validate(req.query, OPTIONS);

    const today = operationalDateOf(new Date());
    const operationalDate = day ? dayToDate(day) : today;
    const isToday = operationalDate.getTime() === today.getTime();

    const saved = { status: { $ne: 'open' }, operationalDate };
    const filter = isToday ? { $or: [{ status: 'open' }, saved] } : saved;

    // Solo lo que se cuenta: ni horas ni personas
    const rotations = await RotationModel.find(filter)
        .select('establishment status takeOut tableNumber touch._id firstAttentionDelay cleaningDelay process.preparationDelay')
        .lean();

    const rows = summaryOfRotations(rotations);
    // El nombre del local y el de su franquicia (franchiseReference; `franchise` suelto es el campo viejo)
    const locals = await LocalModel.find({ _id: { $in: rows.map(row => row.establishment) } }).select('_id name franchise franchiseReference.name_franchise').lean();
    const byId = new Map(locals.map(local => [String(local._id), local]));

    const establishments = rows
        .map(row => {
            const local = byId.get(row.establishment);
            return { ...row, name: local?.name ?? '', franchise: local?.franchiseReference?.name_franchise || local?.franchise || '' };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return res.status(200).json({ day: operationalDate.toISOString().slice(0, 10), live: isToday, total: establishments.length, establishments });
};



// PUT /rotation/client=:clientId — Mesas sube una rotación mientras se trabaja, o la cierra
// El body es la rotación entera, como la del POST, con su local, su `status` ('open' sigue en Mesas; 'closed' la
// cierra: el disquete) y `clientUpdatedAt` (cuándo cambió en el equipo). Qué se hace lo decide syncOutcome
// (rotation.lib.js): crearla, reemplazarla, o no tocarla porque lo que llega es más viejo, es un reintento o ya
// está guardada. Responde { outcome, rotation }, la rotación como el GET: si no se tocó, la del servidor, para que
// Mesas adopte esa. 409 si ya está guardada y lo que llega la quiere abierta: es de Registros.
// Quien sube queda como el último que la cambió (updatedBy); quien la creó, como su autor (createdBy). Los dos salen
// de la sesión, nunca del body. Avisa en vivo a los demás equipos del local (emitRotationSync) y, si la cierra,
// también a Registros ('<local>-post', como el POST).
controller.syncRotation = async (req, res) => {

    if (!req.session?.userId) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Para subir una rotación hay que iniciar sesión' });
    }

    const incoming = await syncValidate.validate({ ...req.body, clientId: req.params.clientId }, OPTIONS);
    const { establishment, clientId } = incoming;

    let existing = await RotationModel.findOne({ establishment, clientId });
    let outcome = syncOutcome(existing, incoming);

    //  Dos subidas de una rotación NUEVA a la vez (dos equipos, o un reintento que se cruza con la primera): la
    //  segunda choca con el índice único (11000). Se relee la que ganó y se decide otra vez; sin esto saldría un
    //  409, que Mesas lee como «ya está guardada».
    if (outcome === 'create') {
        const created = new RotationModel({ establishment, clientId, createdBy: req.session.userId });
        applySync(created, incoming, syncContext(incoming, req.session.userId));
        try {
            await created.save();
            emitRotationSync('upsert', { establishment, clientId, rotationId: created._id });
            if (created.status === 'closed') emitRotation('post', created);
            await created.populate(PEOPLE);
            return res.status(201).json({ outcome, rotation: created });
        }
        catch (error) {
            if (error?.code !== 11000) throw error;
            existing = await RotationModel.findOne({ establishment, clientId });
            if (!existing) throw error;
            outcome = syncOutcome(existing, incoming);
        }
    }

    if (outcome === 'closed') {
        await existing.populate(PEOPLE);
        return res.status(409).json({ status: 409, error: 'Conflict', message: 'Esta rotación ya está guardada: ahora es de Registros', outcome, rotation: existing });
    }

    if (outcome === 'stale' || outcome === 'repeated') {
        await existing.populate(PEOPLE);
        return res.status(200).json({ outcome, rotation: existing });
    }

    const rotation = existing;
    applySync(rotation, incoming, syncContext(incoming, req.session.userId));
    await rotation.save();

    //  En vivo, sin esperar: a Mesas y a las verificaciones, y a Registros si se acaba de cerrar
    emitRotationSync('upsert', { establishment, clientId, rotationId: rotation._id });
    if (rotation.status === 'closed') emitRotation('post', rotation);

    await rotation.populate(PEOPLE);
    return res.status(200).json({ outcome, rotation });
};



// DELETE /rotation/client=:clientId?establishment=<id> — quita una rotación ABIERTA
// La que Mesas eliminó o dejó en blanco sin guardarla. Una que no existe responde 200 con removed: false (un
// reintento de un borrado que ya se hizo); una guardada no se quita: 409, se corrige desde Registros.
controller.removeOpenRotation = async (req, res) => {

    if (!req.session?.userId) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Para quitar una rotación hay que iniciar sesión' });
    }

    const { establishment } = await rotationRemoveValidate.validate(req.query, OPTIONS);
    const clientId = String(req.params.clientId);

    const existing = await RotationModel.findOne({ establishment, clientId });
    if (!existing) return res.status(200).json({ removed: false, clientId });

    if (existing.status !== 'open') {
        return res.status(409).json({ status: 409, error: 'Conflict', message: 'Esta rotación ya está guardada: se corrige desde Registros', clientId });
    }

    await existing.deleteOne();
    emitRotationSync('remove', { establishment, clientId });

    return res.status(200).json({ removed: true, clientId });
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
