import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseWallQuery,
    wallFilter,
    periodOf,
    toWallNovelty,
    WALL_FIELDS,
    WALL_LIMIT_DEFAULT,
    WALL_LIMIT_MAX,
    WALL_ESTABLISHMENTS_MAX,
} from '../src/apiServises/noveltie/noveltyWall.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// EL MURO DE ALERTAS DEL CLIENTE
// ══════════════════════════════════════════════════════════════════════
// Las reglas puras de GET /novelties/wall: qué consulta se acepta, qué filtro
// sale y qué se le enseña al cliente de cada novedad. Sin Mongo y sin Express.

const A = '637a7ae31a8ed7ed7d7e71e0';
const B = '637a7b961a8ed7ed7d7e71eb';
const CURSOR = '6a95e1e746ebda1c70644c06';


test('parseWallQuery: ids separados por comas, sin repetir y sin espacios; límite por defecto', () => {
    const parsed = parseWallQuery({ establishments: ` ${A}, ${B} ,${A},` });
    assert.deepEqual(parsed, { ok: true, value: { establishments: [A, B], before: null, limit: WALL_LIMIT_DEFAULT } });
});

test('parseWallQuery: también acepta establishments repetido (Express lo da como lista)', () => {
    const parsed = parseWallQuery({ establishments: [A, `${B},${A}`] });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.ok && parsed.value.establishments, [A, B]);
});

test('parseWallQuery: sin establecimientos, con uno que no es id o con un objeto, 400', () => {
    for (const establishments of [undefined, '', ' , ', 'abc', `${A},no-es-id`, { $ne: null }, [A, { x: 1 }]]) {
        const parsed = parseWallQuery({ establishments });
        assert.equal(parsed.ok, false, JSON.stringify(establishments));
    }
});

test('parseWallQuery: no más de WALL_ESTABLISHMENTS_MAX', () => {
    const many = Array.from({ length: WALL_ESTABLISHMENTS_MAX + 1 }, (_, index) => index.toString(16).padStart(24, '0'));
    assert.equal(parseWallQuery({ establishments: many.join(',') }).ok, false);
    assert.equal(parseWallQuery({ establishments: many.slice(1).join(',') }).ok, true);
});

test('parseWallQuery: before es el id de la última recibida', () => {
    const parsed = parseWallQuery({ establishments: A, before: CURSOR });
    assert.equal(parsed.ok && parsed.value.before, CURSOR);
    assert.equal(parseWallQuery({ establishments: A, before: '' }).ok, true);
    assert.equal(parseWallQuery({ establishments: A, before: 'mañana' }).ok, false);
    assert.equal(parseWallQuery({ establishments: A, before: { $gt: '' } }).ok, false);
});

test('parseWallQuery: limit entero y positivo, recortado a WALL_LIMIT_MAX', () => {
    const limitOf = (limit: unknown) => {
        const parsed = parseWallQuery({ establishments: A, limit });
        return parsed.ok ? parsed.value.limit : 'error';
    };
    assert.equal(limitOf('12'), 12);
    assert.equal(limitOf(String(WALL_LIMIT_MAX + 500)), WALL_LIMIT_MAX);
    assert.equal(limitOf(''), WALL_LIMIT_DEFAULT);
    for (const wrong of ['0', '-3', '2.5', 'diez', ['5']]) assert.equal(limitOf(wrong), 'error', JSON.stringify(wrong));
});

test('wallFilter: el local en los dos sitios, validada y enviada al grupo (cualquiera de los dos campos)', () => {
    assert.deepEqual(wallFilter({ establishments: [A, B], before: null }), {
        $and: [
            { $or: [{ establishment: { $in: [A, B] } }, { 'local.idLocal': { $in: [A, B] } }] },
            { 'validationResult.isApproved': true },
            { $or: [{ sharedByAmazonActive: true }, { givenToTheGroup: true }] },
        ],
    });
});

test('wallFilter: con cursor, solo las más viejas que él', () => {
    assert.deepEqual(wallFilter({ establishments: [A], before: CURSOR })._id, { $lt: CURSOR });
});

