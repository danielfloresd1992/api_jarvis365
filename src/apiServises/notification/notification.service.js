import NotificationModel from './notification.model.js';
import UserModel from '../user/user.model.js';
import { resolveStrategy } from './strategies/index.js';
import { io } from '../../services/socket/io.js';
import { userRoom, ADMIN_ROOM } from './notification.audience.js';
import { sendPushToUsers } from '../push/push.service.js';

// Las salas se re-exportan porque otros módulos las importan desde acá desde
// antes de que existiera notification.audience.js.
export { userRoom, ADMIN_ROOM };

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

// INSIGHTS_EVENT = «el evento de socket de la campana de insights365». Distinto del de la campana del equipo a
// propósito: un administrador con las dos apps abiertas no debe ver alertas de clientes en la del equipo.
export const INSIGHTS_EVENT = 'insights:notification';








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
 * @param {object} [params.resource] { kind, id, name, path, img } sobre qué
 * @param {Array}  [params.changes]  [{ field, label, from, to }]
 * @param {object} [params.extra]    contexto libre para la estrategia
 * @param {object} [params.request]  { status, payload } para solicitudes
 * @returns {Promise<object|null>} la notificación guardada, o null si falló
 */
export async function notify({ type, actor, target, resource, changes = [], extra = {}, meta = null, request } = {}) {
    try {
        // La sesión de Express solo garantiza el NOMBRE. Como la notificación
        // debe decir nombre y apellido, se completa desde la base cuando falta.
        // Es una lectura pequeña y deja el texto correcto para siempre: se
        // guarda renderizado, así que no hay una segunda oportunidad.
        const resolvedActor = await resolveActor(actor);
        const ctx = { actor: resolvedActor, target, resource, changes, extra, meta };
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
            // La familia sale de la estrategia, no del nombre del tipo: es ella
            // quien sabe a qué se parece lo que está describiendo.
            family: strategy.family || 'general',
            // Y la bandeja también: la campana del equipo o la de insights365
            channel: strategy.channel || 'staff',
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
                // `img` se quedaba fuera: los controladores lo mandaban, el
                // modelo lo declaraba, pero acá nunca se copiaba, así que
                // llegaba siempre en null y la campana caía al ícono genérico.
                // El logo del establecimiento no se veía por esto.
                img: resource?.img || null,
            },
            action: strategy.action || 'updated',
            level: strategy.level || 'info',
            changes,
            meta,
            i18n: {
                es: strategy.text(ctx, 'es'),
                en: strategy.text(ctx, 'en'),
            },
            request: request
                ? { status: request.status || 'pending', payload: request.payload ?? null }
                : { status: 'none' },
        });

        emitNotification(doc);
        // Con la app cerrada solo llega por Web Push: si la estrategia lo pide (push: 'insights365'), a los
        // navegadores de los destinatarios en esa app. No se espera: el aviso ya está guardado y emitido
        if (strategy.push && scope === 'personal') void pushNotification(doc, strategy.push);
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

    // Las de insights365 van por su propio evento, solo a la sala de cada destinatario
    if (payload.channel === 'insights') {
        (payload.recipients || []).forEach(userId => io.emitToRoom(userRoom(userId), INSIGHTS_EVENT, payload));
        return;
    }

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
 * Manda la notificación por Web Push a los navegadores de sus destinatarios en
 * esa app, cada uno en su idioma. Lo que lleva el aviso del sistema: título y
 * texto ya renderizados, `tag` (un aviso nuevo de la misma alerta reemplaza al
 * anterior en vez de apilarse), a dónde lleva al pulsarlo y el id de la
 * notificación (para marcarla leída desde la app). `meta` va entero: la app
 * pinta con él su bandeja sin volver a pedirlo.
 */
async function pushNotification(doc, app) {
    try {
        const payload = doc?.toObject ? doc.toObject() : doc;
        await sendPushToUsers((payload.recipients || []).map(String), app, (subscription) => {
            const text = payload.i18n?.[subscription.lang === 'en' ? 'en' : 'es'] || payload.i18n?.es || {};
            return {
                id: String(payload._id),
                title: text.title || '',
                body: text.body || '',
                tag: `${payload.type}:${payload.resource?.id ?? payload._id}`,
                url: payload.resource?.path || '/',
                createdAt: payload.createdAt,
                meta: payload.meta ?? null,
            };
        });
    }
    catch (error) {
        console.log('[notification] no se pudo mandar el push:', error?.message || error);
    }
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
 * Ids de los administradores, sin el que se indique.
 *
 * Lo usan las notificaciones que van "a los administradores menos el que acaba
 * de actuar": contarle a alguien lo que él mismo hizo es ruido. Se devuelven
 * cadenas para poder compararlas sin pelear con ObjectId.
 *
 * Si la consulta falla devuelve vacío: quedarse sin avisar a los
 * administradores es preferible a tumbar el aviso principal.
 *
 * @param {string} [exceptUserId]
 * @returns {Promise<string[]>}
 */
export async function adminUserIds(exceptUserId = null) {
    try {
        const excluido = String(exceptUserId ?? '');
        const admins = await UserModel.find({ admin: true }).select('_id').lean();
        return admins
            .map(a => String(a._id))
            .filter(id => id && id !== excluido);
    }
    catch (error) {
        console.log('[notification] no se pudo resolver administradores:', error?.message || error);
        return [];
    }
}


/**
 * Actor a partir de la sesión de Express.
 * Centralizado para que todos los controladores lo armen igual.
 *
 * OJO CON `req.session.name`: addCredential.js lo guarda como NOMBRE COMPLETO
 * ("Daniel Flores") y no existe `req.session.surName`. Usarlo como nombre de
 * pila dejaba al actor con apellido vacío, resolveActor lo completaba desde la
 * base y el texto terminaba diciendo "Daniel Flores Flores".
 *
 * La sesión sí guarda el documento entero en `dataUser`, que trae nombre,
 * apellido e imagen por separado: de ahí sale todo, y sin consultar la base.
 *
 * Sin `dataUser` —sesión vieja— se devuelve solo el id a propósito: es mejor
 * que resolveActor lo lea completo de la base a pasarle un nombre compuesto que
 * volvería a duplicar el apellido.
 *
 * LO QUE SE ACEPTA: `dataUser` es una foto del momento del login, así que si
 * alguien se cambia la imagen de perfil, sus notificaciones seguirán firmadas
 * con la anterior hasta que vuelva a entrar. Se asume porque acá las sesiones
 * duran poco —marcar la salida las cierra— y la alternativa era una consulta a
 * la base por cada notificación, incluidas las que se emiten en lote, una por
 * empleado.
 */
export const actorFromSession = (req) => {
    const userId = req?.session?.userId || null;
    const u = req?.session?.dataUser;

    if (u?.name) {
        return {
            user: userId,
            name: u.name,
            surName: u.surName || '',
            img: u.img || null,
        };
    }

    return { user: userId };
};
