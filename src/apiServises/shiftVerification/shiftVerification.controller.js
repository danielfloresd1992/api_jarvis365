import { randomUUID } from 'node:crypto';
import ShiftVerificationModel from './shiftVerification.model.js';
import RotationModel from '../rotation/rotation.model.js';
import LocalModel from '../local/local.model.js';
import VerificationSessionModel from '../verificationSession/verificationSession.model.js';
import { dayToDate } from '../rotation/rotation.schema.js';
import { addTouchTo } from '../rotation/rotation.lib.js';
import { emitRotation } from '../rotation/rotation.socket.js';
import { guardDecision, PEOPLE as SESSION_PEOPLE } from '../verificationSession/verificationSession.lib.js';
import { emitSession, emitVerificationSync } from '../verificationSession/verificationSession.socket.js';
import {
    summaryQueryValidate, openValidate, verificationIdValidate, rotationIdValidate,
    checkValidate, recoveredRotationValidate, recoveredTouchValidate, closeValidate,
    commentValidate, commentEditValidate, commentIdValidate,
} from './shiftVerification.schema.js';
import {
    isVerifiable, majorityCreator, syncEntries, operatorRotations, findEntry, passKey, checkOf,
    passProblem, closeProblem, totalsOf, withSummary, summarizeDay, operationalInstant, dayKeyOf, PEOPLE,
    historyEntry, limitsOf, delaysOf, commentProblem, commentOf, commentOwnerProblem,
} from './shiftVerification.lib.js';



// Los métodos no atrapan errores: las rutas los envuelven en asyncHandler, que
// traduce lo que falle (yup → 400, índice único → 409, Mongo caído → 503).

const controller = {};

// OPTIONS = «cómo se valida»: todos los errores juntos, y fuera lo que no esté en el esquema
const OPTIONS = { abortEarly: false, stripUnknown: true };

// ROTATION_FIELDS = «lo que se lee de una rotación para saber si es del turno y quién la creó»
const ROTATION_FIELDS = '_id establishment createdBy date shift hourOccupies takeOut tableNumber touch._id';


// unauthorized = «la respuesta sin sesión»
const unauthorized = (res, what) => res.status(401).json({ status: 401, error: 'Unauthorized', message: `Para ${what} hay que iniciar sesión` });

// notFound / conflict = «las respuestas de lo que no está y de lo que no se puede ahora»
const notFound = (res, message) => res.status(404).json({ status: 404, error: 'Not found', message });
const conflict = (res, message) => res.status(409).json({ status: 409, error: 'Conflict', message });

// respond = «la verificación entera, como la devuelve la API»: poblada (PEOPLE) y con su resumen (withSummary)
const respond = async (res, status, verification) => {
    await verification.populate(PEOPLE);
    return res.status(status).json(withSummary(verification.toObject()));
};

// shiftRotations = «las rotaciones de mesa GUARDADAS de un local, un día operativo y un turno» (isVerifiable)
const shiftRotations = async (establishment, operationalDate, shift) => {
    const rotations = await RotationModel.find({ establishment, operationalDate, status: { $ne: 'open' } }).select(ROTATION_FIELDS).lean();
    return rotations.filter(rotation => isVerifiable(rotation, shift));
};

// loadVerification = «la verificación de la ruta», o null
const loadVerification = async (req) => ShiftVerificationModel.findById(await verificationIdValidate.validate(req.params.id));


// lockedOut = «responder 423 si quien escribe no tiene esa verificación» (la 1 o la 2): la tiene que haber tomado al
// abrir el panel (POST /verification-session). Con quién la tiene, para decirlo. null si puede escribir.
const lockedOut = async (res, verification, pass, userId) => {
    const held = await VerificationSessionModel.findOne({ verification: verification._id, pass, status: 'active' }).populate(SESSION_PEOPLE).lean();
    const decision = guardDecision(held, userId);
    if (!decision) return null;
    return res.status(423).json({ status: 423, error: 'Locked', code: decision.code, message: decision.message, session: held ?? null });
};

