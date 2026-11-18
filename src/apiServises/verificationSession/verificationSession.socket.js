import { io } from '../../services/socket/io.js';
import VerificationSessionModel from './verificationSession.model.js';
import { PEOPLE, SESSION_EVENT, SESSION_ACTIONS } from './verificationSession.lib.js';



// ══════════════════════════════════════════════════════════════════════
// QUIÉN TIENE CADA VERIFICACIÓN, EN VIVO
// ══════════════════════════════════════════════════════════════════════
// Cada vez que alguien toma, reanuda, suelta o pierde una verificación, o se
// cierra, se avisa a todos con SESSION_EVENT: la lista de /verifications pinta
// el candado en su celda y el panel de quien solo mira sabe si quedó libre. La
// sesión viaja poblada (quién, el local). El socket no tiene usuario: el aviso
// no da permisos, solo dice qué pasó; lo que bloquea es la API (guardDecision).
//
// Y cuando alguien escribe en una verificación, verificationSyncEvent avisa a
// quien la está mirando, para que vea las marcas al momento.



// verificationSyncEvent = «el aviso de que cambió una verificación»: 'verification-sync:<_id>'
export const verificationSyncEvent = (verificationId) => `verification-sync:${verificationId}`;


// emitSession = «avisar que cambió una sesión». Nunca lanza: un aviso que falla no deshace lo hecho.
export async function emitSession(action, sessionId) {
    try {
        if (!SESSION_ACTIONS.includes(action)) throw new Error(`acción desconocida «${action}»`);
        const session = await VerificationSessionModel.findById(sessionId).populate(PEOPLE).lean();
        if (session) io.emit(SESSION_EVENT, { action, session });
    }
    catch (error) {
        console.log(`[verificationSession] No se pudo avisar en vivo (${action}):`, error?.message ?? error);
    }
}


// emitVerificationSync = «avisar que cambió una verificación» a quien la esté mirando. Nunca lanza.
export function emitVerificationSync(verificationId, pass) {
    try {
        io.emit(verificationSyncEvent(verificationId), { verification: String(verificationId), pass, at: new Date() });
    }
    catch (error) {
        console.log('[verificationSession] No se pudo avisar del cambio:', error?.message ?? error);
    }
}
