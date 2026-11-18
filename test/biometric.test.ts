import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BiometricError, errorResponse, parseDigestChallenge, digestAuthorization, xmlValue, parseDeviceInfo,
    parseDeviceTime, offsetMinutesOfIso, localIsoAt, businessDateOf, isIsoDate, hikTimeZone, clockReport,
    timeSyncXml, describeAcsEvent, normalizeAcsEvent, normalizeDeviceUser, eventSearchBody, dayCondition, userSearchBody,
    searchIdOf, deviceErrorDetail, PAGE_SIZE,
} from '../src/apiServises/biometric/biometric.lib.js';
import {
    normalizeName, nameTokens, tokensMatch, nameMatch, sameIdNumber, isValidEmployeeNo, compactUser,
    suggestionFor, buildLinkReport,
} from '../src/apiServises/biometric/biometricLink.lib.js';
import UserModel from '../src/apiServises/user/user.model.js';

// ══════════════════════════════════════════════════════════════════════
// TERMINAL BIOMÉTRICO: autenticación, lectura de respuestas, reloj y eventos
// ══════════════════════════════════════════════════════════════════════
// Las respuestas de ejemplo son las que devolvió el DS-K1A8503MF del local el
// 2026-11-17 (firmware V1.4.0). Si un firmware nuevo cambia su forma, estas
// pruebas son las que tienen que avisar.

const DEVICE_INFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<deviceName>T&amp;A Controller</deviceName>
<deviceID>255</deviceID>
<model>DS-K1A8503MF</model>
<serialNumber>K60896977</serialNumber>
<macAddress>BC:9B:5E:26:DD:AA</macAddress>
<firmwareVersion>V1.4.0</firmwareVersion>
<firmwareReleasedDate>build 220523</firmwareReleasedDate>
<deviceType>ACS</deviceType>
<supportBeep>true</supportBeep>
<customizedInfo></customizedInfo>
</DeviceInfo>`;

// Leída a las 15:45:10Z: el terminal iba ~4 minutos adelantado y con la zona vieja (-04:30).
const DEVICE_TIME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Time version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<timeMode>manual</timeMode>
<localTime>2026-11-17T11:49:04-04:30</localTime>
<timeZone>CST+4:30:00</timeZone>
</Time>`;
const READ_AT = new Date('2026-11-17T15:45:10Z');

const DEVICE_CHALLENGE = 'Digest qop="auth", realm="DS-CEECFFD6", nonce="MDI2MWY3YzgxN2QyZDVjMTM4M2E2ZDAwMzZkYTZlZDE=", stale="false", opaque="", domain="::"';

// Un marcaje real de la búsqueda AcsEvent.
const MARK_EVENT = {
    major: 5, minor: 38, time: '2026-11-17T11:58:09-04:30', netUser: '', remoteHostAddr: '0.0.0.0', cardNo: '',
    cardType: 1, cardReaderNo: 1, doorNo: 1, employeeNoString: '25', serialNo: 46954, userType: 'normal',
    attendanceStatus: 'undefined', statusValue: 0,
};



test('Digest: responde el ejemplo del RFC 2617 al carácter', () => {
    const challenge = parseDigestChallenge('Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"');
    const header = digestAuthorization({
        username: 'Mufasa', password: 'Circle Of Life', method: 'GET', uri: '/dir/index.html',
        challenge, cnonce: '0a4f113b', nc: '00000001',
    });
    assert.match(header, /response="6629fae49393a05397450978507c4ef1"/);
    assert.match(header, /qop=auth, nc=00000001, cnonce="0a4f113b"/);
    assert.match(header, /opaque="5ccc069c403ebaf9f0171e9517f40e41"/);
});

test('Digest: lee el reto real del terminal, con su opaque vacío', () => {
    const challenge = parseDigestChallenge(DEVICE_CHALLENGE);
    assert.equal(challenge.realm, 'DS-CEECFFD6');
    assert.equal(challenge.qop, 'auth');
    assert.equal(challenge.opaque, '');
    const header = digestAuthorization({ username: 'admin', password: 'x', method: 'GET', uri: '/ISAPI/System/time', challenge, cnonce: 'abc' });
    assert.match(header, /opaque=""/, 'el opaque vacío se devuelve tal cual');
    assert.match(header, /uri="\/ISAPI\/System\/time"/);
});

