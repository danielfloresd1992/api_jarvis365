import test from 'node:test';
import assert from 'node:assert/strict';
import {
    generarApiKey,
    firmarSecreto,
    parsearApiKey,
    secretoCoincide,
    PREFIJO,
} from '../src/apiServises/apiKey/apiKey.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// LA PUERTA
// ══════════════════════════════════════════════════════════════════════
// Estas funciones deciden quién entra a la API. Un error acá no se ve —el
// sistema sigue andando— y significa que alguien puede pasar sin llave, o que
// una llave legítima deja de servir. Son puras, así que se prueban enteras sin
// Mongo, sin Express y sin red:
//
//     npm test

// Una llave de servidor de mentira, con largo suficiente para pasar la guarda.
const SECRETO_SERVIDOR = 'x'.repeat(64);
const OTRO_SERVIDOR = 'y'.repeat(64);


test('generarApiKey: la llave tiene la forma esperada', () => {
    const llave = generarApiKey(SECRETO_SERVIDOR);

    assert.ok(llave.plaintext.startsWith(PREFIJO));
    assert.match(llave.keyId, /^[0-9a-f]{16}$/);
    assert.match(llave.plaintext, /^jk_[0-9a-f]{16}\.[0-9a-f]{64}$/);
    assert.match(llave.secretHash, /^[0-9a-f]{64}$/);
});


test('generarApiKey: dos llaves nunca salen iguales', () => {
    // Si `randomBytes` se cambiara por algo predecible, esto es lo que lo
    // delata. Cien de cien distintas.
    const vistas = new Set<string>();
    for (let i = 0; i < 100; i++) vistas.add(generarApiKey(SECRETO_SERVIDOR).plaintext);

    assert.equal(vistas.size, 100);
});


test('generarApiKey: el texto plano NO contiene el hash', () => {
    // Lo que se le muestra al administrador y lo que se guarda en la base son
    // cosas distintas. Si el hash viajara en el texto plano, la base dejaria de
    // ser el unico lugar donde vive.
    const llave = generarApiKey(SECRETO_SERVIDOR);

    assert.ok(!llave.plaintext.includes(llave.secretHash));
});


test('sin API_KEY_SECRET no se firma nada: falla ruidosamente', () => {
    // Firmar con una cadena vacia daria hashes que cualquiera puede recalcular.
    // Es preferible que reviente al crear la llave y no que el sistema quede
    // abierto sin que nadie se entere.
    assert.throws(() => generarApiKey(''), /API_KEY_SECRET/);
    assert.throws(() => generarApiKey('corta'), /API_KEY_SECRET/);
    assert.throws(() => firmarSecreto('abc', ''), /API_KEY_SECRET/);
});


test('parsearApiKey: acepta la llave pelada y con Bearer', () => {
    const llave = generarApiKey(SECRETO_SERVIDOR);

    const pelada = parsearApiKey(llave.plaintext);
    const conBearer = parsearApiKey(`Bearer ${llave.plaintext}`);
    const minuscula = parsearApiKey(`bearer ${llave.plaintext}`);

    assert.equal(pelada!.keyId, llave.keyId);
    assert.deepEqual(conBearer, pelada);
    assert.deepEqual(minuscula, pelada);
});


test('parsearApiKey: lo que no tiene la forma devuelve null, no lanza', () => {
    // Esto recibe texto de afuera. Un 401 es la respuesta correcta a una llave
    // mal escrita; un 500 seria un error nuestro por su culpa.
    assert.equal(parsearApiKey(null), null);
    assert.equal(parsearApiKey(''), null);
    assert.equal(parsearApiKey('   '), null);
    assert.equal(parsearApiKey('Bearer '), null);
    assert.equal(parsearApiKey('otra-cosa'), null);
    assert.equal(parsearApiKey('jk_sinpunto'), null);
    assert.equal(parsearApiKey('jk_ABC.DEF'), null);                  // no es hex
    assert.equal(parsearApiKey(`jk_${'a'.repeat(15)}.${'b'.repeat(64)}`), null);  // keyId corto
    assert.equal(parsearApiKey(`jk_${'a'.repeat(16)}.${'b'.repeat(63)}`), null);  // secreto corto
    assert.equal(parsearApiKey(`jk_${'a'.repeat(16)}.${'b'.repeat(64)}.extra`), null);
});


test('secretoCoincide: el secreto correcto entra', () => {
    const llave = generarApiKey(SECRETO_SERVIDOR);
    const { secreto } = parsearApiKey(llave.plaintext)!;

    assert.equal(secretoCoincide(secreto, llave.secretHash, SECRETO_SERVIDOR), true);
});


test('secretoCoincide: un secreto distinto no entra', () => {
    const llave = generarApiKey(SECRETO_SERVIDOR);
    const otra = generarApiKey(SECRETO_SERVIDOR);
    const { secreto: secretoAjeno } = parsearApiKey(otra.plaintext)!;

    assert.equal(secretoCoincide(secretoAjeno, llave.secretHash, SECRETO_SERVIDOR), false);
});


test('secretoCoincide: con OTRA llave de servidor no entra', () => {
    // Esta es la propiedad que justifica el HMAC: quien se lleve la base entera
    // no puede fabricar una llave valida sin API_KEY_SECRET, ni validar las que
    // hay contra otro secreto.
    const llave = generarApiKey(SECRETO_SERVIDOR);
    const { secreto } = parsearApiKey(llave.plaintext)!;

    assert.equal(secretoCoincide(secreto, llave.secretHash, OTRO_SERVIDOR), false);
});


test('secretoCoincide: entradas vacias o basura devuelven false', () => {
    const llave = generarApiKey(SECRETO_SERVIDOR);

    assert.equal(secretoCoincide('', llave.secretHash, SECRETO_SERVIDOR), false);
    assert.equal(secretoCoincide('abc', '', SECRETO_SERVIDOR), false);
    // Un hash de largo distinto no puede compararse en tiempo constante: se
    // descarta antes, sin dejar que timingSafeEqual lance.
    assert.equal(secretoCoincide('abc', 'corto', SECRETO_SERVIDOR), false);
});


test('firmarSecreto: el mismo secreto da siempre el mismo hash', () => {
    // Es lo que permite verificar sin guardar el secreto: se vuelve a firmar y
    // se compara.
    const a = firmarSecreto('un-secreto', SECRETO_SERVIDOR);
    const b = firmarSecreto('un-secreto', SECRETO_SERVIDOR);

    assert.equal(a, b);
    assert.notEqual(a, firmarSecreto('otro-secreto', SECRETO_SERVIDOR));
});
