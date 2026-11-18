import VerificationSessionModel from './verificationSession.model.js';
import ShiftVerificationModel from '../shiftVerification/shiftVerification.model.js';
import { dayToDate } from '../rotation/rotation.schema.js';
import { passProblem, historyEntry } from '../shiftVerification/shiftVerification.lib.js';
import { acquireValidate, sessionIdValidate, sessionQueryValidate } from './verificationSession.schema.js';
import { acquireOutcome, takeProblem, releaseProblem, isMine, isIdle, personName, present, PEOPLE } from './verificationSession.lib.js';
import { emitSession } from './verificationSession.socket.js';



// Los métodos no atrapan errores: las rutas los envuelven en asyncHandler, que
// traduce lo que falle (yup → 400, índice único → 409, Mongo caído → 503).

const controller = {};

// OPTIONS = «cómo se valida»: todos los errores juntos, y fuera lo que no esté en el esquema
const OPTIONS = { abortEarly: false, stripUnknown: true };


// unauthorized = «la respuesta sin sesión»
const unauthorized = (res) => res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Para verificar hay que iniciar sesión' });

// notFound = «la respuesta de lo que no está»
const notFound = (res, message) => res.status(404).json({ status: 404, error: 'Not found', message });

// conflict = «no se puede ahora», con un `code` para que el panel sepa qué pintar y, si viene al caso, la sesión
const conflict = (res, code, message, extra = {}) => res.status(409).json({ status: 409, error: 'Conflict', code, message, ...extra });

// activeOf = «la sesión activa de esa verificación» (la 1 o la 2), poblada
const activeOf = (verification, pass) => VerificationSessionModel.findOne({ verification, pass, status: 'active' }).populate(PEOPLE).lean();

// populated = «una sesión, poblada»
const populated = (sessionId) => VerificationSessionModel.findById(sessionId).populate(PEOPLE).lean();

// remember = «apuntarlo en el historial de la verificación», sin tocar lo demás
const remember = (verificationId, line) => ShiftVerificationModel.updateOne({ _id: verificationId }, { $push: { history: historyEntry(line) } });



// POST /verification-session — body: { verification, pass }
// Abrir el panel de una verificación la TOMA. Responde:
//   201 { outcome: 'claim',  session }   estaba libre: ahora es tuya
//   200 { outcome: 'resume', session }   ya era tuya (cerraste el navegador, o vienes de otro equipo): la sigues
//   409 { code: 'busy', idle, session }  la tiene otra persona; con idle, ya se puede tomar (POST …/take)
//   409 { code: 'elsewhere', session }   tienes otra a medias: una a la vez (la sesión es esa otra)
//   409 { code: 'closed' }               esa verificación está cerrada, o es la 2 y la 1 sigue abierta
controller.acquire = async (req, res) => {

    const userId = req.session?.userId;
    if (!userId) return unauthorized(res);

    const { verification: verificationId, pass } = await acquireValidate.validate(req.body, OPTIONS);
    const verification = await ShiftVerificationModel.findById(verificationId).select('establishment operationalDate shift firstClosedAt secondClosedAt').lean();
    if (!verification) return notFound(res, 'No existe esa verificación');

    const problem = passProblem(verification, pass);
    if (problem) return conflict(res, 'closed', problem);

    //  Dos que la toman en el mismo segundo chocan en el índice único: el segundo vuelve a mirar quién la tiene
    for (let attempt = 0; attempt < 2; attempt++) {
        const now = new Date();
        const [held, own] = await Promise.all([
            activeOf(verification._id, pass),
            VerificationSessionModel.findOne({ user: userId, status: 'active' }).populate(PEOPLE).lean(),
        ]);
        const { outcome, idle } = acquireOutcome({ held, own, userId, now });

        if (outcome === 'busy') return conflict(res, 'busy', `Esta verificación la está haciendo ${personName(held.user)}`, { idle, session: present(held, userId, now) });
        if (outcome === 'elsewhere') return conflict(res, 'elsewhere', 'Tienes otra verificación a medias: termínala o suéltala antes de empezar esta', { session: present(own, userId, now) });

        if (outcome === 'resume') {
            //  Recargar la página no es reanudar: solo se apunta si llevaba un rato sin señales
            if (isIdle(held, now)) await remember(verification._id, { action: 'resume', userId, pass, now });
            await VerificationSessionModel.updateOne({ _id: held._id }, { lastSeenAt: now });
            emitSession('resume', held._id);
            return res.status(200).json({ outcome: 'resume', session: present(await populated(held._id), userId, now) });
        }

        try {
            const session = await VerificationSessionModel.create({
                verification: verification._id,
                pass,
                establishment: verification.establishment,
                operationalDate: verification.operationalDate,
                shift: verification.shift,
                user: userId,
                startedAt: now,
                lastSeenAt: now,
            });
            await remember(verification._id, { action: 'claim', userId, pass, now });
            emitSession('claim', session._id);
            return res.status(201).json({ outcome: 'claim', session: present(await populated(session._id), userId, now) });
        }
        catch (error) {
            if (error?.code !== 11000 || attempt > 0) throw error;
        }
    }
    return conflict(res, 'busy', 'Otra persona la acaba de tomar: vuelve a intentarlo');
};



