import test from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';

// ══════════════════════════════════════════════════════════════════════
// WEB PUSH: a quién se manda, en qué idioma y qué pasa con las direcciones muertas, sin red ni Mongo
// ══════════════════════════════════════════════════════════════════════
// Las claves VAPID se generan para la prueba y `webpush.sendNotification` se sustituye: nada sale de esta máquina.

const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.VAPID_SUBJECT = 'https://jarvis365.net';

const { default: PushSubscriptionModel } = await import('../src/apiServises/push/pushSubscription.model.js');
const { default: NotificationModel } = await import('../src/apiServises/notification/notification.model.js');
const { pushPublicKey, sendPushToUsers } = await import('../src/apiServises/push/push.service.js');
const { notify } = await import('../src/apiServises/notification/index.js');

const subscriptions = [
    { _id: 's1', user: 'u1', app: 'insights365', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' }, lang: 'en' },
    { _id: 's2', user: 'u2', app: 'insights365', endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/def', keys: { p256dh: 'p', auth: 'a' }, lang: 'es' },
];
let findQuery: any = null;
const deleted: string[] = [];
const sentTo: { endpoint: string; payload: any; options: any }[] = [];

(PushSubscriptionModel as any).find = (query: any) => {
    findQuery = query;
    return { lean: async () => subscriptions.filter(sub => query.user.$in.includes(sub.user) && sub.app === query.app) };
};
(PushSubscriptionModel as any).updateOne = async () => ({});
(PushSubscriptionModel as any).deleteOne = async (filter: any) => { deleted.push(filter._id); return { deletedCount: 1 }; };
(webpush as any).sendNotification = async (subscription: any, payload: string, options: any) => {
    sentTo.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options });
    if (subscription.endpoint.includes('mozilla')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    return { statusCode: 201 };
};
(NotificationModel as any).create = async (doc: any) => ({ _id: 'n1', createdAt: new Date('2026-11-28T12:00:00Z'), ...doc });

const wait = () => new Promise(resolve => setTimeout(resolve, 30));


test('con claves en el .env se da la pública, para que el navegador se suscriba', () => {
    assert.equal(pushPublicKey(), keys.publicKey);
});

test('se manda a las suscripciones de esas personas en esa app; una dirección muerta (410) se borra', async () => {
    sentTo.length = 0;
    deleted.length = 0;
    const result = await sendPushToUsers(['u1', 'u2'], 'insights365', sub => ({ lang: sub.lang }));
    assert.deepEqual(findQuery, { user: { $in: ['u1', 'u2'] }, app: 'insights365' });
    assert.deepEqual(result, { sent: 1, removed: 1 });
    assert.deepEqual(deleted, ['s2']);
    assert.deepEqual(sentTo.map(item => item.payload.lang).sort(), ['en', 'es']);
    assert.equal(sentTo[0].options.urgency, 'high');
    assert.equal(sentTo[0].options.TTL, 3600);
});

test('sin destinatarios no se pide nada', async () => {
    findQuery = null;
    assert.deepEqual(await sendPushToUsers([], 'insights365', () => ({})), { sent: 0, removed: 0 });
    assert.equal(findQuery, null);
});

test('notify de una alerta la manda por push a cada uno en su idioma, con su id, su tag y su meta', async () => {
    sentTo.length = 0;
    await notify({
        type: 'novelty.alert',
        actor: { resolved: true, name: 'Jarvis365', surName: '' },
        resource: { kind: 'novelty', id: '660000000000000000000001', name: 'Demora en limpieza de mesa', path: '/en-vivo' },
        extra: { recipients: ['u1', 'u2'], category: 'delay', place: 'Francisca Davie', table: '22' },
        meta: { place: 'Francisca Davie', category: 'delay' },
    });
    await wait();
    const byEndpoint = Object.fromEntries(sentTo.map(item => [item.endpoint.includes('fcm') ? 'en' : 'es', item.payload]));
    assert.equal(byEndpoint.en.title, 'Delay · Francisca Davie');
    assert.equal(byEndpoint.en.body, 'Demora en limpieza de mesa · Table 22');
    assert.equal(byEndpoint.es.title, 'Demora · Francisca Davie');
    assert.equal(byEndpoint.es.body, 'Demora en limpieza de mesa · Mesa 22');
    assert.equal(byEndpoint.es.id, 'n1');
    assert.equal(byEndpoint.es.tag, 'novelty.alert:660000000000000000000001');
    assert.equal(byEndpoint.es.url, '/en-vivo');
    assert.deepEqual(byEndpoint.es.meta, { place: 'Francisca Davie', category: 'delay' });
});

test('un aviso del equipo (sin push en su estrategia) no sale por push', async () => {
    sentTo.length = 0;
    await notify({ type: 'establishment.created', actor: { resolved: true, name: 'Ana', surName: 'B' }, resource: { kind: 'establishment', name: 'X' } });
    await wait();
    assert.equal(sentTo.length, 0);
});
