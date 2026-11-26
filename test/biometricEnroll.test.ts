import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isNewEmployeeNo, nextEmployeeNo, deviceNameOf, suggestedDeviceName, userRecordBody, userSearchByNoBody,
    captureFingerprintXml, parseCapturedFingerprint, fingerprintSetUpBody, fingerprintSearchBody, fingerprintPage,
    freeFingerSlot, fingerprintSaveResult, captureFailureMessage, fingerprintDeleteBody, MAX_DEVICE_NAME_LENGTH,
} from '../src/apiServises/biometric/biometricEnroll.lib.js';

// ══════════════════════════════════════════════════════════════════════
// ALTA EN EL TERMINAL Y REGISTRO DE HUELLAS
// ══════════════════════════════════════════════════════════════════════
// Las respuestas son las que dio el terminal del local (DS-K1A8503MF) el
// 2026-11-17 al consultarlo; lo que se le manda copia lo que tienen las personas
// creadas desde su propio menú.

// Las personas que tenía el terminal ese día.
const DEVICE_NUMBERS = ['1', '104', '105', '22', '23', '24', '25'];



test('Número: el siguiente libre es uno más que el mayor del terminal', () => {
    assert.equal(nextEmployeeNo(DEVICE_NUMBERS), '106');
    assert.equal(nextEmployeeNo([]), '1', 'terminal vacío');
    assert.equal(nextEmployeeNo(['A7', '9']), '10', 'los que no son números no cuentan');
});

test('Número: de 1 a 8 dígitos, sin ceros a la izquierda', () => {
    for (const ok of ['1', '106', '27427268']) assert.equal(isNewEmployeeNo(ok), true, ok);
    for (const bad of ['', '0', '012', '123456789', '12a', ' 106', 106 as unknown as string]) assert.equal(isNewEmployeeNo(bad), false, String(bad));
});

test('Nombre: sin tildes, como los que se escriben en su teclado, y corto', () => {
    assert.equal(deviceNameOf('  Bárbara   Dulcey '), 'Barbara Dulcey');
    assert.equal(deviceNameOf('José Peña'), 'Jose Pena');
    assert.equal(deviceNameOf('a\u0007b'), 'ab', 'sin caracteres de control');
    assert.equal(deviceNameOf('x'.repeat(50)).length, MAX_DEVICE_NAME_LENGTH);
    assert.equal(deviceNameOf(null), '');
});

test('Nombre: se propone primer nombre y primer apellido, con sus partículas', () => {
    assert.equal(suggestedDeviceName({ name: 'Daniel Alejandro', surName: 'Flores Rivas' }), 'Daniel Flores');
    assert.equal(suggestedDeviceName({ name: 'María José', surName: 'de la Cruz Pérez' }), 'Maria de la Cruz');
    assert.equal(suggestedDeviceName({ name: 'Darlenys', surName: '' }), 'Darlenys');
});



test('Alta: igual que las personas creadas desde el menú del terminal', () => {
    // Así está el nº 25 en el terminal: puerta 1 con el plan 1, vigente, sin clave ni menú.
    assert.deepEqual(userRecordBody({ employeeNo: '106', name: 'Paula Guzman' }), {
        UserInfo: {
            employeeNo: '106',
            name: 'Paula Guzman',
            userType: 'normal',
            Valid: { enable: true, beginTime: '2000-01-01T00:00:00', endTime: '2037-12-31T23:59:59', timeType: 'local' },
            doorRight: '1',
            RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
            localUIRight: false,
        },
    });
    assert.deepEqual(userSearchByNoBody('s', '106'), {
        UserInfoSearchCond: { searchID: 's', searchResultPosition: 0, maxResults: 10, EmployeeNoList: [{ employeeNo: '106' }] },
    });
});



test('Huellas: la consulta del terminal da una posición por vuelta hasta "NoFP"', () => {
    // Respuestas reales para el nº 25 (la plantilla se omite aquí).
    assert.deepEqual(fingerprintPage({ FingerPrintInfo: { searchID: 'bj-pg-1', status: 'OK', FingerPrintList: [{ cardReaderNo: 1, fingerPrintID: 5, fingerType: 'normalFP', fingerData: '…' }] } }), { ids: [5], more: true });
    assert.deepEqual(fingerprintPage({ FingerPrintInfo: { searchID: 'bj-pg-1', status: 'NoFP' } }), { ids: [], more: false });
    // Para un número que no existe responde OK genérico, sin FingerPrintInfo.
    assert.deepEqual(fingerprintPage({ statusCode: 1, statusString: 'OK', subStatusCode: 'ok' }), { ids: [], more: false });
});

