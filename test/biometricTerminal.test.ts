import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PRINCIPAL_CODE, isTerminalCode, codeFromName, terminalCodeOf, isValidHost, addressOf, isUsableSecret,
    encryptSecret, decryptSecret, envTerminal, deviceOf, publicTerminal, checkSummary, checkRecord,
} from '../src/apiServises/biometric/biometricTerminal.lib.js';
import { kioskRoomOf, joinedTerminalOf, KIOSK_ROOM } from '../src/apiServises/biometric/biometricStream.lib.js';
import { createTerminalSchema, updateTerminalSchema } from '../src/apiServises/biometric/biometricTerminal.schema.js';

// ══════════════════════════════════════════════════════════════════════
// VARIOS TERMINALES: uno por oficina, cada uno en su dirección pública
// ══════════════════════════════════════════════════════════════════════
// Lo que importa: que cada kiosco reciba solo las huellas de SU terminal, que lo
// que ya funcionaba con el terminal del .env siga igual, y que las contraseñas
// de los equipos no salgan nunca ni queden en claro en la base.

const SECRET = 'una-clave-larga-de-prueba-para-cifrar-0123456789';



test('Código: sale del nombre, en minúsculas y sin tildes', () => {
    assert.equal(codeFromName('Oficina Centro'), 'oficina-centro');
    assert.equal(codeFromName('  Sede Ñaña #2 '), 'sede-nana-2');
    assert.equal(codeFromName('---'), '');
    const long = codeFromName('Oficina de la avenida principal de la ciudad');
    assert.ok(long.length <= 30 && isTerminalCode(long), long);
});

test('Código: minúsculas, números y guiones; sin código, el principal', () => {
    for (const ok of ['principal', 'centro', 'sede-2', 'a']) assert.equal(isTerminalCode(ok), true, ok);
    for (const bad of ['', '-centro', 'centro-', 'Centro', 'cen tro', '../x', 'x'.repeat(31), 7 as unknown as string]) assert.equal(isTerminalCode(bad), false, String(bad));
    assert.equal(terminalCodeOf(undefined), PRINCIPAL_CODE);
    assert.equal(terminalCodeOf(''), PRINCIPAL_CODE);
    assert.equal(terminalCodeOf(' Centro '), 'centro');
});

test('Dirección: una IP o un dominio, sin protocolo, puerto ni ruta', () => {
    for (const ok of ['72.68.60.160', 'bio.empresa.com', 'localhost', 'terminal-1.sede.ve']) assert.equal(isValidHost(ok), true, ok);
    for (const bad of ['256.1.1.1', '72.68.60', 'http://bio.empresa.com', 'bio.empresa.com:80', 'bio.empresa.com/isapi', ' bio.empresa.com', '-bio.com', '']) {
        assert.equal(isValidHost(bad), false, bad);
    }
    assert.equal(addressOf({ protocol: 'http', host: '72.68.60.160', port: 80 }), 'http://72.68.60.160');
    assert.equal(addressOf({ protocol: 'https', host: 'bio.empresa.com', port: 443 }), 'https://bio.empresa.com');
    assert.equal(addressOf({ protocol: 'http', host: 'bio.empresa.com', port: 8080 }), 'http://bio.empresa.com:8080');
});



test('Contraseña: se cifra y se recupera; cada cifrado es distinto', () => {
    assert.equal(isUsableSecret(SECRET), true);
    assert.equal(isUsableSecret('corta'), false, 'BIOMETRIC_SECRET tiene que ser larga');
    const a = encryptSecret('clave-de-ejemplo*', SECRET);
    const b = encryptSecret('clave-de-ejemplo*', SECRET);
    assert.notEqual(a, b, 'otro vector cada vez: dos terminales con la misma clave no se delatan');
    assert.ok(!a.includes('clave-de-ejemplo'), 'no queda en claro');
    assert.equal(decryptSecret(a, SECRET), 'clave-de-ejemplo*');
});

test('Contraseña: con otra clave, o alterada, no se puede leer', () => {
    const blob = encryptSecret('clave-de-ejemplo*', SECRET);
    assert.throws(() => decryptSecret(blob, `${SECRET}-otra`));
    const [v, iv, tag, data] = blob.split(':');
    const altered = [v, iv, tag, Buffer.from('xxxxxxxxx').toString('base64')].join(':');
    assert.throws(() => decryptSecret(altered, SECRET), 'GCM detecta el cambio');
    assert.throws(() => decryptSecret('texto-plano', SECRET));
    assert.ok(data.length > 0);
});



test('Principal: el del .env, mientras la base no tenga uno', () => {
    const env = envTerminal({ BIOMETRIC_HOST: '72.68.60.160', BIOMETRIC_USER: 'admin', BIOMETRIC_PASSWORD: 'x' });
    assert.equal(env?.code, PRINCIPAL_CODE);
    assert.equal(env?.source, 'env');
    assert.equal(env?.port, 80);
    assert.equal(envTerminal({ BIOMETRIC_HOST: 'bio.empresa.com:8080', BIOMETRIC_USER: 'admin', BIOMETRIC_PASSWORD: 'x' })?.port, 8080);
    assert.equal(envTerminal({ BIOMETRIC_HOST: '72.68.60.160', BIOMETRIC_USER: 'admin' }), null, 'incompleto: no hay principal');
});

