import KioskAccessModel from './biometricAccess.model.js';
import { BiometricError } from './biometric.lib.js';
import { isUsableSecret, MIN_SECRET_LENGTH } from './biometricTerminal.lib.js';
import {
    CHALLENGE_SECONDS, newKioskToken, hashKioskToken, isKioskTokenShape, canLogIn, loginRejection,
    newChallenge, challengeExpired, challengeAccepts,
} from './biometricAccess.lib.js';

// ══════════════════════════════════════════════════════════════════════
// ENTRAR CON HUELLA — las llaves de las tablets y los pedidos de acceso
// ══════════════════════════════════════════════════════════════════════
// Las reglas (y por qué existen) están en biometricAccess.lib.js.
//
// Los pedidos de acceso viven EN MEMORIA: duran segundos, y quien los resuelve
// es la escucha de este mismo proceso (biometricListener.js), que le ofrece
// cada huella con offerFingerprint().
//
// BIOMETRIC_FINGERPRINT_LOGIN=false en el .env lo apaga para todos, sin borrar
// las tablets autorizadas.



// Entre dos pedidos de la misma tablet.
const MIN_START_INTERVAL_MS = 3_000;

const challenges = new Map();     // id del pedido → pedido
const waitingOn = new Map();      // terminal → id del pedido que espera allí
const lastStartAt = new Map();    // id de la llave → ms del último pedido

export const fingerprintLoginEnabled = () => process.env.BIOMETRIC_FINGERPRINT_LOGIN !== 'false';

function requireEnabled() {
    if (!fingerprintLoginEnabled()) throw new BiometricError('not_configured', 'Entrar con huella está apagado en el servidor (BIOMETRIC_FINGERPRINT_LOGIN=false).');
}

function requireSecret() {
    const secret = process.env.BIOMETRIC_SECRET;
    if (!isUsableSecret(secret)) {
        throw new BiometricError('not_configured', `Falta BIOMETRIC_SECRET en el .env de la API (${MIN_SECRET_LENGTH} caracteres o más): sin ella no se puede entrar con huella.`);
    }
    return secret;
}



// ─── Las tablets autorizadas ─────────────────────────────────────────────

// createKioskAccess = «autorizar ESTA tablet a entrar con huella» en su terminal.
// Devuelve la llave UNA vez: la tablet la guarda y aquí queda solo su firma.
export async function createKioskAccess({ terminal, label, adminId, adminName }) {
    requireEnabled();
    const secret = requireSecret();
    const token = newKioskToken();
    const doc = await KioskAccessModel.create({
        terminal,
        tokenHash: hashKioskToken(token, secret),
        label: String(label ?? '').trim().slice(0, 80),
        createdBy: adminId ?? null,
        createdByName: adminName ?? '',
    });
    return { id: String(doc._id), terminal, token };
}

// removeKioskAccess = «quitarle la huella a esta tablet». Basta con tener la llave.
export async function removeKioskAccess(token) {
    if (!isKioskTokenShape(token)) return { removed: false };
    const result = await KioskAccessModel.deleteOne({ tokenHash: hashKioskToken(token, requireSecret()) });
    return { removed: result.deletedCount > 0 };
}

async function kioskAccessFor(token, terminal) {
    if (!isKioskTokenShape(token)) return null;
    const doc = await KioskAccessModel.findOne({ tokenHash: hashKioskToken(token, requireSecret()) }).lean();
    return doc && doc.terminal === terminal ? doc : null;
}



// ─── Los pedidos de acceso ───────────────────────────────────────────────

function forget(challenge) {
    challenges.delete(challenge.id);
    if (waitingOn.get(challenge.terminal) === challenge.id) waitingOn.delete(challenge.terminal);
}

function sweep(now) {
    for (const challenge of challenges.values()) {
        if (now.getTime() > challenge.expiresAt + 60_000) forget(challenge);
    }
}