// tableNote = «la mesa de una rotación, para el historial»: 'Mesa 12 a las 13:05:00'
const tableNote = (rotation) => (rotation ? `Mesa ${rotation.tableNumber}${rotation.hourOccupies ? ` a las ${rotation.hourOccupies}` : ''}` : '');



// SUMMARY_VERIFIERS = «quién cerró cada verificación», con su nombre y su foto: la lista de /verifications los enseña
// bajo «Verificada» (pedido del usuario)
const SUMMARY_VERIFIERS = [
    { path: 'firstVerifier', select: 'name surName img' },
    { path: 'secondVerifier', select: 'name surName img' },
];

// GET /shift-verification?day=AAAA-MM-DD[&establishment=<id>]
// Cómo va la verificación de cada local ese día, turno por turno: cuántas rotaciones de mesa tiene cada turno y
// cómo van sus dos verificaciones (null si nadie la abrió), con quién cerró cada una (`verifiedBy`: nombre,
// apellido y foto). Es lo que pinta la lista de /verifications.
controller.getSummary = async (req, res) => {

    const { day, establishment } = await summaryQueryValidate.validate(req.query, OPTIONS);
    const operationalDate = dayToDate(day);
    const byLocal = establishment ? { establishment } : {};

    const [rotations, verifications] = await Promise.all([
        RotationModel.find({ ...byLocal, operationalDate, status: { $ne: 'open' } }).select('establishment shift hourOccupies date takeOut tableNumber').lean(),
        ShiftVerificationModel.find({ ...byLocal, operationalDate }).select('-history -delays -comments').populate(SUMMARY_VERIFIERS).lean(),
    ]);

    return res.status(200).json({ day, establishments: summarizeDay(rotations, verifications) });
};



// GET /shift-verification/id=:id — la verificación entera, sin cambiarla: la pide quien la está mirando mientras
// otra persona la trabaja, cada vez que llega su aviso en vivo ('verification-sync:<_id>')
controller.getVerification = async (req, res) => {

    const verification = await loadVerification(req);
    if (!verification) return notFound(res, 'No existe esa verificación');
    return respond(res, 200, verification);
};



// POST /shift-verification — abre la verificación de un local, un día y un turno
// La crea la primera vez y, las siguientes, la pone al día: entran las rotaciones que se guardaron después (y sus
// toques), y lo ya marcado se queda. Una con las dos verificaciones cerradas ya no cambia. El operador es quien
// creó la mayoría de las rotaciones que anotó. Responde con la verificación entera. Abrirla NO la toma: eso es
// POST /verification-session.
controller.openVerification = async (req, res) => {

    if (!req.session?.userId) return unauthorized(res, 'verificar');

    const { establishment, day, shift } = await openValidate.validate(req.body, OPTIONS);

    const local = await LocalModel.findById(establishment).select('_id').lean();
    if (!local) return notFound(res, 'No existe ese establecimiento');

    const operationalDate = dayToDate(day);

    //  Dos que la abren a la vez chocan en el índice único: el segundo vuelve a leer la que creó el primero
    for (let attempt = 0; attempt < 2; attempt++) {
        const verification = await ShiftVerificationModel.findOne({ establishment, operationalDate, shift })
            ?? new ShiftVerificationModel({ establishment, operationalDate, shift });

        if (!verification.secondClosedAt) {
            const rotations = await shiftRotations(establishment, operationalDate, shift);
            const { entries } = syncEntries(verification.rotations.map(entry => entry.toObject()), rotations);
            verification.rotations = entries;
            verification.operator = majorityCreator(operatorRotations(entries, rotations)) ?? verification.operator;
        }

        // created = «es la primera vez que se abre»: después de guardar, isNew ya no lo dice
        const created = verification.isNew;
        try {
            await verification.save();
            return await respond(res, created ? 201 : 200, verification);
        }
        catch (error) {
            if (error?.code !== 11000 || attempt > 0) throw error;
        }
    }
    return conflict(res, 'No se pudo abrir la verificación: inténtalo otra vez');
};