test('Huellas: se usa la primera posición libre, sin pisar la 6 que usa el terminal', () => {
    assert.equal(freeFingerSlot([]), 1);
    assert.equal(freeFingerSlot([6]), 1, 'como las personas creadas desde su menú');
    assert.equal(freeFingerSlot([1, 2, 6]), 3);
    assert.equal(freeFingerSlot([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), null, 'las 10 ocupadas');
});

test('Huellas: lo que se manda para capturar, buscar y guardar', () => {
    const capture = captureFingerprintXml(3);
    assert.ok(capture.includes('<CaptureFingerPrintCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">'));
    assert.ok(capture.includes('<fingerNo>3</fingerNo>'));
    assert.deepEqual(fingerprintSearchBody('s', '25'), { FingerPrintCond: { searchID: 's', employeeNo: '25', cardReaderNo: 1 } });
    // El borrado de huellas que aceptó el terminal de Oficina 2 (probado con REA, 2026-11-19).
    assert.deepEqual(fingerprintDeleteBody('105', [1, 6]), {
        FingerPrintDelete: { mode: 'byEmployeeNo', EmployeeNoDetail: { employeeNo: '105', enableCardReader: [1], fingerPrintID: [1, 6] } },
    });
    assert.deepEqual(fingerprintSetUpBody({ employeeNo: '106', fingerPrintID: 1, fingerData: 'QUJD' }), {
        FingerPrintCfg: { employeeNo: '106', enableCardReader: [1], fingerPrintID: 1, fingerType: 'normalFP', fingerData: 'QUJD' },
    });
});

test('Captura: se lee la plantilla y su calidad; sin plantilla no hay huella', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<CaptureFingerPrint version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><fingerData>QUJDRA==</fingerData><fingerNo>1</fingerNo><fingerPrintQuality>82</fingerPrintQuality></CaptureFingerPrint>';
    assert.deepEqual(parseCapturedFingerprint(xml), { fingerData: 'QUJDRA==', quality: 82 });
    assert.equal(parseCapturedFingerprint('<CaptureFingerPrint><fingerNo>1</fingerNo></CaptureFingerPrint>'), null);
    assert.equal(parseCapturedFingerprint('<ResponseStatus><subStatusCode>deviceBusy</subStatusCode></ResponseStatus>'), null);
    assert.equal(parseCapturedFingerprint('<CaptureFingerPrint><fingerData>QQ==</fingerData></CaptureFingerPrint>').quality, null, 'sin calidad informada');
});

test('Captura: los motivos del terminal se dicen en palabras', () => {
    assert.match(captureFailureMessage('timeout'), /Nadie puso el dedo a tiempo/);
    assert.match(captureFailureMessage('captureTimeOut'), /Nadie puso el dedo a tiempo/);
    assert.match(captureFailureMessage('deviceBusy'), /está ocupado/, 'lo que responde si se lo enciende sin pausa');
    assert.match(captureFailureMessage('badXmlContent'), /\(badXmlContent\)/);
    assert.match(captureFailureMessage(null), /no pudo capturar la huella\. Vuelve/);
});

test('Guardado: 1 es éxito; los demás códigos del terminal se explican', () => {
    assert.deepEqual(fingerprintSaveResult({ FingerPrintStatus: { StatusList: [{ id: 1, cardReaderRecvStatus: 1, errorMsg: '' }] } }), { ok: true });
    const duplicate = fingerprintSaveResult({ FingerPrintStatus: { StatusList: [{ id: 1, cardReaderRecvStatus: 5, errorMsg: '' }] } });
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.status, 5);
    assert.match(duplicate.message, /ya está registrada en el terminal con otro número/);
    assert.match(duplicate.message, /esta misma cargada antes con otro número/, 'el caso de Daniel Flores en Oficina 2 (2026-11-19): era él mismo, con el nº 4');
    assert.match(fingerprintSaveResult({ FingerPrintStatus: { StatusList: [{ id: 1, cardReaderRecvStatus: 3 }] } }).message, /mala calidad/);
    // Estado 0: así respondió Oficina 2 a una plantilla que no es una huella (REA, 2026-11-19).
    assert.match(fingerprintSaveResult({ FingerPrintStatus: { StatusList: [{ id: 1, cardReaderRecvStatus: 0 }] } }).message, /no aceptó la huella/);
    assert.match(fingerprintSaveResult({ FingerPrintStatus: { StatusList: [{ id: 1, cardReaderRecvStatus: 9, errorMsg: 'x' }] } }).message, /código 9: x/);
    assert.equal(fingerprintSaveResult({}).ok, false, 'sin confirmación no se da por guardada');
});
