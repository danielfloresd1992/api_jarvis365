import UserModel from '../../user/user.model.js';
import AttendanceModel from '../attendanceUser.model.js';
import { notify } from '../../notification/notification.service.js';
import { etiquetaRol, claveDia, fechaCorta } from '../../user/scheduleLabels.lib.js';
import { dayRuleOf, resolveShift } from './workday.lib.js';
import { withAuditUsers } from './attendanceRecord.service.js';

// Roles del día: guardia (onDuty) y auxiliar (auxiliary). Son independientes
// entre sí, y cada uno lo tiene UNA sola persona por departamento, fecha y turno.

// Departamentos donde existen los roles del día.
export const DAY_ROLE_DEPARTMENTS = ['Operaciones', 'Reportes', 'Sistemas y desarrollo'];


// Turno de un empleado en una fecha. Aquí el override cuenta aunque no traiga workType.
const shiftOn = (workSchedule, record, dayNumber) =>
    resolveShift(record?.scheduleOverride, dayRuleOf(workSchedule?.scheduleByDay, dayNumber), workSchedule);


// Busca a otra persona del mismo departamento y turno que ya tenga el rol ese día.
// Devuelve { holderName, shift } o null si el rol está libre.
export async function findDayRoleHolder({ field, userDoc, date, department }) {
    const dayNumber = date.getUTCDay();

    const targetRecord = await AttendanceModel.findOne({ userId: userDoc._id, date })
        .select('scheduleOverride')
        .lean();
    const targetShift = shiftOn(userDoc.workSchedule, targetRecord, dayNumber);

    const deptUsers = await UserModel.find({ 'jobInformation.department': department })
        .select('_id name surName workSchedule');
    const deptUserIds = deptUsers.map(u => u._id);

    const candidates = await AttendanceModel.find({
        date,
        [field]: true,
        userId: { $in: deptUserIds, $ne: userDoc._id }
    }).select('userId scheduleOverride').lean();

    const deptUsersById = new Map(deptUsers.map(u => [String(u._id), u]));
    const conflict = candidates.find(rec => {
        const holder = deptUsersById.get(String(rec.userId));
        return holder && shiftOn(holder.workSchedule, rec, dayNumber) === targetShift;
    });
    if (!conflict) return null;

    const holder = deptUsersById.get(String(conflict.userId));
    const holderName = holder?.name ? `${holder.name} ${holder.surName || ''}`.trim() : 'otro usuario';

    return { holderName, shift: targetShift };
}


// Guarda el rol (crea el documento del día si no existe) y deja el cambio en editedBy.
// Devuelve el registro actualizado y el valor que tenía antes.
export async function saveDayRole({ field, value, userDoc, date, authorId }) {
    const previousRecord = await AttendanceModel.findOne({ userId: userDoc._id, date })
        .select(field)
        .lean();
    const previousValue = Boolean(previousRecord?.[field]);

    const updateOp = {
        $set: { [field]: value },
        $setOnInsert: { createdBy: authorId }
    };
    if (previousRecord && previousValue !== value) {
        updateOp.$push = {
            editedBy: { user: authorId, change: [{ field, from: previousValue, to: value }], date: new Date() }
        };
    }

    const record = await withAuditUsers(AttendanceModel.findOneAndUpdate(
        { userId: userDoc._id, date },
        updateOp,
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ));

    return { record, previousValue };
}


// Avisa al empleado que le asignaron o quitaron el rol. No se espera: el cambio ya está guardado.
export function notifyDayRoleChange({ field, value, record, userDoc, actor }) {
    const cambio = {
        dayKey: claveDia(record.date),
        fecha: fechaCorta(record.date),
        rol: field,
        etiqueta: etiquetaRol(field),
        etiquetaEn: etiquetaRol(field, 'en'),
        asignado: value,
    };

    notify({
        type: 'schedule.dayRole',
        actor,
        target: {
            user: userDoc._id,
            name: userDoc.name || '',
            surName: userDoc.surName || '',
            img: userDoc.img || null,
        },
        resource: {
            kind: 'schedule',
            id: userDoc._id,
            name: `${userDoc.name || ''} ${userDoc.surName || ''}`.trim(),
            path: `/user?userId=${userDoc._id}&date=${cambio.dayKey}`,
            img: userDoc.img || null,
        },
        extra: { targetUserId: String(userDoc._id), cambio },
        meta: { cambios: [cambio] },
    });
}
