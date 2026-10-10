import { ObjectId } from 'mongodb';
import { io } from '../../../services/socket/io.js';
import UserModel from '../../user/user.model.js';
import AttendanceModel from '../attendanceUser.model.js';

// Consultas y avisos que comparten varios endpoints sobre el empleado y su registro del día.


// ¿Se busca al empleado por id? Solo si llega un userId con forma de ObjectId.
export const isLookupById = (userId) => Boolean(userId && ObjectId.isValid(userId));


// Busca un empleado por su _id.
export const findUserById = (id) => UserModel.findById(id);


// Busca un empleado por su dni.
export const findUserByDni = (dni) => UserModel.findOne({ dni });


// Busca al empleado por userId (si es un ObjectId válido) o, si no, por dni.
export async function findTargetUser({ userId, dni }) {
    if (isLookupById(userId)) return findUserById(userId);
    if (dni) return findUserByDni(dni);
    return null;
}


// Registro de un día para mostrarlo en la ficha, con quién creó, editó, comentó
// y decidió las horas extras. La fecha va como texto ISO y los populate en este
// orden a propósito: así lo pedía el endpoint original (no es withAuditUsers).
export const findDayRecordForView = (userId, date) =>
    AttendanceModel.findOne({ userId, date: date.toISOString() })
        .populate('createdBy', 'name surName img')
        .populate('editedBy.user', 'name surName img')
        .populate('comments.user', 'name surName img')
        .populate('overtime.decidedBy', 'name surName img');


// Agrega a la consulta los datos de quién comentó, creó y editó el registro.
export const withAuditUsers = (query) => query
    .populate('comments.user', 'name surName img')
    .populate('createdBy', 'name surName img')
    .populate('editedBy.user', 'name surName img');


// Refresca la celda del empleado en la grilla. El canal es `${fecha}-${correo}`,
// con la fecha corrida +4 h (la medianoche de Caracas expresada en UTC): el
// nombre que ya escucha el front. También lo usa user/scheduleWrite.lib.js.
export function emitRecordRefresh(record, user) {
    const dateEvent = new Date(record.date);
    dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
    io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord: record, user });
}
