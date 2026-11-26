import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImage, parseFranchiseUpdate, IMAGE_MAX, LOCATION_MAX } from '../src/apiServises/franchise/franchise.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// LA FOTO Y LOS DATOS DE UNA FRANQUICIA
// ══════════════════════════════════════════════════════════════════════
// Las reglas puras de PUT /franchise/:id (y de la imagen opcional del POST):
// qué se puede cambiar y qué no. Sin Mongo y sin Express.

const FOTO = 'https://amazona365.ddns.net/api_jarvis/v1/novelty/img=novelty_1769543904895.png';


test('parseImage: una URL http(s) vale, sin espacios alrededor', () => {
    assert.deepEqual(parseImage(`  ${FOTO}  `), { ok: true, value: FOTO });
    assert.deepEqual(parseImage('http://192.168.0.10:3006/img.png'), { ok: true, value: 'http://192.168.0.10:3006/img.png' });
});

test('parseImage: null o vacío quitan la foto', () => {
    assert.deepEqual(parseImage(null), { ok: true, value: null });
    assert.deepEqual(parseImage(''), { ok: true, value: null });
});

test('parseImage: rechaza lo que no es una URL http(s)', () => {
    for (const malo of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'ftp://x/y.png', 'img.png', 'https://con espacios.png', 42, {}, []]) {
        assert.equal(parseImage(malo).ok, false, `debería rechazar ${JSON.stringify(malo)}`);
    }
});

test('parseImage: rechaza una URL demasiado larga', () => {
    assert.equal(parseImage(`https://x.com/${'a'.repeat(IMAGE_MAX)}`).ok, false);
});


test('parseFranchiseUpdate: solo la foto', () => {
    assert.deepEqual(parseFranchiseUpdate({ image: FOTO }), { ok: true, value: { image: FOTO } });
});

test('parseFranchiseUpdate: quitar la foto', () => {
    assert.deepEqual(parseFranchiseUpdate({ image: null }), { ok: true, value: { image: null } });
});

test('parseFranchiseUpdate: foto y ubicación, la ubicación sin espacios alrededor', () => {
    assert.deepEqual(parseFranchiseUpdate({ image: FOTO, location: '  Miami  ' }), { ok: true, value: { image: FOTO, location: 'Miami' } });
});

test('parseFranchiseUpdate: el nombre no se cambia, aunque venga con otra cosa', () => {
    const resultado = parseFranchiseUpdate({ name: 'Otra', image: FOTO });
    assert.equal(resultado.ok, false);
    assert.match(resultado.ok ? '' : resultado.error, /nombre/);
});

test('parseFranchiseUpdate: rechaza campos desconocidos y dice cuáles', () => {
    const resultado = parseFranchiseUpdate({ image: FOTO, _id: 'x', locales: [] });
    assert.equal(resultado.ok, false);
    assert.match(resultado.ok ? '' : resultado.error, /_id, locales/);
});

test('parseFranchiseUpdate: un cuerpo vacío o que no es objeto no cambia nada', () => {
    for (const malo of [{}, null, undefined, 'texto', [FOTO]]) {
        assert.equal(parseFranchiseUpdate(malo).ok, false, `debería rechazar ${JSON.stringify(malo)}`);
    }
});

test('parseFranchiseUpdate: una foto inválida tumba todo el cambio', () => {
    assert.equal(parseFranchiseUpdate({ image: 'img.png', location: 'Miami' }).ok, false);
});

test('parseFranchiseUpdate: la ubicación tiene que ser texto y no muy larga', () => {
    assert.equal(parseFranchiseUpdate({ location: 7 }).ok, false);
    assert.equal(parseFranchiseUpdate({ location: 'x'.repeat(LOCATION_MAX + 1) }).ok, false);
    assert.deepEqual(parseFranchiseUpdate({ location: '' }), { ok: true, value: { location: '' } });
});
