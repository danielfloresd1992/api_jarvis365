import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createResetToken,
    hashResetToken,
    isResetTokenShape,
    normalizeEmail,
    maskEmail,
    resetBaseFor,
    resetLink,
    sessionIdsOf,
    escapeHtml,
    resetMail,
    passwordChangedMail,
    RESET_PATH,
} from '../src/apiServises/auth/passwordReset.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// RESTABLECER LA CONTRASEÑA POR CORREO
// ══════════════════════════════════════════════════════════════════════
// Las reglas puras del flujo: el token, el enlace, a qué portal va, qué
// sesiones se cierran y qué dicen los correos. Sin Mongo, sin Express y sin
// red.


test('createResetToken: el token tiene la forma esperada y la huella es su SHA-256', () => {
    const { token, tokenHash } = createResetToken();
    assert.ok(isResetTokenShape(token));
    assert.match(tokenHash, /^[0-9a-f]{64}$/);
    assert.equal(tokenHash, hashResetToken(token));
});


test('createResetToken: dos tokens nunca salen iguales', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 100; i++) vistos.add(createResetToken().token);
    assert.equal(vistos.size, 100);
});


test('hashResetToken: la huella no deja ver el token', () => {
    const { token, tokenHash } = createResetToken();
    assert.ok(!tokenHash.includes(token));
    assert.notEqual(hashResetToken(token), hashResetToken(`${token.slice(0, -1)}A`));
});


test('isResetTokenShape: rechaza lo que no generó este sistema', () => {
    for (const malo of [undefined, null, 42, '', 'abc', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}+`, `${'a'.repeat(42)}=`, { $gt: '' }]) {
        assert.equal(isResetTokenShape(malo), false, `debía rechazar ${JSON.stringify(malo)}`);
    }
    assert.equal(isResetTokenShape('a'.repeat(43)), true);
});


test('normalizeEmail: sin espacios y en minúsculas', () => {
    assert.equal(normalizeEmail('  Juan.Perez@Restaurante.COM '), 'juan.perez@restaurante.com');
    assert.equal(normalizeEmail(undefined), '');
});


test('maskEmail: tapa el nombre y deja el dominio', () => {
    assert.equal(maskEmail('daniel@restaurante.com'), 'd•••@restaurante.com');
    assert.equal(maskEmail('a@b.co'), 'a•••@b.co');
    assert.equal(maskEmail('sin-arroba'), '•••');
    assert.equal(maskEmail(''), '•••');
});


test('resetBaseFor: la dirección sale del entorno, nunca de la petición', () => {
    assert.equal(resetBaseFor('insights', { INSIGHTS_URL: 'https://insights.jarvis365.net/' }, false), 'https://insights.jarvis365.net');
    assert.equal(resetBaseFor('insights', { INSIGHTS_URL: '  ' }, false), null);
});


test('resetBaseFor: sin variable, localhost solo en desarrollo', () => {
    assert.equal(resetBaseFor('insights', {}, true), 'http://localhost:5174');
    // En producción no hay respaldo: un enlace a localhost en un correo real no sirve.
    assert.equal(resetBaseFor('insights', {}, false), null);
});


test('resetBaseFor: un portal que no está en la lista no tiene dirección', () => {
    assert.equal(resetBaseFor('otro' as any, { INSIGHTS_URL: 'https://x.net' }, true), null);
});


test('resetLink: el token va después de #, para que no viaje al servidor ni al Referer', () => {
    const link = resetLink('https://insights.jarvis365.net/', 'T'.repeat(43));
    assert.equal(link, `https://insights.jarvis365.net${RESET_PATH}#token=${'T'.repeat(43)}`);
    assert.equal(new URL(link).search, '');
});


test('sessionIdsOf: encuentra las sesiones de la persona en el arreglo de connect-redis', () => {
    const sesiones = [
        { id: 's1', userId: 'u1', dataUser: { _id: 'u1' } },
        { id: 's2', userId: 'u2' },
        { id: 's3', dataUser: { _id: 'u1' } },
        { id: 's4' },
        { userId: 'u1' },
    ];
    assert.deepEqual(sessionIdsOf(sesiones, 'u1'), ['s1', 's3']);
});


test('sessionIdsOf: y en el objeto del MemoryStore', () => {
    const sesiones = { s1: { userId: 'u1' }, s2: { userId: 'u2' }, s3: null };
    assert.deepEqual(sessionIdsOf(sesiones, 'u1'), ['s1']);
});


test('sessionIdsOf: un id de Mongo se compara como texto', () => {
    const idDeMongo = { toString: () => 'u1' };
    assert.deepEqual(sessionIdsOf([{ id: 's1', userId: 'u1' }], idDeMongo as any), ['s1']);
});


test('sessionIdsOf: nada que leer, nada que cerrar', () => {
    assert.deepEqual(sessionIdsOf(undefined, 'u1'), []);
    assert.deepEqual(sessionIdsOf([], 'u1'), []);
});


test('escapeHtml: lo que escribió una persona no se cuela como HTML', () => {
    assert.equal(escapeHtml('<b>"Ana" & \'Luis\'</b>'), '&lt;b&gt;&quot;Ana&quot; &amp; &#39;Luis&#39;&lt;/b&gt;');
});


test('resetMail: lleva el enlace, el correo y cuánto dura, en texto y en HTML', () => {
    const link = resetLink('https://insights.jarvis365.net', 'T'.repeat(43));
    const mail = resetMail({ name: 'Daniel', email: 'daniel@restaurante.com', link, minutes: 30 });

    assert.match(mail.subject, /contraseña/);
    for (const parte of [mail.text, mail.html]) {
        assert.ok(parte.includes(link), 'falta el enlace');
        assert.ok(parte.includes('daniel@restaurante.com'), 'falta el correo');
        assert.ok(parte.includes('30 minutos'), 'falta la duración');
        assert.ok(parte.includes('Daniel'), 'falta el saludo');
    }
});


test('resetMail: el nombre se escapa en el HTML y sin nombre saluda igual', () => {
    const mail = resetMail({ name: '<script>x</script>', email: 'a@b.co', link: 'https://x.net/#token=t', minutes: 30 });
    assert.ok(!mail.html.includes('<script>'));
    assert.ok(mail.html.includes('&lt;script&gt;'));

    const sinNombre = resetMail({ name: '  ', email: 'a@b.co', link: 'https://x.net/#token=t', minutes: 30 });
    assert.ok(sinNombre.text.startsWith('Hola:'));
});


test('passwordChangedMail: dice cuándo, en hora de Caracas, y a quién avisar', () => {
    // 2026-11-21 16:30 UTC son las 12:30 en Caracas (UTC−4).
    const mail = passwordChangedMail({ name: 'Daniel', when: new Date('2026-11-21T16:30:00Z') });
    assert.match(mail.text, /21 de noviembre de 2026/);
    assert.match(mail.text, /12:30/);
    assert.match(mail.text, /Si no fuiste tú/);
    assert.ok(mail.html.includes('Daniel'));
});
