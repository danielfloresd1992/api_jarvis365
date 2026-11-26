import express from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import nameApi from '../../libs/name_api.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import validateSecurityPass from '../../libs/validation/passwordValidation.js';
import { sendMail } from '../../services/mail/mail.service.js';
import UserModel from '../user/user.model.js';
import PasswordResetModel from './passwordReset.model.js';
import { forgotSchema, resetCheckSchema, resetSchema } from './passwordReset.schema.js';
import {
    RESEND_COOLDOWN_SECONDS,
    RESET_MINUTES,
    createResetToken,
    hashResetToken,
    isResetTokenShape,
    maskEmail,
    passwordChangedMail,
    resetBaseFor,
    resetLink,
    resetMail,
    sessionIdsOf,
} from './passwordReset.lib.js';

// ══════════════════════════════════════════════════════════════════════
// RESTABLECER LA CONTRASEÑA POR CORREO
// ══════════════════════════════════════════════════════════════════════
// Las tres rutas del flujo, sin sesión (quien olvidó la contraseña no puede
// entrar). Las reglas, el token y los textos de los correos están en
// `passwordReset.lib.ts`; el envío, en `services/mail/mail.service.js`.
//
//   POST /auth/password/forgot        { email, app? }     → 202 siempre
//   POST /auth/password/reset/check   { token }           → 200 { name, email } | 410
//   POST /auth/password/reset         { token, password } → 200 | 400 | 410
//
// El token va en el CUERPO, nunca en la URL: morgan escribe la URL de cada
// petición en el log, y un token en el log es un enlace válido en el log.
//
// Cada ruta lleva su propio límite por IP. El global de app.ts deja pasar
// 30 000 peticiones cada 15 minutos, y eso no frena a nadie.

const routerPasswordReset = express.Router();


/** Cómo validar un cuerpo: todos los errores juntos y sin claves de más. */
const VALIDATION_OPTIONS = { abortEarly: false, stripUnknown: true };

// FORGOT_ANSWER = «lo que contesta siempre el pedido de enlace, exista la cuenta o no»
const FORGOT_ANSWER = 'Si el correo tiene una cuenta, le llegará un enlace para crear una contraseña nueva.';

// GONE = «la respuesta a un enlace que ya no vale. No dice por qué: caducado, usado e inventado se contestan igual»
const GONE = {
    status: 410,
    error: 'Gone',
    message: 'El enlace ya no vale: caducó, ya se usó o no es de este sistema. Pide uno nuevo.',
};

// tooMany = «el 429 de cada límite, con la misma forma que el resto de errores de la API»
const tooMany = (message: string) => ({ status: 429, error: 'Too many requests', message });

// forgotLimiter = «pedir enlaces: 5 cada 15 minutos por IP»
const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: tooMany('Demasiados pedidos de enlace desde esta conexión. Prueba de nuevo en 15 minutos.'),
});

// resetLimiter = «comprobar y usar enlaces: 20 cada 15 minutos por IP. Un token no se adivina, pero se frena igual»
const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: tooMany('Demasiados intentos desde esta conexión. Prueba de nuevo en 15 minutos.'),
});


/**
 * La cuenta de un correo.
 *
 * Primero la coincidencia exacta, que usa el índice único. Si no hay, se busca
 * sin distinguir mayúsculas, porque hay cuentas guardadas como «Juan@…» y la
 * persona escribe «juan@…». Si así salen dos cuentas, no se elige ninguna: no
 * se sabe de cuál es dueña la persona.
 */
async function findUserByEmail(email: string) {
    const fields = 'name surName email inabilited';
    const exact = await UserModel.findOne({ email }).select(fields);
    if (exact) return exact;

    const loose = await UserModel.find({ email }).collation({ locale: 'en', strength: 2 }).limit(2).select(fields);
    return loose.length === 1 ? loose[0] : null;
}


/**
 * Prepara y envía el enlace. Corre DESPUÉS de contestar al portal: así la
 * respuesta tarda lo mismo exista la cuenta o no, y su tiempo no la delata.
 * Por lo mismo, lo que falle aquí solo va al log.
 */
async function issueReset({ email, base, ip, agent }: { email: string; base: string; ip: string; agent: string }) {
    const user = await findUserByEmail(email);
    if (!user || user.inabilited) return;

    // Si acaba de recibir uno, no se manda otro: el anterior sigue valiendo.
    const since = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000);
    const recent = await PasswordResetModel.exists({ user: user._id, usedAt: null, createdAt: { $gt: since } });
    if (recent) {
        console.log(`[restablecer] ${user._id} ya recibió un enlace hace menos de ${RESEND_COOLDOWN_SECONDS} s; no se envía otro.`);
        return;
    }

    // Pedir uno nuevo anula los anteriores: solo vale el último correo.
    await PasswordResetModel.deleteMany({ user: user._id, usedAt: null });

    const { token, tokenHash } = createResetToken();
    await PasswordResetModel.create({
        user: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000),
        requestedIp: ip,
        requestedAgent: agent.slice(0, 300),
    });

    await sendMail({
        to: user.email,
        ...resetMail({ name: user.name, email: user.email, link: resetLink(base, token), minutes: RESET_MINUTES }),
    });
}


/** El enlace vivo de este token y su cuenta, o null si no vale. No lo gasta. */
async function findLiveReset(token: string) {
    if (!isResetTokenShape(token)) return null;
    const reset = await PasswordResetModel.findOne({ tokenHash: hashResetToken(token), usedAt: null, expiresAt: { $gt: new Date() } });
    if (!reset) return null;
    const user = await UserModel.findById(reset.user).select('name email inabilited');
    if (!user || user.inabilited) return null;
    return { reset, user };
}


