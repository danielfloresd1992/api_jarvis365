import express from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';
import PushSubscriptionModel from './pushSubscription.model.js';
import { pushPublicKey } from './push.service.js';

// ══════════════════════════════════════════════════════════════════════
// SUSCRIBIRSE A LOS AVISOS PUSH
// ══════════════════════════════════════════════════════════════════════
//
//   GET    /push/key                  { key }: la clave pública VAPID (null si el servidor no tiene claves)
//   POST   /push/subscriptions        { app, lang, subscription: { endpoint, keys: { p256dh, auth } } }
//                                    guarda este navegador a nombre de quien tiene la sesión (si ya estaba, lo
//                                    pasa a su nombre y le actualiza el idioma)
//   POST   /push/subscriptions/remove { endpoint }: deja de mandarle avisos a este navegador (al apagar los avisos o
//                                    al cerrar sesión; solo borra la suscripción si es de quien llama)
//
// Qué se manda y a quién no se decide acá: lo decide la estrategia de cada aviso (notification/strategies).

const routerPush = express.Router();

const APPS = ['insights365'];
const isText = (value, max = 2048) => typeof value === 'string' && value.length > 0 && value.length <= max;

routerPush.get(`${nameApi}/push/key`, asyncHandler(async (req, res) => {
    return res.status(200).json({ key: pushPublicKey() });
}));

routerPush.post(`${nameApi}/push/subscriptions`, extendSession, validateSession, asyncHandler(async (req, res) => {
    const { app, lang, subscription } = req.body ?? {};
    const endpoint = subscription?.endpoint;
    const keys = subscription?.keys;
    if (!APPS.includes(app) || !isText(endpoint) || !/^https:\/\//.test(endpoint) || !isText(keys?.p256dh, 256) || !isText(keys?.auth, 64)) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Suscripción inválida.' });
    }
    await PushSubscriptionModel.updateOne(
        { endpoint },
        {
            $set: {
                user: req.session.userId,
                app,
                keys: { p256dh: keys.p256dh, auth: keys.auth },
                lang: lang === 'en' ? 'en' : 'es',
                userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
            },
        },
        { upsert: true },
    );
    return res.status(200).json({ status: 200, subscribed: true });
}));

routerPush.post(`${nameApi}/push/subscriptions/remove`, extendSession, validateSession, asyncHandler(async (req, res) => {
    const endpoint = req.body?.endpoint;
    if (!isText(endpoint)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Falta el endpoint.' });
    const result = await PushSubscriptionModel.deleteOne({ endpoint, user: req.session.userId });
    return res.status(200).json({ status: 200, removed: result.deletedCount ?? 0 });
}));

export { routerPush };