// PUT /shift-verification/id=:id/check — marca una rotación, o uno de sus toques, en una de las dos verificaciones
// Body: { pass, rotation, touch?, status: 'confirmed' | 'notFound' | null, note? }. null quita la marca. 409 si esa
// verificación está cerrada, o si es la 2 y la 1 sigue abierta; 423 si la tiene otra persona. Queda en el historial.
controller.check = async (req, res) => {

    if (!req.session?.userId) return unauthorized(res, 'verificar');

    const body = await checkValidate.validate(req.body, OPTIONS);
    const verification = await loadVerification(req);
    if (!verification) return notFound(res, 'No existe esa verificación');

    const problem = passProblem(verification, body.pass);
    if (problem) return conflict(res, problem);
    if (await lockedOut(res, verification, body.pass, req.session.userId)) return undefined;

    const found = findEntry(verification.rotations, body.rotation, body.touch);
    if (!found) return notFound(res, body.touch ? 'Ese toque no está en esta verificación' : 'Esa rotación no está en esta verificación');

    const target = found.touchEntry ?? found.entry;
    const key = passKey(body.pass);
    const before = target[key]?.status ?? null;
    target[key] = checkOf(body, req.session.userId);

    const rotation = await RotationModel.findById(body.rotation).select('tableNumber hourOccupies touch').lean();
    const touch = body.touch ? rotation?.touch?.find(item => String(item._id) === String(body.touch)) : null;
    verification.history.push(historyEntry({
        action: 'mark',
        userId: req.session.userId,
        pass: body.pass,
        rotation: body.rotation,
        touch: body.touch,
        from: before,
        to: body.status,
        note: touch ? `Toque de ${touch.name || 'gerente'} a las ${touch.hourTouch || 'sin hora'}, ${tableNote(rotation).toLowerCase()}` : tableNote(rotation),
    }));

    await verification.save();
    emitVerificationSync(verification._id, body.pass);
    return respond(res, 200, verification);
};



// POST /shift-verification/id=:id/rotation — una rotación que el operador no anotó y aparece en el video
// Se crea como rotación de verdad, guardada, recuperada (recovered: true), con el verificador de autor, en el día y
// el turno de la verificación, y SIN marca de abandonada: no se dejó en Mesas, se encontró después. Entra con
// origin 'verification', ya marcada como en el video por la verificación que la recupera. Avisa en vivo a
// Registros, como cualquier rotación guardada. Queda en el historial. Responde 201 con la verificación entera.
controller.recoverRotation = async (req, res) => {

    if (!req.session?.userId) return unauthorized(res, 'recuperar una rotación');

    const body = await recoveredRotationValidate.validate(req.body, OPTIONS);
    const verification = await loadVerification(req);
    if (!verification) return notFound(res, 'No existe esa verificación');

    const problem = passProblem(verification, body.pass);
    if (problem) return conflict(res, problem);
    if (await lockedOut(res, verification, body.pass, req.session.userId)) return undefined;

    const date = operationalInstant(dayKeyOf(verification.operationalDate), body.hourOccupies);
    const now = new Date();

    const rotation = await RotationModel.create({
        establishment: verification.establishment,
        createdBy: req.session.userId,
        clientId: `verificacion-${randomUUID()}`,
        date,
        operationalDate: verification.operationalDate,
        shift: verification.shift,
        recovered: true,
        status: 'closed',
        closedAt: now,
        tableNumber: body.tableNumber,
        hourOccupies: body.hourOccupies,
        hourFirstAttention: body.hourFirstAttention,
        breakUp: body.breakUp,
        tableCleaning: body.tableCleaning,
    });

    verification.rotations.push({
        rotation: rotation._id,
        origin: 'verification',
        [passKey(body.pass)]: checkOf({ status: 'confirmed', note: 'Recuperada del video' }, req.session.userId, now),
        touches: [],
    });
    verification.history.push(historyEntry({ action: 'recoverRotation', userId: req.session.userId, pass: body.pass, rotation: rotation._id, note: tableNote(rotation), now }));
    await verification.save();
    emitRotation('post', rotation);
    emitVerificationSync(verification._id, body.pass);

    return respond(res, 201, verification);
};