// POST /verification-session/id=<_id>/take — quitarle la verificación a quien la tiene
// Se puede si lleva IDLE_MS sin señales; un administrador, siempre. La sesión vieja queda 'taken' (con quién se la
// quitó) y empieza una nueva de quien la toma. Queda en el historial. 201 { outcome: 'take', session }.
controller.take = async (req, res) => {

    const userId = req.session?.userId;
    if (!userId) return unauthorized(res);

    const sessionId = await sessionIdValidate.validate(req.params.id);
    const held = await populated(sessionId);
    if (!held) return notFound(res, 'No existe esa sesión');

    const now = new Date();
    const problem = takeProblem(held, { userId, isAdmin: req.session.admin === true, now });
    if (problem) return conflict(res, held.status === 'active' ? 'busy' : 'gone', problem, { session: present(held, userId, now) });

    const own = await VerificationSessionModel.findOne({ user: userId, status: 'active' }).populate(PEOPLE).lean();
    if (own) return conflict(res, 'elsewhere', 'Tienes otra verificación a medias: termínala o suéltala antes de tomar esta', { session: present(own, userId, now) });

    //  Solo si sigue activa: si alguien la tomó o se cerró entre medias, no se pisa
    const ended = await VerificationSessionModel.findOneAndUpdate(
        { _id: held._id, status: 'active' },
        { status: 'taken', endedAt: now, endedBy: userId },
        { new: true },
    );
    if (!ended) return conflict(res, 'gone', 'Esa verificación cambió de manos mientras tanto: ábrela otra vez');

    const session = await VerificationSessionModel.create({
        verification: held.verification,
        pass: held.pass,
        establishment: held.establishment?._id ?? held.establishment,
        operationalDate: held.operationalDate,
        shift: held.shift,
        user: userId,
        startedAt: now,
        lastSeenAt: now,
    });
    await remember(held.verification, { action: 'take', userId, pass: held.pass, note: `Se la quitó a ${personName(held.user)}`, now });
    emitSession('take', session._id);

    return res.status(201).json({ outcome: 'take', session: present(await populated(session._id), userId, now) });
};



// PUT /verification-session/id=<_id>/heartbeat — «sigo aquí»
// Lo manda el panel cada poco mientras está a la vista. 200 { session } si la sigue teniendo; 409 { code: 'lost',
// session } si ya no (se la quitaron, la soltó desde otro equipo o se cerró): la sesión dice cómo y quién.
controller.heartbeat = async (req, res) => {

    const userId = req.session?.userId;
    if (!userId) return unauthorized(res);

    const sessionId = await sessionIdValidate.validate(req.params.id);
    const now = new Date();
    const session = await VerificationSessionModel.findOneAndUpdate(
        { _id: sessionId, user: userId, status: 'active' },
        { lastSeenAt: now },
        { new: true, projection: '_id status lastSeenAt' },
    ).lean();
    if (session) return res.status(200).json({ session });

    const lost = await populated(sessionId);
    if (!lost) return notFound(res, 'No existe esa sesión');
    return conflict(res, 'lost', 'Ya no tienes esta verificación', { session: present(lost, userId, now) });
};



// DELETE /verification-session/id=<_id> — soltarla («Dejar para luego» la suelta; cerrar el navegador, no)
// La suelta quien la tiene, o un administrador. Lo marcado se queda. Queda en el historial. 200 { session }.
controller.release = async (req, res) => {

    const userId = req.session?.userId;
    if (!userId) return unauthorized(res);

    const sessionId = await sessionIdValidate.validate(req.params.id);
    const held = await populated(sessionId);
    if (!held) return notFound(res, 'No existe esa sesión');

    const problem = releaseProblem(held, { userId, isAdmin: req.session.admin === true });
    if (problem) return conflict(res, held.status === 'active' ? 'busy' : 'gone', problem);

    const now = new Date();
    const ended = await VerificationSessionModel.findOneAndUpdate(
        { _id: held._id, status: 'active' },
        { status: 'released', endedAt: now, endedBy: userId },
        { new: true },
    );
    if (!ended) return conflict(res, 'gone', 'Esa verificación ya no está tomada');

    await remember(held.verification, {
        action: 'release',
        userId,
        pass: held.pass,
        note: isMine(held, userId) ? '' : `Era de ${personName(held.user)}`,
        now,
    });
    emitSession('release', held._id);

    return res.status(200).json({ session: present(await populated(held._id), userId, now) });
};



// GET /verification-session/mine — la verificación que tengo a medias, o null
// Es lo que mira Client365 al entrar para llevar a reanudar: la cookie solo es un atajo, esto manda.
controller.mine = async (req, res) => {

    const userId = req.session?.userId;
    if (!userId) return unauthorized(res);

    const session = await VerificationSessionModel.findOne({ user: userId, status: 'active' }).populate(PEOPLE).lean();
    return res.status(200).json({ session: present(session, userId) });
};



// GET /verification-session?day=AAAA-MM-DD — quién está verificando qué ese día
// Las sesiones activas, cada una con `mine` (es tuya) e `idle` (ya se puede tomar). La lista de /verifications pinta
// con esto el candado de cada celda.
controller.list = async (req, res) => {

    const userId = req.session?.userId;
    if (!userId) return unauthorized(res);

    const { day } = await sessionQueryValidate.validate(req.query, OPTIONS);
    const now = new Date();
    const sessions = await VerificationSessionModel.find({ operationalDate: dayToDate(day), status: 'active' }).populate(PEOPLE).lean();
    return res.status(200).json({ day, sessions: sessions.map(session => present(session, userId, now)) });
};



export default controller;