test('Digest: rechaza lo que no sabe responder, en vez de mandar una respuesta mala', () => {
    assert.equal(parseDigestChallenge('Basic realm="x"'), null);
    assert.equal(parseDigestChallenge(undefined), null);
    const base = { username: 'a', password: 'b', method: 'GET', uri: '/' };
    assert.throws(() => digestAuthorization({ ...base, challenge: { realm: 'r', nonce: 'n', algorithm: 'SHA-256' } }), BiometricError);
    assert.throws(() => digestAuthorization({ ...base, challenge: { realm: 'r', nonce: 'n', qop: 'auth-int' } }), BiometricError);
});

test('Digest sin qop (RFC 2069): la respuesta no lleva nc ni cnonce', () => {
    const header = digestAuthorization({ username: 'a', password: 'b', method: 'GET', uri: '/', challenge: { realm: 'r', nonce: 'n' } });
    assert.doesNotMatch(header, /qop=|nc=|cnonce=/);
});



test('XML: lee los datos del equipo y decodifica las entidades', () => {
    assert.deepEqual(parseDeviceInfo(DEVICE_INFO_XML), {
        name: 'T&A Controller',
        model: 'DS-K1A8503MF',
        serialNumber: 'K60896977',
        macAddress: 'BC:9B:5E:26:DD:AA',
        firmwareVersion: 'V1.4.0',
        firmwareBuild: 'build 220523',
        deviceType: 'ACS',
    });
    assert.equal(xmlValue(DEVICE_INFO_XML, 'noExiste'), null);
    assert.equal(xmlValue(DEVICE_INFO_XML, 'customizedInfo'), '');
});



test('Reloj: mide la diferencia en hora de pared y señala la zona vieja', () => {
    const report = clockReport(parseDeviceTime(DEVICE_TIME_XML), READ_AT);
    assert.equal(report.mode, 'manual');
    assert.equal(report.businessLocalTime, '2026-11-17T11:45:10-04:00');
    assert.equal(report.driftSeconds, 234, '11:49:04 en pantalla frente a 11:45:10 reales');
    assert.equal(report.deviceOffsetMinutes, -270);
    assert.equal(report.zoneMatches, false);
    assert.equal(report.needsSync, true);
});

test('Reloj: en hora y con la zona correcta no pide ajuste', () => {
    const report = clockReport({ mode: 'manual', localTime: '2026-11-17T11:45:40-04:00', timeZone: 'CST+4:00:00' }, READ_AT);
    assert.equal(report.driftSeconds, 30);
    assert.equal(report.zoneMatches, true);
    assert.equal(report.needsSync, false);
});

test('Reloj: una hora ilegible se trata como desajustada', () => {
    const report = clockReport({ mode: null, localTime: null, timeZone: null }, READ_AT);
    assert.equal(report.driftSeconds, null);
    assert.equal(report.needsSync, true);
});

test('Zona del terminal: el signo va invertido, como la informó el equipo', () => {
    assert.equal(hikTimeZone(-270), 'CST+4:30:00', 'la pareja observada: horas -04:30 con zona CST+4:30:00');
    assert.equal(hikTimeZone(-240), 'CST+4:00:00');
    assert.equal(hikTimeZone(60), 'CST-1:00:00');
});

test('Poner en hora: manda la hora del servidor en UTC-04:00 y modo manual', () => {
    const xml = timeSyncXml(new Date('2026-11-17T16:40:00Z'));
    assert.equal(xmlValue(xml, 'timeMode'), 'manual');
    assert.equal(xmlValue(xml, 'localTime'), '2026-11-17T12:40:00-04:00');
    assert.equal(xmlValue(xml, 'timeZone'), 'CST+4:00:00');
});

test('Desfases y fechas del negocio', () => {
    assert.equal(offsetMinutesOfIso('2026-11-17T11:49:04-04:30'), -270);
    assert.equal(offsetMinutesOfIso('2024-02-23T12:43:50+08:00'), 480, 'los eventos viejos traen +08:00');
    assert.equal(offsetMinutesOfIso('2026-11-17T15:00:00Z'), 0);
    assert.equal(offsetMinutesOfIso('2026-11-17T15:00:00'), null);
    assert.equal(localIsoAt(new Date('2026-11-17T16:40:05Z'), -240), '2026-11-17T12:40:05-04:00');
    assert.equal(businessDateOf(new Date('2026-11-18T02:00:00Z')), '2026-11-17', 'a las 22:00 de Caracas sigue siendo el 17');
    assert.equal(businessDateOf(new Date('2026-11-18T04:00:00Z')), '2026-11-18');
    assert.equal(isIsoDate('2026-11-17'), true);
    assert.equal(isIsoDate('2026-02-30'), false);
    assert.equal(isIsoDate('17-11-2026'), false);
    assert.equal(isIsoDate(undefined), false);
});



