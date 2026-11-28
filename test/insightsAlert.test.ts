import test from 'node:test';
import assert from 'node:assert/strict';
import MenuModel from '../src/apiServises/menu/menu.model.js';
import LocalModel from '../src/apiServises/local/local.model.js';
import UserModel from '../src/apiServises/user/user.model.js';
import NotificationModel from '../src/apiServises/notification/notification.model.js';
import { audienceQuery, channelOf } from '../src/apiServises/notification/notification.audience.js';
import { resolveStrategy } from '../src/apiServises/notification/strategies/index.js';
import { INSIGHTS_ALERT_CATEGORIES, insightsRecipients, notifyInsightsAlert } from '../src/apiServises/noveltie/insightsAlert.lib.js';

// ══════════════════════════════════════════════════════════════════════
// LAS ALERTAS DE DEMORAS E INCIDENCIAS PARA LOS CLIENTES (insights365), sin Mongo
// ══════════════════════════════════════════════════════════════════════
// Los modelos se sustituyen por dobles en memoria: la prueba recorre el camino
// entero (la novedad pasa a contar → la estrategia → se guarda la notificación)
// sin base. Sin claves VAPID en el entorno, el push no sale (y no debe romper).

const FRANCISCA = '64a000000000000000000001';
const DAVIE = '637a7cec1a8ed7ed7d7e71f5';
const DORAL = '637a7ae31a8ed7ed7d7e71e0';
const CLIENTE_LOCAL = '650000000000000000000001';
const CLIENTE_FRANQUICIA = '650000000000000000000002';
const CLIENTE_OTRO = '650000000000000000000003';

const chain = (value: unknown) => ({ select: () => ({ lean: async () => value }) });

let menu: { category: string; es: string } | null = { category: 'delay', es: 'Demora en limpieza de mesa' };
const locals: Record<string, unknown> = {
    [DAVIE]: { _id: DAVIE, name: 'Francisca Davie', image: null, franchiseReference: { franchise: FRANCISCA } },
    [DORAL]: { _id: DORAL, name: 'Francisca Doral', image: null, franchiseReference: { franchise: FRANCISCA } },
};
// Los usuarios con acceso 'only' que devolvería la consulta, con su permiso real
const users = [
    { _id: CLIENTE_LOCAL, access: { mode: 'only', locals: [DAVIE], franchises: [] } },
    { _id: CLIENTE_FRANQUICIA, access: { mode: 'only', locals: [], franchises: [FRANCISCA] } },
    { _id: CLIENTE_OTRO, access: { mode: 'only', locals: [DORAL], franchises: [] } },
];
const created: any[] = [];

(MenuModel as any).findById = () => chain(menu);
(LocalModel as any).findById = (id: string) => chain(locals[String(id)] ?? null);
(UserModel as any).find = () => ({ select: () => ({ lean: async () => users }) });
(NotificationModel as any).create = async (doc: any) => {
    const saved = { _id: `n${created.length + 1}`, createdAt: new Date(), ...doc };
    created.push(saved);
    return saved;
};

const counted = { validationResult: { isApproved: true }, sharedByAmazonActive: true };
const novelty = (extra: Record<string, unknown> = {}) => ({
    _id: '660000000000000000000001', title: 'Demora en limpieza de mesa', table: '22', menuRef: '670000000000000000000001',
    establishment: DAVIE, imageToShare: 'https://amazona365.ddns.net/x.jpg', menu: '*Demora en limpieza de mesa*\nMesa: 22\nNota: la mesa quedó sucia 6 minutos', ...extra,
});


test('solo demoras e incidencias', () => {
    assert.deepEqual(INSIGHTS_ALERT_CATEGORIES, ['delay', 'incident']);
});

