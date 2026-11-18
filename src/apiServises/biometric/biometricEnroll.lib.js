import { xmlValue } from './biometric.lib.js';

// ══════════════════════════════════════════════════════════════════════
// ALTA EN EL TERMINAL Y REGISTRO DE HUELLAS — reglas puras
// ══════════════════════════════════════════════════════════════════════
// Dar de alta a un usuario del sistema en el terminal y guardar su huella sin
// tocar el teclado del equipo. Aquí está qué se le manda y cómo se leen sus
// respuestas, sin red ni base, para poder probarlo.
//
// Comprobado contra el DS-K1A8503MF del local (firmware V1.4.0), solo leyendo:
//   - UserInfo admite post/put/delete/setUp; hasta 1000 personas.
//   - Las personas creadas desde su menú tienen puerta 1 con el plan 1, vigencia
//     amplia, sin clave y sin acceso al menú: las nuevas se crean igual.
//   - Huellas: CaptureFingerPrint enciende su lector y devuelve la plantilla
//     (512 bytes, en base64) con su calidad (1 a 100); FingerPrint/SetUp la
//     guarda en una persona, en una posición del 1 al 10.
//   - FingerPrintUpload lista las huellas de una persona, una por consulta con
//     el mismo searchID, hasta responder "NoFP". Las creadas desde su menú están
//     en la posición 6 (una en la 5): las nuevas ocupan la primera libre desde la
//     1, para no pisar ninguna.



// El terminal busca marcajes por nº de empleado de hasta 8 caracteres
// (AcsEvent.employeeNoString): los números nuevos son de 1 a 8 dígitos.
export const MAX_NEW_EMPLOYEE_NO_DIGITS = 8;

// Su pantalla es chica: el nombre se corta aquí.
export const MAX_DEVICE_NAME_LENGTH = 32;

// Posiciones de huella por persona (fingerPrintID).
export const FINGER_SLOTS = 10;

// Lo que el terminal contesta al guardar una huella (cardReaderRecvStatus).
const SAVE_STATUS = {
    0: 'El terminal no pudo comunicarse con su lector de huellas.',
    2: 'El lector de huellas del terminal está desconectado.',
    3: 'La huella salió de mala calidad. Limpia el dedo y el lector y vuelve a intentarlo.',
    4: 'La memoria de huellas del terminal está llena.',
    5: 'Esa huella ya está registrada en el terminal para otra persona.',
    6: 'Esa posición de huella ya está ocupada.',
    7: 'La posición de huella no es válida.',
};

// Partículas de un apellido compuesto: "de la Cruz" se toma entero.
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa']);



// ─── Número y nombre en el terminal ──────────────────────────────────────

// isNewEmployeeNo = «un nº de empleado nuevo aceptable»: de 1 a 8 dígitos, sin ceros a la izquierda
export function isNewEmployeeNo(text) {
    return typeof text === 'string' && new RegExp(`^[1-9]\\d{0,${MAX_NEW_EMPLOYEE_NO_DIGITS - 1}}$`).test(text);
}

// nextEmployeeNo = «el siguiente nº libre»: uno más que el mayor numérico del terminal
export function nextEmployeeNo(existing) {
    const numbers = existing.map(String).filter((n) => /^\d+$/.test(n)).map(Number).filter(Number.isSafeInteger);
    return String((numbers.length ? Math.max(...numbers) : 0) + 1);
}

// deviceNameOf = «un nombre como lo guarda el terminal»: sin tildes (su teclado
// no las tiene y así están todos los demás), con espacios simples y corto.
export function deviceNameOf(text) {
    return String(text ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_DEVICE_NAME_LENGTH)
        .trim();
}

// El primer nombre, o el primer apellido con sus partículas ("de la Cruz Pérez" → "de la Cruz").
const firstWordOf = (text) => {
    const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
    const taken = [];
    for (const word of words) {
        taken.push(word);
        if (!PARTICLES.has(word.toLowerCase())) break;
    }
    return taken.join(' ');
};

// suggestedDeviceName = «el nombre que se propone para el terminal»: primer
// nombre y primer apellido, como los que ya tiene ("Daniel Flores")
export function suggestedDeviceName(user) {
    return deviceNameOf(`${firstWordOf(user?.name)} ${firstWordOf(user?.surName)}`);
}



// ─── Lo que se le manda al terminal ──────────────────────────────────────