// POST /shift-verification/id=:id/rotation=:rotationId/touch — un toque que el operador no anotó
// Se apunta en la rotación (addTouchTo, de rotation.lib.js: queda en su lista de cambios), recuperado, y entra en la
// verificación con origin 'verification', ya marcado como en el video. 409 si esa verificación dice que la rotación
// no existe. Queda en el historial. Responde 201 con la verificación entera.
controller.recoverTouch = async (req, res) => {

    if (!req.session?.userId) return unauthorized(res, 'recuperar un toque');

    const body = await recoveredTouchValidate.validate(req.body, OPTIONS);
    const rotationId = await rotationIdValidate.validate(req.params.rotationId);
    const verification = await loadVerification(req);
    if (!verification) return notFound(res, 'No existe esa verificación');

    const problem = passProblem(verification, body.pass);
    if (problem) return conflict(res, problem);
    if (await lockedOut(res, verification, body.pass, req.session.userId)) return undefined;

    const found = findEntry(verification.rotations, rotationId);
    if (!found) return notFound(res, 'Esa rotación no está en esta verificación');
    if (found.entry[passKey(body.pass)]?.status === 'notFound') return conflict(res, 'Esa rotación está marcada como que no está en el video: no lleva toques');

    const rotation = await RotationModel.findById(rotationId);
    if (!rotation) return notFound(res, 'No existe esa rotación');

    const now = new Date();
    const { pass, ...touch } = body;
    const added = await addTouchTo(rotation, { ...touch, recovered: true, createdAt: now }, req.session.userId);
    await rotation.save();

    found.entry.touches.push({
        touch: added._id,
        origin: 'verification',
        [passKey(pass)]: checkOf({ status: 'confirmed', note: 'Recuperado del video' }, req.session.userId, now),
    });
    verification.history.push(historyEntry({
        action: 'recoverTouch',
        userId: req.session.userId,
        pass,
        rotation: rotation._id,
        touch: added._id,
        note: `Toque de ${added.name} a las ${added.hourTouch}, ${tableNote(rotation).toLowerCase()}`,
        now,
    }));
    await verification.save();
    emitRotation('put', rotation);
    emitVerificationSync(verification._id, pass);

    return respond(res, 201, verification);
};



// PUT /shift-verification/id=:id/close — cierra una de las dos verificaciones
// Body: { pass }. Hace falta que esté todo marcado en ella (closeProblem) y tenerla tomada. Quien la cierra queda
// como su verificador; el resultado y las DEMORAS del turno (contra los tiempos de referencia del local de ese
// momento) se congelan; su sesión termina. 409 si falta algo o ya estaba cerrada; 423 si la tiene otra persona.
controller.closeVerification = async (req, res) => {

    if (!req.session?.userId) return unauthorized(res, 'cerrar una verificación');

    const { pass } = await closeValidate.validate(req.body, OPTIONS);
    const verification = await loadVerification(req);
    if (!verification) return notFound(res, 'No existe esa verificación');

    const problem = closeProblem(verification, pass);
    if (problem) return conflict(res, problem);
    if (await lockedOut(res, verification, pass, req.session.userId)) return undefined;

    const [local, rotations] = await Promise.all([
        LocalModel.findById(verification.establishment).select('timeServices').populate('timeServices').lean(),
        RotationModel.find({ _id: { $in: verification.rotations.map(entry => entry.rotation) } })
            .select('hourOccupies hourFirstAttention breakUp tableCleaning firstAttentionDelay cleaningDelay').lean(),
    ]);

    const now = new Date();
    const key = passKey(pass);
    verification[`${key}Verifier`] = req.session.userId;
    verification[`${key}ClosedAt`] = now;
    verification.totals = totalsOf(verification.rotations);
    verification.delays = delaysOf(verification.rotations, rotations, limitsOf(local?.timeServices));
    verification.history.push(historyEntry({ action: 'close', userId: req.session.userId, pass, now }));
    await verification.save();

    //  Cerrada, ya nadie la tiene: su sesión termina
    const session = await VerificationSessionModel.findOneAndUpdate(
        { verification: verification._id, pass, status: 'active' },
        { status: 'closed', endedAt: now, endedBy: req.session.userId },
        { new: true },
    );
    if (session) emitSession('close', session._id);
    emitVerificationSync(verification._id, pass);

    return respond(res, 200, verification);
};