// startChallenge = «esperar una huella de administrador en el terminal» (ya
// validada la tablet). Uno por terminal: si la misma tablet pide otro, vale el nuevo.
export function startChallenge({ terminal, tokenId, afterSerial, now = new Date() }) {
    sweep(now);
    const currentId = waitingOn.get(terminal);
    const current = currentId ? challenges.get(currentId) : null;
    if (current && current.status === 'waiting' && !challengeExpired(current, now)) {
        if (current.tokenId !== tokenId) throw new BiometricError('conflict', 'Ya hay un acceso con huella esperando en este terminal. Espera unos segundos.');
        forget(current);
    }
    const challenge = newChallenge({ terminal, tokenId, afterSerial, now });
    challenges.set(challenge.id, challenge);
    waitingOn.set(terminal, challenge.id);
    return { challengeId: challenge.id, expiresInSeconds: CHALLENGE_SECONDS };
}

// startFingerprintLogin = «pedir un acceso con huella desde una tablet autorizada».
// `listener` es el estado de la escucha de ese terminal: sin ella nadie vería la huella.
export async function startFingerprintLogin({ token, terminal, listener, now = new Date() }) {
    requireEnabled();
    const access = await kioskAccessFor(token, terminal);
    if (!access) {
        throw new BiometricError('login_required', 'Esta tablet no tiene permiso para entrar con huella (o se lo quitaron). Entra con tu correo y contraseña y actívalo de nuevo.');
    }
    if (listener?.state !== 'connected') {
        throw new BiometricError('not_configured', 'La API no está leyendo el terminal en este momento: entra con tu correo y contraseña.');
    }
    const tokenId = String(access._id);
    if (now.getTime() - (lastStartAt.get(tokenId) ?? 0) < MIN_START_INTERVAL_MS) {
        throw new BiometricError('too_many', 'Espera unos segundos antes de volver a intentarlo.');
    }
    lastStartAt.set(tokenId, now.getTime());

    const started = startChallenge({ terminal, tokenId, afterSerial: listener.lastSerial, now });
    KioskAccessModel.updateOne({ _id: access._id }, { $set: { lastUsedAt: now }, $inc: { usageCount: 1 } }).catch(() => {});
    return started;
}

// offerFingerprint = «¿esperaba esta huella algún acceso?». La escucha la llama con
// cada huella de un terminal. Devuelve true si la huella ABRIÓ un acceso: entonces
// no se toma como marcaje de asistencia.
export function offerFingerprint({ terminal, decision, event, user, eventAtMs, now = new Date() }) {
    const id = waitingOn.get(terminal);
    const challenge = id ? challenges.get(id) : null;
    if (!challenge || !challengeAccepts(challenge, { serialNo: event.serialNo, eventAtMs }, now)) return false;

    if (decision === 'mark' || decision === 'repeated') {
        if (canLogIn(user)) {
            challenge.status = 'approved';
            challenge.user = { _id: user._id, name: user.name ?? '', surName: user.surName ?? '' };
            return true;
        }
        challenge.status = 'rejected';
        challenge.message = loginRejection(user, decision);
        return false;
    }
    if (decision === 'rejected') {
        challenge.status = 'rejected';
        challenge.message = loginRejection(null, 'rejected');
    }
    return false;
}

// challengeOutcome = «cómo va un pedido»: waiting | approved | rejected | expired.
// Un pedido resuelto se entrega una sola vez y se olvida.
export function challengeOutcome(challengeId, now = new Date()) {
    const challenge = typeof challengeId === 'string' ? challenges.get(challengeId) : null;
    if (!challenge) return { status: 'expired', message: 'Ese pedido de acceso ya no existe: vuelve a intentarlo.' };
    if (challenge.status === 'approved') {
        forget(challenge);
        return { status: 'approved', user: challenge.user, terminal: challenge.terminal };
    }
    if (challenge.status === 'rejected') {
        forget(challenge);
        return { status: 'rejected', message: challenge.message };
    }
    if (challengeExpired(challenge, now)) {
        forget(challenge);
        return { status: 'expired', message: 'Se acabó el tiempo y nadie puso el dedo. Vuelve a intentarlo.' };
    }
    return { status: 'waiting', secondsLeft: Math.max(1, Math.ceil((challenge.expiresAt - now.getTime()) / 1000)) };
}

// cancelChallenge = «ya no se espera» (la tablet salió de la pantalla de acceso)
export function cancelChallenge(challengeId) {
    const challenge = typeof challengeId === 'string' ? challenges.get(challengeId) : null;
    if (challenge && challenge.status === 'waiting') forget(challenge);
    return { cancelled: Boolean(challenge) };
}