test('la estrategia: canal insights, push a insights365, personal y con el local en el título', () => {
    const strategy = resolveStrategy('novelty.alert');
    assert.equal(strategy.channel, 'insights');
    assert.equal(strategy.push, 'insights365');
    assert.equal(strategy.scope, 'personal');
    assert.equal(strategy.family, 'alert');
    const ctx = { resource: { name: 'Demora en limpieza de mesa' }, extra: { category: 'delay', place: 'Francisca Davie', table: '22', recipients: ['a', 'b'] } };
    assert.deepEqual(strategy.text(ctx, 'es'), { title: 'Demora · Francisca Davie', body: 'Demora en limpieza de mesa · Mesa 22' });
    assert.deepEqual(strategy.text(ctx, 'en'), { title: 'Delay · Francisca Davie', body: 'Demora en limpieza de mesa · Table 22' });
    assert.deepEqual(strategy.audience(ctx), ['a', 'b']);
    const barra = { ...ctx, extra: { ...ctx.extra, category: 'incident', table: 'Barra' } };
    assert.deepEqual(strategy.text(barra, 'es'), { title: 'Incidencia · Francisca Davie', body: 'Demora en limpieza de mesa · Barra' });
});

test('las dos bandejas no se mezclan', () => {
    const session = { userId: CLIENTE_LOCAL, admin: true };
    assert.equal(channelOf('insights'), 'insights');
    assert.equal(channelOf(undefined), 'staff');
    assert.equal(channelOf('otra'), 'staff');
    assert.deepEqual(audienceQuery(session, 'insights'), { channel: 'insights', scope: 'personal', recipients: CLIENTE_LOCAL });
    const staff = audienceQuery(session) as any;
    assert.deepEqual(staff.channel, { $ne: 'insights' });
    assert.equal(staff.$or.length, 3);
});

test('a quién: los clientes que ven el local, por el local o por su franquicia', async () => {
    assert.deepEqual(await insightsRecipients(locals[DAVIE]), [CLIENTE_LOCAL, CLIENTE_FRANQUICIA]);
    assert.deepEqual(await insightsRecipients(null), []);
});

test('al quedar validada y enviada al grupo se avisa una vez, con el local y la mesa', async () => {
    created.length = 0;
    await notifyInsightsAlert(novelty(), novelty(counted));
    assert.equal(created.length, 1);
    const doc = created[0];
    assert.equal(doc.type, 'novelty.alert');
    assert.equal(doc.channel, 'insights');
    assert.equal(doc.family, 'alert');
    assert.deepEqual(doc.recipients, [CLIENTE_LOCAL, CLIENTE_FRANQUICIA]);
    assert.equal(doc.i18n.es.title, 'Demora · Francisca Davie');
    assert.equal(doc.i18n.es.body, 'Demora en limpieza de mesa · Mesa 22');
    assert.equal(doc.meta.place, 'Francisca Davie');
    assert.equal(doc.meta.category, 'delay');
    assert.equal(doc.meta.image, 'https://amazona365.ddns.net/x.jpg');
    assert.equal(doc.meta.table, '22');
    assert.equal(doc.meta.description, '*Demora en limpieza de mesa*\nMesa: 22\nNota: la mesa quedó sucia 6 minutos');
    assert.equal(doc.resource.path, '/en-vivo');
    // Volver a guardarla ya contada no avisa otra vez
    await notifyInsightsAlert(novelty(counted), novelty(counted));
    assert.equal(created.length, 1);
});

test('no se avisa lo que no es demora ni incidencia, ni lo que no está validado y enviado', async () => {
    created.length = 0;
    menu = { category: 'food', es: 'Devolución' };
    await notifyInsightsAlert(novelty(), novelty(counted));
    menu = { category: 'delay', es: 'Demora' };
    await notifyInsightsAlert(novelty(), novelty({ validationResult: { isApproved: true } }));
    await notifyInsightsAlert(novelty(), novelty({ sharedByAmazonActive: true }));
    await notifyInsightsAlert(novelty(), novelty({ ...counted, establishment: null }));
    assert.equal(created.length, 0);
    // givenToTheGroup (las de antes) también cuenta, y una incidencia también se avisa
    menu = { category: 'incident', es: 'Incidencia' };
    await notifyInsightsAlert(novelty(), novelty({ validationResult: { isApproved: true }, givenToTheGroup: true }));
    assert.equal(created.length, 1);
    assert.equal(created[0].i18n.es.title, 'Incidencia · Francisca Davie');
});