test('Eventos: un marcaje real queda como «Huella aceptada» con su empleado', () => {
    assert.deepEqual(normalizeAcsEvent(MARK_EVENT), {
        serialNo: 46954,
        time: '2026-11-17T11:58:09-04:30',
        employeeNo: '25',
        major: 5,
        minor: 38,
        label: 'Huella aceptada',
        kind: 'mark',
        attendanceStatus: 'undefined',
    });
});

test('Eventos: la huella no registrada no trae empleado; lo desconocido no se inventa', () => {
    const rejected = normalizeAcsEvent({ ...MARK_EVENT, minor: 49, employeeNoString: '' });
    assert.equal(rejected.kind, 'rejected');
    assert.equal(rejected.employeeNo, null);
    assert.equal(rejected.label, 'Huella no registrada');
    assert.equal(describeAcsEvent(9, 9), 'Evento 9/9');
    assert.equal(normalizeAcsEvent({ major: 3, minor: 121 }).kind, 'other');
});

test('Empleados: el registro real del firmware V1.4.0, sin su clave de puerta', () => {
    // Forma exacta que devolvió el terminal (nombre cambiado). No trae numOfFP ni numOfCard.
    const real = {
        employeeNo: '1', name: 'Ana', userType: 'normal', closeDelayEnabled: false,
        Valid: { enable: true, timeType: 'UTC', beginTime: '1969-12-31T19:30:00-04:30', endTime: '2037-12-31T11:29:59-04:30' },
        password: '1234', doorRight: '1', RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
        maxOpenDoorTime: 0, openDoorTime: 0, localUIRight: true, userVerifyMode: '',
    };
    const user = normalizeDeviceUser(real);
    assert.deepEqual(user, {
        employeeNo: '1', name: 'Ana', userType: 'normal', fingerprints: null, cards: null, enabled: true, menuAccess: true,
    });
    assert.equal('password' in user, false, 'la clave de puerta no sale del servidor');
});

test('Empleados: si un firmware sí informa huellas y tarjetas, se usan', () => {
    const user = normalizeDeviceUser({ employeeNo: '25', name: 'Luis', numOfFP: 2, numOfCard: 0, Valid: { enable: false }, localUIRight: false });
    assert.equal(user.fingerprints, 2);
    assert.equal(user.cards, 0);
    assert.equal(user.enabled, false);
    assert.equal(user.menuAccess, false);
    assert.deepEqual(normalizeDeviceUser({ employeeNo: '7' }), {
        employeeNo: '7', name: '', userType: null, fingerprints: null, cards: null, enabled: null, menuAccess: null,
    });
});

test('Búsquedas: el identificador es corto, porque el terminal rechaza los largos', () => {
    const id = searchIdOf('ev', new Date('2026-11-17T16:41:00Z'));
    assert.match(id, /^bj-ev-[0-9a-z]+$/);
    assert.ok(id.length <= 16, `«${id}» tiene ${id.length} caracteres`);
});

test('Errores del terminal: se lee su motivo, venga en JSON o en XML', () => {
    // La respuesta real a un searchID de 31 caracteres.
    assert.equal(deviceErrorDetail('{ "statusCode": 6, "statusString": "Invalid Content", "subStatusCode": "badParameters", "errorCode": 1610612737, "errorMsg": "0x60000001" }'), 'badParameters');
    assert.equal(deviceErrorDetail('<ResponseStatus><statusString>Invalid Operation</statusString><subStatusCode>notSupport</subStatusCode></ResponseStatus>'), 'notSupport');
    assert.equal(deviceErrorDetail(''), null);
});

test('Búsquedas: el día se pide en el desfase del terminal y por páginas', () => {
    const body = eventSearchBody({ searchID: 's', position: 60, condition: dayCondition('2026-11-17', '-04:30') });
    assert.equal(body.AcsEventCond.startTime, '2026-11-17T00:00:00-04:30');
    assert.equal(body.AcsEventCond.endTime, '2026-11-17T23:59:59-04:30');
    assert.equal(body.AcsEventCond.searchResultPosition, 60);
    assert.equal(body.AcsEventCond.maxResults, PAGE_SIZE);
    assert.equal(body.AcsEventCond.major, 5);
    assert.deepEqual(userSearchBody('u', 0), { UserInfoSearchCond: { searchID: 'u', searchResultPosition: 0, maxResults: PAGE_SIZE } });
});

test('Búsquedas: también por rango de series, sin horas (lo que usa la escucha)', () => {
    const body = eventSearchBody({ searchID: 's', position: 0, condition: { beginSerialNo: 46992, endSerialNo: 3_000_000_000 } });
    assert.deepEqual(body.AcsEventCond, {
        searchID: 's', searchResultPosition: 0, maxResults: PAGE_SIZE, major: 5, minor: 0, beginSerialNo: 46992, endSerialNo: 3_000_000_000,
    });
});



