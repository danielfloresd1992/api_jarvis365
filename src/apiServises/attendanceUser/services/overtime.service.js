import AttendanceModel from '../attendanceUser.model.js';
import { withAuditUsers } from './attendanceRecord.service.js';
import { dayRuleOf, resolveShift } from './workday.lib.js';
import { overtimeOfDay } from './overtime.lib.js';

// Decisión de un administrador sobre las horas extras de un día.


// Lee el registro del día y calcula cuántos minutos de horas extras generó.
// Devuelve { previousRecord: null } si no hay registro. El turno cuenta el
// override del día aunque no traiga workType.
export async function loadOvertimeContext(userDoc, date) {
    const previousRecord = await AttendanceModel.findOne({ userId: userDoc._id, date }).lean();
    if (!previousRecord) return { previousRecord: null };

    const dayRule = dayRuleOf(userDoc.workSchedule?.scheduleByDay, date.getUTCDay());
    const shift = resolveShift(previousRecord.scheduleOverride, dayRule, userDoc.workSchedule);
    const { minutes } = overtimeOfDay(previousRecord, shift);

    return { previousRecord, minutes };
}


// Aprueba o rechaza las horas extras y deja el cambio en editedBy.
// Al rechazar se limpia approvedMinutes: un día rechazado no aprueba nada.
export function saveOvertimeDecision({ userDoc, date, previousRecord, status, note, minutesToApprove, authorId }) {
    const approvedMinutes = status === 'approved' ? minutesToApprove : null;

    return withAuditUsers(AttendanceModel.findOneAndUpdate(
        { userId: userDoc._id, date },
        {
            $set: {
                'overtime.status': status,
                'overtime.decidedBy': authorId,
                'overtime.decidedAt': new Date(),
                'overtime.auto': false,
                'overtime.note': typeof note === 'string' ? note.trim() : '',
                'overtime.approvedMinutes': approvedMinutes
            },
            $push: {
                editedBy: {
                    user: authorId,
                    change: [
                        { field: 'overtime.status', from: previousRecord.overtime?.status ?? null, to: status },
                        { field: 'overtime.approvedMinutes', from: previousRecord.overtime?.approvedMinutes ?? null, to: approvedMinutes }
                    ],
                    date: new Date()
                }
            }
        },
        { new: true }
    )).populate('overtime.decidedBy', 'name surName img');
}