test('WALL_FIELDS: no lee nada interno', () => {
    const fields = WALL_FIELDS.split(' ');
    for (const internal of ['bonus', 'sharedByUser', 'validationResult', 'validationResult.validatedByUser', 'menuEditedBy', 'isValidate', 'fileNoveltie']) {
        assert.ok(!fields.includes(internal), internal);
    }
    assert.ok(fields.includes('validationResult.updatedAt'));
});

test('periodOf: las dos formas, también como JSON en texto, y lo demás null', () => {
    assert.deepEqual(periodOf({ init: '15:58:04', end: '16:15:45' }), { start: '15:58:04', end: '16:15:45' });
    assert.deepEqual(periodOf('{"init":"9:05","end":"9:20"}'), { start: '9:05', end: '9:20' });
    assert.deepEqual(
        periodOf({ tomaOrden: '19:00:10', listoTablet: '19:01:00', listoCocina: '19:20:00', entregaPlato: '19:24:30' }),
        { start: '19:00:10', end: '19:24:30' },
    );
    for (const wrong of [null, undefined, '', 'no-json', 42, { init: '15:58:04' }, { init: 'ayer', end: 'hoy' }, { tomaOrden: '19:00' }]) {
        assert.equal(periodOf(wrong), null, JSON.stringify(wrong));
    }
});

test('toWallNovelty: lo que ve el cliente, con lo que falta resuelto', () => {
    const doc = {
        _id: { toString: () => CURSOR },
        title: 'Cono de seguridad',
        date: new Date('2026-08-31T20:19:51.000Z'),
        createdAt: new Date('2026-08-31T20:19:51.777Z'),
        shift: 'day',
        table: '',
        nameDish: null,
        amount: null,
        orderTicketNumber: 1234,
        timePeriod: { init: '15:58:04', end: '16:15:45' },
        menu: '*Francisca Orlando*\n_*Cono de seguridad*_',
        imageToShare: 'https://amazona365.ddns.net/api_jarvis/v1/novelty/img=a.png',
        imageUrl: [{ url: 'https://x/inicio.png', caption: 'Inicio' }, { url: '', caption: 'rota' }, { url: 'https://x/fin.png' }],
        videoUrl: null,
        menuRef: { _id: '66bcfac624bfdde150632df1', es: 'Cono de seguridad', en: 'Safety cone', category: 'protocol' },
        establishment: undefined,
        local: { name: 'Francisca Orlando', idLocal: { toString: () => '69b83a826cf018e265a155db' } },
        validationResult: { updatedAt: new Date('2026-08-31T20:24:19.485Z') },
    };
    assert.deepEqual(toWallNovelty(doc), {
        _id: CURSOR,
        title: 'Cono de seguridad',
        establishment: '69b83a826cf018e265a155db',
        place: 'Francisca Orlando',
        date: '2026-08-31T20:19:51.000Z',
        shift: 'day',
        table: null,
        nameDish: null,
        amount: null,
        orderTicketNumber: 1234,
        period: { start: '15:58:04', end: '16:15:45' },
        menu: '*Francisca Orlando*\n_*Cono de seguridad*_',
        imageToShare: 'https://amazona365.ddns.net/api_jarvis/v1/novelty/img=a.png',
        images: [{ url: 'https://x/inicio.png', caption: 'Inicio' }, { url: 'https://x/fin.png', caption: null }],
        videoUrl: null,
        alert: { _id: '66bcfac624bfdde150632df1', name: 'Cono de seguridad', nameEn: 'Safety cone', category: 'protocol' },
        validatedAt: '2026-08-31T20:24:19.485Z',
    });
});

test('toWallNovelty: establishment manda sobre local.idLocal; menuRef sin poblar no es alerta; sin date, createdAt', () => {
    const novelty = toWallNovelty({
        _id: CURSOR,
        establishment: A,
        local: { idLocal: B },
        menuRef: { _bsontype: 'ObjectId', toString: () => '66bcfac624bfdde150632df1' },
        createdAt: '2026-01-02T03:04:05.000Z',
        shift: 'tarde',
    });
    assert.equal(novelty.establishment, A);
    assert.equal(novelty.alert, null);
    assert.equal(novelty.date, '2026-01-02T03:04:05.000Z');
    assert.equal(novelty.shift, null);
    assert.equal(novelty.title, '');
    assert.deepEqual(novelty.images, []);
});
