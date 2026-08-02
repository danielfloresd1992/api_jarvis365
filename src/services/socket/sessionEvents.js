import { io } from './io.js';

// ══════════════════════════════════════════════════════════════════════
// EVENTOS DE SESIÓN POR SOCKET
// ══════════════════════════════════════════════════════════════════════
// Nombre del evento que ordena a los frontends (Client365, Jarvis-express365
// y reportes365) cerrar la sesión del usuario indicado. Cada front compara
// el userId del payload con el de SU sesión y, si coincide, ejecuta su
// propio cierre de sesión.
export const CLOSE_SESSION_EVENT = 'close-session-user';

/**
 * Emite el cierre de sesión de un usuario a todos los clientes conectados.
 * Se llama al marcar la SALIDA de la jornada laboral (diurna o nocturna)
 * en el endpoint de marcado de asistencia.
 *
 * @param {import('mongoose').Types.ObjectId|string} userId - _id del usuario.
 */
export const emitCloseSessionForUser = (userId) => {
    if (!userId) return;
    io.emit(CLOSE_SESSION_EVENT, { userId: String(userId) });
};
