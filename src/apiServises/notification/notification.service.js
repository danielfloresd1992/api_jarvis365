import NotificationModel from './notification.model.js';
import UserModel from '../user/user.model.js';
import { resolveStrategy } from './notification.strategy.js';
import { io } from '../../services/socket/io.js';

// ══════════════════════════════════════════════════════════════════════
// SERVICIO DE NOTIFICACIONES
// ══════════════════════════════════════════════════════════════════════
// Un solo punto de entrada, notify(), que:
//   1. pide a la estrategia del tipo el texto y la audiencia
//   2. persiste la notificación
//   3. la emite por socket a quien corresponda
//
// El servicio NO sabe qué dice cada notificación ni a quién le toca: eso vive
// en las estrategias. Acá solo está la mecánica.

export const NOTIFICATION_EVENT = 'notification:new';

/** Sala de socket de un usuario. El cliente se une al conectarse. */
export const userRoom = (userId) => `user:${String(userId)}`;

/** Sala de administradores, para el scope 'admin'. */
export const ADMIN_ROOM = 'admins';


/**
 * Crea, guarda y emite una notificación.
 *
 * Nunca lanza: una notificación es un efecto secundario de una operación que YA
 * se completó. Si falla el aviso, no puede tumbar el guardado que lo originó
 * — el establecimiento ya se creó. Se registra el error y se sigue.
 *
 * @param {object} params
 * @param {string} params.type      tipo registrado en notification.strategy.js
 * @param {object} params.actor     { user, name, surName, img } quién lo hizo
 * @param {object} [params.resource] { kind, id, name, path } sobre qué
 * @param {Array}  [params.changes]  [{ field, label, from, to }]
 * @param {object} [params.extra]    contexto libre para la estrategia
 * @param {object} [params.request]  { status, payload } para solicitudes
 * @returns {Promise<object|null>} la notificación guardada, o null si falló
 */
export async function notify({ type, actor, target, resource, changes = [], extra = {}, request } = {}) {
    try {
        // La sesión de Express solo garantiza el NOMBRE. Como la notificación
        // debe decir nombre y apellido, se completa desde la base cuando falta.
        // Es una lectura pequeña y deja el texto correcto para siempre: se
        // guarda renderizado, así que no hay una segunda oportunidad.
        const resolvedActor = await resolveActor(actor);
        const ctx = { actor: resolvedActor, target, resource, changes, extra };
        const strategy = resolveStrategy(type);
        actor = resolvedActor;

        // Audiencia: la estrategia manda; sin audiencia explícita, global.
        const scope = strategy.scope || 'global';
        const recipients = scope === 'personal'
            ? (strategy.audience?.(ctx) || []).filter(Boolean)
            : [];

        // Una notificación personal sin destinatarios no le llega a nadie:
        // guardarla sería dejar basura invisible en la colección.
        if (scope === 'personal' && recipients.length === 0) {
            console.log(`[notification] ${type}: personal sin destinatarios, se omite.`);
            return null;
        }

        const doc = await NotificationModel.create({
            type,
            scope,
            recipients,
            actor: {
                user: actor?.user ?? actor?._id ?? null,
                name: actor?.name || '',
                surName: actor?.surName || '',
                img: actor?.img || null,
            },
            target: target
                ? {
                    user: target.user ?? target._id ?? null,
                    name: target.name || '',
                    surName: target.surName || '',
                    img: target.img || null,
                }
                : undefined,
            resource: {
                kind: resource?.kind || '',
                id: resource?.id || null,
                name: resource?.name || '',
                path: resource?.path || '',
            },
            action: strategy.action || 'updated',
            level: strategy.level || 'info',
            changes,
            i18n: {
                es: strategy.text(ctx, 'es'),
                en: strategy.text(ctx, 'en'),
            },
            request: request
                ? { status: request.status || 'pending', payload: request.payload ?? null }
                : { status: 'none' },
        });

        emitNotification(doc);
        return doc;
    }
    catch (error) {
        // A propósito no se relanza: ver el comentario de arriba.
        console.log('[notification] no se pudo registrar:', error?.message || error);
        return null;
    }
}


/**
 * Completa nombre, apellido e imagen del actor desde la base si no vinieron.
 * Si no hay id o el usuario ya no existe, se devuelve lo que haya: la
 * notificación se emite igual, con "El sistema" como autor.
 */
async function resolveActor(actor) {
    const id = actor?.user ?? actor?._id ?? null;
    if (!id) return actor || {};

    // `resolved: true` significa "esta firma ya está como debe quedar, no la
    // toques". Lo usa el usuario de Jarvis, que firma "Usuario de Jarvis" con
    // el apellido vacío: sin esta marca, el apellido vacío se tomaría por un
    // dato faltante y se completaría desde la base con "Vision".
    if (actor?.resolved === true) return actor;
    if (actor?.name && actor?.surName) return actor;

    try {
        const user = await UserModel.findById(id).select('name surName img').lean();
        if (!user) return actor;
        return {
            ...actor,
            user: id,
            name: actor?.name || user.name || '',
            surName: actor?.surName || user.surName || '',
            img: actor?.img || user.img || null,
        };
    }
    catch {
        return actor;
    }
}


/**
 * Envía la notificación por socket según su alcance.
 *
 * Las PERSONALES van a la sala del destinatario, no a todos con filtrado en el
 * cliente: emitir el contenido a todos y esconderlo en el front no lo hace
 * privado, solo lo hace invisible.
 */
function emitNotification(doc) {
    const payload = doc?.toObject ? doc.toObject() : doc;

    if (payload.scope === 'global') {
        io.emit(NOTIFICATION_EVENT, payload);
        return;
    }

    if (payload.scope === 'admin') {
        io.emitToRoom(ADMIN_ROOM, NOTIFICATION_EVENT, payload);
        return;
    }

    (payload.recipients || []).forEach(userId => {
        io.emitToRoom(userRoom(userId), NOTIFICATION_EVENT, payload);
    });
}


/**
 * Compara dos versiones de un documento y devuelve solo lo que cambió.
 *
 * Es la pieza que evita escribir el diff a mano en cada controlador: se le pasa
 * el antes, el después y qué campos vigilar con su etiqueta legible.
 *
 * @param {object} before  documento antes del cambio
 * @param {object} after   valores nuevos
 * @param {object} fields  { clave: 'Etiqueta legible' }
 * @returns {Array} [{ field, label, from, to }]
 */
export function diffChanges(before = {}, after = {}, fields = {}) {
    const cambios = [];

    for (const [field, label] of Object.entries(fields)) {
        // No se toca lo que no viene en el update: undefined significa
        // "no se envió", no "se borró".
        if (after[field] === undefined) continue;

        const from = before?.[field] ?? null;
        const to = after[field] ?? null;

        // Comparación por valor: cubre fechas y objetos anidados sin
        // reportar cambios falsos por diferencia de referencia.
        if (JSON.stringify(from) === JSON.stringify(to)) continue;

        cambios.push({ field, label, from, to });
    }

    return cambios;
}


/**
 * Actor a partir de la sesión de Express.
 * Centralizado para que todos los controladores lo armen igual.
 */
export const actorFromSession = (req) => ({
    user: req?.session?.userId || null,
    name: req?.session?.name || '',
    surName: req?.session?.surName || '',
});