test('Errores: cada fallo del terminal tiene su código, y lo inesperado no filtra detalles', () => {
    assert.equal(errorResponse(new BiometricError('bad_request', 'x')).status, 400);
    assert.equal(errorResponse(new BiometricError('unauthorized', 'x')).status, 502);
    assert.equal(errorResponse(new BiometricError('device_error', 'x')).status, 502);
    assert.equal(errorResponse(new BiometricError('not_configured', 'x')).status, 503);
    assert.equal(errorResponse(new BiometricError('unreachable', 'x')).status, 504);
    const unexpected = errorResponse(new Error('detalle interno'));
    assert.equal(unexpected.status, 500);
    assert.doesNotMatch(unexpected.message, /detalle interno/);
});

test('Errores: un BiometricError es un Error con su tipo', () => {
    const error = new BiometricError('not_found', 'No hay ningún terminal.');
    assert.ok(error instanceof BiometricError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'BiometricError');
    assert.equal(error.kind, 'not_found');
    assert.equal(error.message, 'No hay ningún terminal.');
    assert.match(error.stack ?? '', /No hay ningún terminal/);
});

// En producción corre dist/, que arma babel.config.json: transform-classes (loose) +
// minify-simplify. Con `class BiometricError extends Error` el compilado usaba `_this`
// antes de asignarlo y CADA `new BiometricError` reventaba (2026-11-18), mientras estas
// pruebas, que corren la fuente, pasaban. Esta compila el archivo como el build y lo usa.
test('Errores: BiometricError también funciona compilado como en producción (Babel de dist/)', async () => {
    const { default: babel } = await import('@babel/core');
    const { writeFileSync, rmSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = fileURLToPath(new URL('../src/apiServises/biometric/biometric.lib.js', import.meta.url));
    const { code } = babel.transformFileSync(source, { cwd: fileURLToPath(new URL('..', import.meta.url)) });
    const compiled = new URL(`./.compilado-biometric-${process.pid}.mjs`, import.meta.url);
    writeFileSync(compiled, code);
    try {
        const built = await import(compiled.href);
        const error = new built.BiometricError('login_required', 'Esta tablet no tiene permiso.');
        assert.ok(error instanceof built.BiometricError && error instanceof Error);
        assert.equal(error.kind, 'login_required');
        assert.equal(built.errorResponse(error).status, 401, 'un error esperado sale con su código, no como 500');
    } finally {
        rmSync(compiled, { force: true });
    }
});



// ══════════════════════════════════════════════════════════════════════
// VÍNCULO ENTRE EL TERMINAL Y LOS USUARIOS DE LA API
// ══════════════════════════════════════════════════════════════════════
// Lo que se prueba es que una sugerencia solo aparezca cuando no hay duda: el
// administrador confirma cada vínculo, pero una sugerencia equivocada invita a
// confirmar mal. Los nombres y cédulas de aquí son inventados.

test('Nombres: se comparan sin tildes, sin mayúsculas y sin partículas', () => {
    assert.equal(normalizeName('  Bárbara   DULCEY '), 'barbara dulcey');
    assert.equal(normalizeName('Peña'), 'pena');
    assert.deepEqual(nameTokens('María de la Cruz'), ['maria', 'cruz']);
});

test('Nombres: una letra de diferencia vale solo en palabras largas', () => {
    assert.equal(tokensMatch('darlenys', 'darlenis'), true);
    assert.equal(tokensMatch('melchor', 'melchor'), true);
    assert.equal(tokensMatch('ana', 'ama'), false, 'en palabras cortas una letra cambia de persona');
    assert.equal(tokensMatch('guzman', 'gutierrez'), false);
});

test('Nombres: el del terminal (corto) tiene que estar entero dentro del de la API (largo)', () => {
    assert.deepEqual(nameMatch('Daniel Flores', 'Daniel Alejandro Flores Rojas'), { matched: 2, total: 2 });
    assert.deepEqual(nameMatch('Carlos Candanoza', 'Carlos Pérez'), { matched: 1, total: 2 });
    assert.deepEqual(nameMatch('Ana Ana', 'Ana Rojas'), { matched: 1, total: 2 }, 'cada palabra del usuario se usa una vez');
});

test('Cédula: el número del terminal coincide con la CI aunque se escriba distinto', () => {
    assert.equal(sameIdNumber('12345678', 'V-12.345.678'), true);
    assert.equal(sameIdNumber('25', '25'), false, 'un número corto de empleado no es una cédula');
    assert.equal(sameIdNumber('12345678', null), false);
});

test('Número de empleado: de 1 a 32 caracteres, sin barras ni espacios en los bordes', () => {
    assert.equal(isValidEmployeeNo('25'), true);
    assert.equal(isValidEmployeeNo('x'.repeat(32)), true);
    assert.equal(isValidEmployeeNo('x'.repeat(33)), false);
    assert.equal(isValidEmployeeNo(''), false);
    assert.equal(isValidEmployeeNo(' 25'), false);
    assert.equal(isValidEmployeeNo('2/5'), false);
    assert.equal(isValidEmployeeNo(25), false);
});

const terminal = (employeeNo, name) => ({ employeeNo, name, userType: 'normal', fingerprints: null, cards: null, enabled: true, menuAccess: false });
const usuario = (_id, name, surName, extra = {}) => ({ _id, name, surName, dni: null, inabilited: false, ...extra });

test('Sugerencias: por cédula primero; por nombre solo con un candidato único', () => {
    const free = [usuario('u1', 'Rosa', 'Medina Paz'), usuario('u2', 'Luis', 'Rivas', { dni: 'V-12.345.678' })].map(compactUser);
    assert.deepEqual(suggestionFor(terminal('12345678', 'Otro Nombre'), free), { userId: 'u2', reason: 'cedula' });
    assert.deepEqual(suggestionFor(terminal('7', 'Rosa Medina'), free), { userId: 'u1', reason: 'nombre' });
    assert.equal(suggestionFor(terminal('8', 'Rosa'), free), null, 'una sola palabra no alcanza');

    const twins = [usuario('a', 'Carlos', 'Rivas'), usuario('b', 'Carlos', 'Rivas Mora')].map(compactUser);
    assert.equal(suggestionFor(terminal('9', 'Carlos Rivas'), twins), null, 'dos candidatos: no se adivina');
});

test('Reporte: vinculados, sugerencias, usuarios deshabilitados y vínculos huérfanos', () => {
    const device = [terminal('1', 'Richard Gonzalez'), terminal('25', 'Daniel Flores'), terminal('105', 'Darlenys Matute'), terminal('104', 'Carlos Candanoza')];
    const api = [
        usuario('u1', 'Richard Alexander', 'González Pérez'),
        usuario('u2', 'Daniel', 'Flores', { biometric: { employeeNo: '25' } }),
        usuario('u3', 'Darlenis', 'Matute'),
        usuario('u4', 'Carlos', 'Candanoza', { inabilited: true }),
        usuario('u5', 'Ana', 'Rojas', { biometric: { employeeNo: '999' } }),
    ];
    const report = buildLinkReport(device, api);
    const row = (n) => report.employees.find((e) => e.employeeNo === n);

    assert.equal(row('1').suggestion.user.id, 'u1');
    assert.equal(row('1').suggestion.reason, 'nombre');
    assert.equal(row('25').linkedUser.id, 'u2');
    assert.equal(row('25').suggestion, null, 'quien ya está vinculado no recibe sugerencia');
    assert.equal(row('105').suggestion.user.id, 'u3', 'Darlenys/Darlenis: una letra de diferencia');
    assert.equal(row('104').suggestion, null, 'a un usuario deshabilitado no se le sugiere');
    assert.deepEqual(report.orphanLinks.map((u) => u.id), ['u5'], 'vinculado a un número que el terminal ya no tiene');
    assert.deepEqual(report.summary, { total: 4, linked: 1, suggested: 2, orphanLinks: 1 });
    assert.equal(report.users.length, 5, 'todos los usuarios, para elegir a mano');
});

test('Reporte: un mismo usuario sugerido para dos personas del terminal no se sugiere a ninguna', () => {
    const report = buildLinkReport(
        [terminal('22', 'Maria Lopez'), terminal('23', 'María López')],
        [usuario('u1', 'María', 'López')],
    );
    assert.equal(report.employees[0].suggestion, null);
    assert.equal(report.employees[1].suggestion, null);
});

test('Modelo: el vínculo es único, pero solo entre usuarios vinculados (índice parcial)', () => {
    const index = UserModel.schema.indexes().find(([fields]) => 'biometric.employeeNo' in fields);
    assert.ok(index, 'existe el índice sobre biometric.employeeNo');
    assert.equal(index[1].unique, true);
    assert.deepEqual(index[1].partialFilterExpression, { 'biometric.employeeNo': { $type: 'string' } });
    assert.ok(UserModel.schema.path('biometric.employeeNo'), 'el campo está declarado (si no, Mongoose lo descartaría)');
});
