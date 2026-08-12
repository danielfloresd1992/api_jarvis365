// ══════════════════════════════════════════════════════════════════════
// ¿QUIÉN VE ESTA NOTIFICACIÓN?
// ══════════════════════════════════════════════════════════════════════
// La respuesta a esa pregunta se da DOS veces, por dos caminos distintos, y las
// dos tienen que decir lo mismo:
//
//   1. AL EMITIR       → a qué sala de socket se manda (llega en el momento)
//   2. AL CONSULTAR    → qué filtro se aplica al leer la bandeja (el historial)
//
// Si solo se cuidara el primero, una notificación personal no llegaría en vivo
// a quien no le toca... pero aparecería al abrir la campana. Si solo se cuidara
// el segundo, viajaría por el socket a todo el mundo y el front tendría que
// esconderla — y esconder no es lo mismo que no enviar.
//
// Por eso los dos viven acá, uno al lado del otro.
//
// LOS TRES ALCANCES
//
//   global   → todos. Anuncios y comentarios del horario.
//   personal → solo los de `recipients`. Marcaje propio, cambios de tu jornada.
//   admin    → solo administradores. Solicitudes pendientes de aprobar.

/** Sala de socket de un usuario. El cliente entra al conectarse (`join-user`). */
export const userRoom = (userId) => `user:${String(userId)}`;

/** Sala de administradores, para el alcance 'admin'. */
export const ADMIN_ROOM = 'admins';

/**
 * Qué notificaciones le corresponden a un usuario.
 *   · todas las globales
 *   · las personales donde figura como destinatario
 *   · las de administradores, solo si lo es
 *
 * El filtro se arma en el SERVIDOR, no en el cliente: una notificación personal
 * que viaja al front equivocado ya está filtrada, aunque no se pinte.
 */
export const audienceQuery = (session) => {
    const or = [{ scope: 'global' }];
    if (session?.userId) or.push({ scope: 'personal', recipients: session.userId });
    if (session?.admin === true) or.push({ scope: 'admin' });
    return { $or: or };
};
