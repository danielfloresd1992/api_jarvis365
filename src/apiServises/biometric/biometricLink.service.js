import mongoose from 'mongoose';
import UserModel from '../user/user.model.js';
import { listDeviceUsers } from './biometric.service.js';
import { BiometricError } from './biometric.lib.js';
import { buildLinkReport, compactUser, fullNameOf, isValidEmployeeNo } from './biometricLink.lib.js';
import { nextEmployeeNo } from './biometricEnroll.lib.js';

// ══════════════════════════════════════════════════════════════════════
// VÍNCULO TERMINAL ↔ USUARIOS — lo que toca la base y el terminal
// ══════════════════════════════════════════════════════════════════════
// Las reglas están en biometricLink.lib.js. Aquí solo se leen los dos lados y
// se escribe user.biometric. El índice único parcial del modelo es la última
// barrera: si dos administradores vinculan a la vez, el segundo recibe 409.

const USER_FIELDS = 'name surName dni inabilited biometric';



// getLinkReport = «el estado del vínculo» en el terminal `device` (sus personas +
// los usuarios de la API), con el número que se propone para la próxima alta.
// El número de una persona es el mismo en todos los terminales: el siguiente
// libre mira también los ya vinculados, que pueden estar en otro terminal.
export async function getLinkReport(device) {
    const [onDevice, apiUsers] = await Promise.all([
        listDeviceUsers(device),
        UserModel.find({}, USER_FIELDS).sort({ name: 1, surName: 1 }).lean(),
    ]);
    const linkedNumbers = apiUsers.map((u) => u.biometric?.employeeNo).filter(Boolean);
    return {
        ...buildLinkReport(onDevice.users, apiUsers),
        deviceTruncated: onDevice.truncated,
        nextEmployeeNo: nextEmployeeNo([...onDevice.users.map((u) => u.employeeNo), ...linkedNumbers]),
    };
}



// linkEmployee = «vincular el nº `employeeNo` del terminal `device` con el usuario `userId`»
export async function linkEmployee({ device: terminalDevice, employeeNo, userId, adminId }) {
    if (!isValidEmployeeNo(employeeNo)) throw new BiometricError('bad_request', 'El número de empleado no es válido.');
    if (!mongoose.isValidObjectId(userId)) throw new BiometricError('bad_request', 'Falta el usuario a vincular.');

    const [device, user, holder] = await Promise.all([
        listDeviceUsers(terminalDevice),
        UserModel.findById(userId, USER_FIELDS).lean(),
        UserModel.findOne({ 'biometric.employeeNo': employeeNo }, USER_FIELDS).lean(),
    ]);

    if (!device.users.some((d) => String(d.employeeNo) === employeeNo)) {
        throw new BiometricError('not_found', `El terminal no tiene ningún empleado con el nº ${employeeNo}.`);
    }
    if (!user) throw new BiometricError('not_found', 'El usuario no existe.');
    if (holder && String(holder._id) !== String(user._id)) {
        throw new BiometricError('conflict', `El nº ${employeeNo} ya está vinculado a ${fullNameOf(holder)}. Desvincúlalo primero.`);
    }
    if (user.biometric?.employeeNo && user.biometric.employeeNo !== employeeNo) {
        throw new BiometricError('conflict', `${fullNameOf(user)} ya está vinculado al nº ${user.biometric.employeeNo}. Desvincúlalo primero.`);
    }
    if (holder) return { employeeNo, user: compactUser(holder) };   // ya estaba vinculado así: nada que hacer

    try {
        const updated = await UserModel.findByIdAndUpdate(
            user._id,
            { $set: { biometric: { employeeNo, linkedAt: new Date(), linkedBy: adminId ?? null } } },
            { new: true, projection: USER_FIELDS },
        ).lean();
        return { employeeNo, user: compactUser(updated) };
    } catch (error) {
        if (error?.code === 11000) throw new BiometricError('conflict', `El nº ${employeeNo} acaba de vincularse a otro usuario. Actualiza la lista.`);
        throw error;
    }
}



// unlinkEmployee = «quitar el vínculo del nº `employeeNo`», exista o no aún en el terminal
export async function unlinkEmployee(employeeNo) {
    if (!isValidEmployeeNo(employeeNo)) throw new BiometricError('bad_request', 'El número de empleado no es válido.');
    const user = await UserModel.findOneAndUpdate(
        { 'biometric.employeeNo': employeeNo },
        { $unset: { biometric: 1 } },
        { new: true, projection: USER_FIELDS },
    ).lean();
    if (!user) throw new BiometricError('not_found', `Ningún usuario está vinculado al nº ${employeeNo}.`);
    return { employeeNo, user: compactUser(user) };
}