test('Hacia el navegador: nunca la contraseña, ni cifrada', () => {
    const doc = {
        _id: '6571a0c2f1e4b2a1c3d4e5f6', code: 'centro', name: 'Oficina Centro', office: 'Av. Bolívar', protocol: 'https',
        host: 'bio.empresa.com', port: 443, username: 'admin', passwordEnc: encryptSecret('x', SECRET), password: 'x', enabled: true,
    };
    const shown = publicTerminal(doc);
    assert.equal('passwordEnc' in shown, false);
    assert.equal('password' in shown, false);
    assert.equal(JSON.stringify(shown).includes(doc.passwordEnc), false);
    assert.equal(shown.id, '6571a0c2f1e4b2a1c3d4e5f6');
    assert.equal(shown.address, 'https://bio.empresa.com');
    assert.equal(publicTerminal(envTerminal({ BIOMETRIC_HOST: 'h.com', BIOMETRIC_USER: 'u', BIOMETRIC_PASSWORD: 'p' }) as object).id, null);
});

test('Cómo hablarle: protocolo y puerto por defecto', () => {
    assert.deepEqual(deviceOf({ protocol: 'https', host: 'bio.empresa.com', username: 'admin' }, 'p'), {
        protocol: 'https', hostname: 'bio.empresa.com', port: 443, username: 'admin', password: 'p',
    });
    assert.equal(deviceOf({ host: '72.68.60.160', port: 80, username: 'admin' }, 'p').protocol, 'http');
});



test('Salas: cada kiosco recibe solo las huellas de su terminal; el principal, la de siempre', () => {
    assert.equal(kioskRoomOf(PRINCIPAL_CODE), KIOSK_ROOM, 'los kioscos de antes no cambian de sala');
    assert.equal(kioskRoomOf('centro'), `${KIOSK_ROOM}:centro`);
    assert.notEqual(kioskRoomOf('centro'), kioskRoomOf('norte'));
    assert.equal(kioskRoomOf('../x'), KIOSK_ROOM);
    assert.equal(joinedTerminalOf(undefined), PRINCIPAL_CODE, 'un kiosco de antes no dice nada');
    assert.equal(joinedTerminalOf({ terminal: ' Centro ' }), 'centro');
    assert.equal(joinedTerminalOf({ terminal: 'sala:otra' }), PRINCIPAL_CODE);
});



test('Comprobación: lo que se muestra y lo que se guarda', () => {
    const ok = {
        ok: true,
        device: { name: 'T&A Controller', model: 'DS-K1A8503MF', serialNumber: 'K60896977', firmwareVersion: 'V1.4.0', firmwareBuild: 'build 220523' },
        clock: { deviceLocalTime: '2026-11-17T16:40:00-04:00', businessLocalTime: '2026-11-17T16:40:01-04:00', driftSeconds: -1, zoneMatches: true, needsSync: false, mode: 'manual' },
        users: 7, fingerprints: 8, capacity: 1000,
    };
    const summary = checkSummary(ok);
    assert.equal(summary.ok, true);
    assert.equal(summary.users, 7);
    assert.equal('mode' in (summary.clock as object), false);
    const at = new Date('2026-11-17T20:40:01Z');
    assert.deepEqual(checkRecord(ok, at), { at, ok: true, message: null, driftSeconds: -1, users: 7, fingerprints: 8, capacity: 1000 });
    assert.deepEqual(checkSummary({ ok: false, message: 'No se pudo conectar' }), { ok: false, message: 'No se pudo conectar' });
    assert.equal(checkRecord({ ok: false, message: 'x' }, at).ok, false);
});



test('Formulario: lo que se acepta al guardar un terminal', async () => {
    const good = await createTerminalSchema.validate({
        name: 'Oficina Norte', host: 'bio-norte.empresa.com', port: '8080', protocol: 'https', username: 'admin', password: 'clave', passwordEnc: 'v1:x:y:z',
    }, { stripUnknown: true });
    assert.equal(good.port, 8080);
    assert.equal(good.code, '', 'sin código: se arma con el nombre');
    assert.equal('passwordEnc' in good, false, 'no se acepta una contraseña ya «cifrada» desde afuera');

    await assert.rejects(createTerminalSchema.validate({ name: 'X1', host: 'http://bio.com', username: 'a', password: 'b' }), /sin http/);
    await assert.rejects(createTerminalSchema.validate({ name: 'Norte', host: 'bio.com', username: 'a' }), /Falta la contraseña/);
    await assert.rejects(createTerminalSchema.validate({ name: 'Norte', host: 'bio.com', username: 'a', password: 'b', port: 70000 }), /puerto/);
    const edit = await updateTerminalSchema.validate({ name: 'Norte', host: 'bio.com', username: 'a' });
    assert.equal(edit.password, '', 'al editar, sin contraseña = la misma de antes');
});
