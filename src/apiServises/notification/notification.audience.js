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

/** Las bandejas: 'staff' (la campana del equipo) e 'insights' (la de los clientes en insights365). */
export const CHANNELS = ['staff', 'insights'];

/** El canal pedido, siempre uno válido: lo que no es 'insights' es la campana del equipo. */
export const channelOf = (value) => (value === 'insights' ? 'insights' : 'staff');

/**
 * Qué notificaciones le corresponden a un usuario, en la bandeja de ese canal.
 *
 * Canal 'staff' (la campana del equipo, el de siempre):
 *   · todas las globales
 *   · las personales donde figura como destinatario
 *   · las de administradores, solo si lo es
 *   y nunca las del canal 'insights'.
 *
 * Canal 'insights' (la campana de insights365): solo las personales donde
 * figura como destinatario. Ahí no hay globales: cada alerta se reparte a
 * quien ve su local (strategies/alert.strategies.js).
 *
 * El filtro se arma en el SERVIDOR, no en el cliente: una notificación personal
 * que viaja al front equivocado ya está filtrada, aunque no se pinte.
 */
export const audienceQuery = (session, channel = 'staff') => {
    if (channelOf(channel) === 'insights') {
        return { channel: 'insights', scope: 'personal', recipients: session?.userId ?? null };
    }
    const or = [{ scope: 'global' }];
    if (session?.userId) or.push({ scope: 'personal', recipients: session.userId });
    if (session?.admin === true) or.push({ scope: 'admin' });
    // $ne también deja pasar las que no tienen el campo (todas las de antes)
    return { channel: { $ne: 'insights' }, $or: or };
};