// ── LOS COMENTARIOS DE CADA VERIFICACIÓN (pedido del usuario) ─────────
// Se escriben con $push / $set / $pull sobre `comments`, sin guardar el documento entero: un comentario no pisa una
// marca que esté guardando a la vez quien verifica. Comentar no pide tener la verificación tomada (no es verificar)
// y se puede con ella cerrada. Responden con la verificación entera, como las demás.

// commentFilter = «el comentario de la ruta, si es de quien escribe»: el $elemMatch que deja usar comments.$
const commentFilter = (verificationId, commentId, userId) => ({
    _id: verificationId,
    comments: { $elemMatch: { _id: commentId, user: userId } },
});

// loadComment = «la verificación y el comentario de la ruta», o responder lo que falte (404 / 403). null si ya respondió.
const loadComment = async (req, res) => {
    const commentId = await commentIdValidate.validate(req.params.commentId);
    const verification = await loadVerification(req);
    if (!verification) { notFound(res, 'No existe esa verificación'); return null; }
    const comment = commentOf(verification, commentId);
    if (!comment) { notFound(res, 'Ese comentario no existe (o ya se borró)'); return null; }
    const problem = commentOwnerProblem(comment, req.session.userId);
    if (problem) { res.status(403).json({ status: 403, error: 'Forbidden', message: problem }); return null; }
    return { verification, commentId };
};


// POST /shift-verification/id=:id/comment — deja un comentario en la verificación 1 o en la 2
// Body: { pass, rotation?, text }. Con `rotation`, apunta a esa rotación (tiene que ser de la verificación: si no,
// 404). Responde 201 con la verificación entera.
controller.addComment = async (req, res) => {

    if (!req.session?.userId) return unauthorized(res, 'comentar');

    const body = await commentValidate.validate(req.body, OPTIONS);
    const verification = await loadVerification(req);
    if (!verification) return notFound(res, 'No existe esa verificación');

    const problem = commentProblem(verification, body);
    if (problem) return notFound(res, problem);

    const updated = await ShiftVerificationModel.findByIdAndUpdate(
        verification._id,
        { $push: { comments: { pass: body.pass, rotation: body.rotation, text: body.text, user: req.session.userId, at: new Date() } } },
        { new: true },
    );
    emitVerificationSync(verification._id, body.pass);

    return respond(res, 201, updated);
};


// PUT /shift-verification/id=:id/comment=:commentId — cambia el texto de un comentario
// Body: { text }. Solo su autor (403 si no). Queda la hora del cambio (`editedAt`). Responde con la verificación entera.
controller.editComment = async (req, res) => {

    if (!req.session?.userId) return unauthorized(res, 'editar un comentario');

    const { text } = await commentEditValidate.validate(req.body, OPTIONS);
    const found = await loadComment(req, res);
    if (!found) return undefined;

    const updated = await ShiftVerificationModel.findOneAndUpdate(
        commentFilter(found.verification._id, found.commentId, req.session.userId),
        { $set: { 'comments.$.text': text, 'comments.$.editedAt': new Date() } },
        { new: true },
    );
    if (!updated) return notFound(res, 'Ese comentario no existe (o ya se borró)');
    emitVerificationSync(updated._id, null);

    return respond(res, 200, updated);
};


// DELETE /shift-verification/id=:id/comment=:commentId — borra un comentario
// Solo su autor (403 si no). Responde con la verificación entera.
controller.deleteComment = async (req, res) => {

    if (!req.session?.userId) return unauthorized(res, 'borrar un comentario');

    const found = await loadComment(req, res);
    if (!found) return undefined;

    const updated = await ShiftVerificationModel.findOneAndUpdate(
        { _id: found.verification._id },
        { $pull: { comments: { _id: found.commentId, user: req.session.userId } } },
        { new: true },
    );
    if (!updated) return notFound(res, 'No existe esa verificación');
    emitVerificationSync(updated._id, null);

    return respond(res, 200, updated);
};



export default controller;
