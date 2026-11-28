import webpush from 'web-push';
import PushSubscriptionModel from './pushSubscription.model.js';

// ══════════════════════════════════════════════════════════════════════
// WEB PUSH — mandar un aviso a los navegadores de unas personas
// ══════════════════════════════════════════════════════════════════════
// Es el canal que llega CON LA APP CERRADA: el servidor se lo da al servicio de
// push del navegador y este lo entrega a su service worker, que lo enseña como
// aviso del sistema. El socket solo llega mientras la app está abierta.
//
// Las claves VAPID identifican a este servidor ante esos servicios. Van en el
// .env (se generan una vez con `npx web-push generate-vapid-keys`):
//
//   VAPID_PUBLIC_KEY    la pública, la que pide la app para suscribirse
//   VAPID_PRIVATE_KEY   la privada, nunca sale del servidor
//   VAPID_SUBJECT       un contacto del dueño del servidor (mailto: o https:)
//
// Sin claves no se manda nada y se avisa una vez en el log: el resto de la API
// sigue igual. Igual que notify(), nada de esto lanza: un aviso que no sale no
// puede tumbar la operación que lo originó.

// TTL_SECONDS = «cuánto guarda el servicio de push un aviso si el equipo está apagado»: una alerta de hace más de
// una hora ya no sirve como aviso (queda en la bandeja)
const TTL_SECONDS = 60 * 60;

let configured = null;

function configure() {
    if (configured !== null) return configured;
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.log('[push] sin VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el .env: no se mandan avisos push.');
        configured = false;
        return configured;
    }
    try {
        webpush.setVapidDetails(VAPID_SUBJECT || 'https://jarvis365.net', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
        configured = true;
    }
    catch (error) {
        console.log('[push] claves VAPID inválidas:', error?.message || error);
        configured = false;
    }
    return configured;
}

/** La clave pública VAPID (la que usa el navegador para suscribirse), o null si no hay. */
export const pushPublicKey = () => (configure() ? process.env.VAPID_PUBLIC_KEY : null);

/**
 * Manda un aviso a todas las suscripciones de esas personas en esa app.
 *
 * @param {string[]} userIds   destinatarios
 * @param {string}   app       'insights365'
 * @param {(subscription: object) => object} payloadFor  lo que se manda a cada suscripción (según su idioma)
 * @returns {Promise<{ sent: number, removed: number }>}
 */
export async function sendPushToUsers(userIds, app, payloadFor) {
    if (!configure() || !Array.isArray(userIds) || userIds.length === 0) return { sent: 0, removed: 0 };
    let sent = 0;
    let removed = 0;
    try {
        const subscriptions = await PushSubscriptionModel.find({ user: { $in: userIds }, app }).lean();
        await Promise.allSettled(subscriptions.map(async (subscription) => {
            try {
                await webpush.sendNotification(
                    { endpoint: subscription.endpoint, keys: subscription.keys },
                    JSON.stringify(payloadFor(subscription)),
                    { TTL: TTL_SECONDS, urgency: 'high' },
                );
                sent += 1;
                await PushSubscriptionModel.updateOne({ _id: subscription._id }, { $set: { lastSentAt: new Date() } });
            }
            catch (error) {
                // 404 / 410: esa dirección ya no existe (se desinstaló, se borraron los datos del sitio)
                if (error?.statusCode === 404 || error?.statusCode === 410) {
                    removed += 1;
                    await PushSubscriptionModel.deleteOne({ _id: subscription._id });
                    return;
                }
                console.log(`[push] no se pudo mandar a ${subscription._id}:`, error?.statusCode || '', error?.body || error?.message || error);
            }
        }));
    }
    catch (error) {
        console.log('[push] no se pudieron leer las suscripciones:', error?.message || error);
    }
    return { sent, removed };
}
