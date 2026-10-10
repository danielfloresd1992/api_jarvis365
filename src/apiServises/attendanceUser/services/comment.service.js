import AttendanceModel from '../attendanceUser.model.js';
import { notify } from '../../notification/notification.service.js';
import { withAuditUsers } from './attendanceRecord.service.js';

// Comentarios de usuarios super sobre el día de un empleado.

// Largo máximo del comentario que se copia en la notificación (el texto entero
// queda en el documento de asistencia).
const COMMENT_PREVIEW_MAX = 400;


// Agrega el comentario al registro del día. Si el documento no existe se crea,
// con quien comenta como autor.
export function addAttendanceComment({ targetUserId, date, authorId, message }) {
    return withAuditUsers(AttendanceModel.findOneAndUpdate(
        { userId: targetUserId, date },
        {
            $push: { comments: { user: authorId, message, date: new Date() } },
            $setOnInsert: { createdBy: authorId }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ));
}


// Avisa al equipo del comentario. No se espera: el comentario ya está guardado.
export function notifyAttendanceComment({ actor, userDoc, record, date, message }) {
    const dayKey = date.toISOString().slice(0, 10);

    notify({
        type: 'attendance.commented',
        actor,
        target: {
            user: userDoc._id,
            name: userDoc.name || '',
            surName: userDoc.surName || '',
            img: userDoc.img || null,
        },
        resource: {
            kind: 'schedule',
            id: record._id,
            name: `${userDoc.name || ''} ${userDoc.surName || ''}`.trim(),
            // detail=1 hace que el horario abra la ficha de la celda, donde está el comentario.
            path: `/user?userId=${userDoc._id}&date=${dayKey}&detail=1`,
            img: userDoc.img || null,
        },
        // El comentario va en meta para que la campana lo muestre como cita aparte.
        meta: {
            message: message.length > COMMENT_PREVIEW_MAX
                ? `${message.slice(0, COMMENT_PREVIEW_MAX)}…`
                : message,
            dayKey,
            dayLabel: date.toLocaleDateString('es-VE', { timeZone: 'UTC' }),
            attendanceId: String(record._id),
        },
    });
}