/**
 * Cierra todas las sesiones abiertas de una cuenta: las del navegador que
 * olvidó la contraseña y, sobre todo, las de quien la conociera.
 *
 * Recorre el almacén de sesiones (connect-redis, o el MemoryStore si Redis no
 * respondió al arrancar). Si falla, se dice en el log y se sigue: la contraseña
 * ya cambió, y eso no se deshace por no poder cerrar una sesión.
 */
function closeSessionsOf(store: any, userId: unknown): Promise<number> {
    return new Promise(resolve => {
        if (!store || typeof store.all !== 'function') return resolve(0);
        store.all((error: unknown, sessions: unknown) => {
            if (error) {
                console.log(`[restablecer] no se pudieron leer las sesiones: ${(error as Error)?.message ?? error}`);
                return resolve(0);
            }
            const ids = sessionIdsOf(sessions, String(userId));
            Promise.all(ids.map(id => new Promise<void>(done => store.destroy(id, () => done()))))
                .then(() => resolve(ids.length));
        });
    });
}


// ══════════════════════════════════════════════════════════════════════
// PEDIR EL ENLACE
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /auth/password/forgot — manda el enlace si el correo tiene cuenta.
 *
 * Contesta 202 con el mismo texto en todos los casos, también para una cuenta
 * deshabilitada o un correo que no existe. Solo contesta otra cosa si el cuerpo
 * está mal (400), si se pasó del límite (429) o si el portal no tiene dirección
 * configurada (503).
 */
routerPasswordReset.post(`${nameApi}/auth/password/forgot`, forgotLimiter, asyncHandler(async (req: any, res: any) => {
    const { email, app } = await forgotSchema.validate(req.body, VALIDATION_OPTIONS);

    const base = resetBaseFor(app as any, process.env, process.env.NODE_ENV === 'development');
    if (!base) {
        console.log(`[restablecer] el portal «${app}» no tiene dirección configurada (ver RESET_APPS en passwordReset.lib.ts).`);
        return res.status(503).json({ status: 503, error: 'Service unavailable', message: 'El restablecimiento por correo no está configurado todavía.' });
    }

    res.status(202).json({ status: 202, message: FORGOT_ANSWER, minutes: RESET_MINUTES });

    issueReset({ email, base, ip: req.ip ?? '', agent: req.get('user-agent') ?? '' })
        .catch(error => console.log(`[restablecer] no se pudo enviar el enlace: ${error?.message ?? error}`));
}));


// ══════════════════════════════════════════════════════════════════════
// COMPROBAR EL ENLACE
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /auth/password/reset/check — si el enlace sigue valiendo.
 *
 * El portal lo pregunta al abrir el enlace, antes de pedir la contraseña, para
 * no hacerla escribir en balde. No gasta el token. Devuelve el nombre y el
 * correo tapado, para que la persona vea de qué cuenta es.
 */
routerPasswordReset.post(`${nameApi}/auth/password/reset/check`, resetLimiter, asyncHandler(async (req: any, res: any) => {
    const { token } = await resetCheckSchema.validate(req.body, VALIDATION_OPTIONS);
    const live = await findLiveReset(token);
    if (!live) return res.status(410).json(GONE);

    return res.status(200).json({
        status: 200,
        name: live.user.name ?? '',
        email: maskEmail(live.user.email),
        expiresAt: live.reset.expiresAt,
    });
}));


// ══════════════════════════════════════════════════════════════════════
// CAMBIAR LA CONTRASEÑA
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /auth/password/reset — pone la contraseña nueva y gasta el enlace.
 *
 * La contraseña se valida ANTES de gastar el token: una contraseña floja se
 * contesta con 400 y el enlace sigue sirviendo para el segundo intento.
 * Después, en este orden: se gasta el token, se guarda la contraseña con
 * bcrypt, se anulan los demás enlaces de la cuenta, se cierran sus sesiones y
 * se avisa por correo.
 */
routerPasswordReset.post(`${nameApi}/auth/password/reset`, resetLimiter, asyncHandler(async (req: any, res: any) => {
    const { token, password } = await resetSchema.validate(req.body, VALIDATION_OPTIONS);

    const rules = validateSecurityPass(password);
    if (!rules.pass) return res.status(400).json({ status: 400, error: 'Bad request', message: rules.msm, field: 'password' });

    if (!isResetTokenShape(token)) return res.status(410).json(GONE);

    // Buscar y gastar en UNA operación: si llegan dos envíos a la vez, solo uno
    // encuentra el token sin usar.
    const now = new Date();
    const reset = await PasswordResetModel.findOneAndUpdate(
        { tokenHash: hashResetToken(token), usedAt: null, expiresAt: { $gt: now } },
        { $set: { usedAt: now, usedIp: req.ip ?? '' } },
        { new: true },
    );
    if (!reset) return res.status(410).json(GONE);

    const user = await UserModel.findById(reset.user).select('name email inabilited');
    if (!user || user.inabilited) return res.status(410).json(GONE);

    await UserModel.updateOne(
        { _id: user._id },
        { $set: { password: await bcrypt.hash(password, 10), passwordChangedAt: now } },
    );
    await PasswordResetModel.deleteMany({ user: user._id, usedAt: null });
    const closed = await closeSessionsOf(req.sessionStore, user._id);
    console.log(`[restablecer] ${user._id} cambió su contraseña; ${closed} sesión(es) cerrada(s).`);

    res.status(200).json({ status: 200, message: 'La contraseña se cambió. Ya puedes entrar con la nueva.' });

    sendMail({ to: user.email, ...passwordChangedMail({ name: user.name, when: now }) })
        .catch(error => console.log(`[restablecer] no se pudo avisar del cambio: ${error?.message ?? error}`));
}));


export { routerPasswordReset };
export default routerPasswordReset;
