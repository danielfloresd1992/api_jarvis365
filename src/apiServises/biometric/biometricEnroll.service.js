import mongoose from 'mongoose';
import UserModel from '../user/user.model.js';
import { BiometricError } from './biometric.lib.js';
import { fullNameOf, isValidEmployeeNo, compactUser } from './biometricLink.lib.js';
import { isNewEmployeeNo, deviceNameOf, freeFingerSlot } from './biometricEnroll.lib.js';
import { findDeviceUser, createDeviceUser, listFingerprints, captureFingerprint, saveFingerprint } from './biometric.service.js';
import { linkEmployee } from './biometricLink.service.js';
import { linkMismatch } from './biometricSync.lib.js';

// ══════════════════════════════════════════════════════════════════════
// ALTA EN EL TERMINAL — lo que toca la base y el terminal
// ══════════════════════════════════════════════════════════════════════
// Desde la pestaña «Registrar» de bioJarvis, un administrador elige a un usuario
// del sistema, lo da de alta en el terminal de ese kiosco y le registra la
// huella encendiendo el lector a distancia.
//
// UN NÚMERO POR PERSONA EN TODOS LOS TERMINALES. El vínculo con el sistema es
// uno solo (user.biometric.employeeNo): quien ya tiene número por estar en otro
// terminal se agrega a este con ESE número, sin vincular de nuevo.
//
// La plantilla de la huella va del terminal a la API y de vuelta al terminal:
// nunca sale hacia el kiosco ni se guarda en la base.

const USER_FIELDS = 'name surName dni inabilited biometric';

// Cada terminal tiene un solo lector: una captura a la vez en cada uno.
const capturing = new Set();



// enrollEmployee = «dar de alta en el terminal `device` a un usuario del sistema»
export async function enrollEmployee({ device, userId, employeeNo, name, adminId }) {
    if (!mongoose.isValidObjectId(userId)) throw new BiometricError('bad_request', 'Falta el usuario a registrar.');
    const deviceName = deviceNameOf(name);
    if (!deviceName) throw new BiometricError('bad_request', 'Falta el nombre que mostrará el terminal.');

    const user = await UserModel.findById(userId, USER_FIELDS).lean();
    if (!user) throw new BiometricError('not_found', 'El usuario no existe.');
    if (user.inabilited === true) throw new BiometricError('bad_request', `${fullNameOf(user)} está deshabilitado en el sistema.`);

    // Ya tiene número (está en otro terminal): se agrega a este con el mismo.
    const ownNumber = user.biometric?.employeeNo;
    if (ownNumber) {
        if (employeeNo !== ownNumber) {
            throw new BiometricError('bad_request', `${fullNameOf(user)} ya tiene el nº ${ownNumber}: en todos los terminales lleva el mismo número.`);
        }
        const here = await findDeviceUser(device, ownNumber);
        if (here) {
            throw new BiometricError('conflict', linkMismatch(here.name, user)
                ? `En este terminal el nº ${ownNumber} lo tiene ${here.name || 'otra persona'}: quítala primero (Client365 → Gestión de terminal → Datos) para agregar a ${fullNameOf(user)}.`
                : `${fullNameOf(user)} ya está en este terminal como nº ${ownNumber}.`);
        }
        await createDeviceUser(device, { employeeNo: ownNumber, name: deviceName });
        return { employeeNo: ownNumber, name: deviceName, user: compactUser(user), warning: null, addedToTerminal: true };
    }

    if (!isNewEmployeeNo(employeeNo)) throw new BiometricError('bad_request', 'El nº de empleado debe tener de 1 a 8 dígitos y no empezar con 0.');
    const [holder, existing] = await Promise.all([
        UserModel.findOne({ 'biometric.employeeNo': employeeNo }, USER_FIELDS).lean(),
        findDeviceUser(device, employeeNo),
    ]);
    if (existing) throw new BiometricError('conflict', `El terminal ya tiene un empleado con el nº ${employeeNo} (${existing.name || 'sin nombre'}).`);
    if (holder) {
        throw new BiometricError('conflict', `El nº ${employeeNo} ya es de ${fullNameOf(holder)} (puede estar en otro terminal). Usa otro número.`);
    }

    await createDeviceUser(device, { employeeNo, name: deviceName });

    // Ya está en el terminal: si el vínculo falla, se informa sin ocultar que se creó.
    try {
        const linked = await linkEmployee({ device, employeeNo, userId, adminId });
        return { employeeNo, name: deviceName, user: linked.user, warning: null, addedToTerminal: false };
    } catch (error) {
        return {
            employeeNo,
            name: deviceName,
            user: null,
            warning: `Se creó el nº ${employeeNo} en el terminal, pero no se pudo vincular: ${error?.message ?? error} Vincúlalo en la pestaña Empleados.`,
            addedToTerminal: false,
        };
    }
}



// getFingerprints = «qué huellas tiene una persona del terminal» (sus posiciones)
export async function getFingerprints(device, employeeNo) {
    if (!isValidEmployeeNo(employeeNo)) throw new BiometricError('bad_request', 'El número de empleado no es válido.');
    return { employeeNo, fingerprints: await listFingerprints(device, employeeNo) };
}



// enrollFingerprint = «encender el lector, esperar el dedo y guardar la huella»
// en la primera posición libre de esa persona, en el terminal `terminal`.
export async function enrollFingerprint(terminal, employeeNo) {
    if (!isValidEmployeeNo(employeeNo)) throw new BiometricError('bad_request', 'El número de empleado no es válido.');
    if (capturing.has(terminal.code)) throw new BiometricError('conflict', 'El lector de ese terminal ya está esperando otra huella. Espera a que termine.');
    capturing.add(terminal.code);
    try {
        const { device } = terminal;
        const person = await findDeviceUser(device, employeeNo);
        if (!person) throw new BiometricError('not_found', `El terminal no tiene ningún empleado con el nº ${employeeNo}.`);

        const fingerPrintID = freeFingerSlot(await listFingerprints(device, employeeNo));
        if (fingerPrintID === null) throw new BiometricError('conflict', `${person.name || `El nº ${employeeNo}`} ya tiene 10 huellas, el máximo del terminal.`);

        const { fingerData, quality } = await captureFingerprint(device, fingerPrintID);
        await saveFingerprint(device, { employeeNo, fingerPrintID, fingerData });

        return { employeeNo, name: person.name, fingerPrintID, quality, fingerprints: await listFingerprints(device, employeeNo) };
    } finally {
        capturing.delete(terminal.code);
    }
}