// userRecordBody = «el alta de una persona» (POST /ISAPI/AccessControl/UserInfo/Record)
export function userRecordBody({ employeeNo, name }) {
    return {
        UserInfo: {
            employeeNo,
            name,
            userType: 'normal',
            Valid: { enable: true, beginTime: '2000-01-01T00:00:00', endTime: '2037-12-31T23:59:59', timeType: 'local' },
            doorRight: '1',
            RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
            localUIRight: false,
        },
    };
}

// userSearchByNoBody = «buscar a una persona por su número» (UserInfo/Search)
export function userSearchByNoBody(searchID, employeeNo) {
    return { UserInfoSearchCond: { searchID, searchResultPosition: 0, maxResults: 10, EmployeeNoList: [{ employeeNo }] } };
}

// captureFingerprintXml = «encender el lector y esperar un dedo» (POST /ISAPI/AccessControl/CaptureFingerPrint)
export function captureFingerprintXml(fingerNo) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<CaptureFingerPrintCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">',
        `<fingerNo>${fingerNo}</fingerNo>`,
        '</CaptureFingerPrintCond>',
        '',
    ].join('\n');
}

// fingerprintSetUpBody = «guardar una huella en una persona» (PUT /ISAPI/AccessControl/FingerPrint/SetUp)
export function fingerprintSetUpBody({ employeeNo, fingerPrintID, fingerData }) {
    return { FingerPrintCfg: { employeeNo, enableCardReader: [1], fingerPrintID, fingerType: 'normalFP', fingerData } };
}

// fingerprintSearchBody = «la siguiente huella de una persona» (POST /ISAPI/AccessControl/FingerPrintUpload)
export function fingerprintSearchBody(searchID, employeeNo) {
    return { FingerPrintCond: { searchID, employeeNo, cardReaderNo: 1 } };
}



// ─── Cómo se leen sus respuestas ─────────────────────────────────────────

// parseCapturedFingerprint = «la huella capturada», o null si no vino ninguna
export function parseCapturedFingerprint(xml) {
    const fingerData = xmlValue(xml, 'fingerData');
    if (!fingerData) return null;
    const quality = Number(xmlValue(xml, 'fingerPrintQuality'));
    return { fingerData, quality: Number.isFinite(quality) && quality > 0 ? quality : null };
}

// fingerprintPage = «lo que trajo una consulta de huellas»: sus posiciones (nunca
// la plantilla) y si puede haber más
export function fingerprintPage(json) {
    const info = json?.FingerPrintInfo;
    const list = Array.isArray(info?.FingerPrintList) ? info.FingerPrintList : [];
    const ids = list.map((f) => f?.fingerPrintID).filter((id) => Number.isInteger(id));
    return { ids, more: info?.status === 'OK' && ids.length > 0 };
}

// freeFingerSlot = «la primera posición libre», o null si están las 10 ocupadas
export function freeFingerSlot(usedIds) {
    const used = new Set(usedIds);
    for (let id = 1; id <= FINGER_SLOTS; id++) if (!used.has(id)) return id;
    return null;
}

// fingerprintSaveResult = «¿quedó guardada?», con el motivo si no
export function fingerprintSaveResult(json) {
    const item = json?.FingerPrintStatus?.StatusList?.[0];
    if (!item) return { ok: false, message: 'El terminal no confirmó que guardó la huella.' };
    if (item.cardReaderRecvStatus === 1) return { ok: true };
    const known = SAVE_STATUS[item.cardReaderRecvStatus];
    return {
        ok: false,
        status: item.cardReaderRecvStatus,
        message: known ?? `El terminal no guardó la huella (código ${item.cardReaderRecvStatus}${item.errorMsg ? `: ${item.errorMsg}` : ''}).`,
    };
}

// captureFailureMessage = «por qué no se capturó», a partir del motivo que da el terminal
export function captureFailureMessage(detail) {
    if (/time\s*out|timeout|overtime/i.test(String(detail ?? ''))) {
        return 'Nadie puso el dedo a tiempo. Vuelve a intentarlo y pon el dedo apenas aparezca el aviso.';
    }
    if (/busy/i.test(String(detail ?? ''))) {
        return 'El lector del terminal está ocupado. Espera unos segundos y vuelve a intentarlo.';
    }
    return `El terminal no pudo capturar la huella${detail ? ` (${detail})` : ''}. Vuelve a intentarlo.`;
}
