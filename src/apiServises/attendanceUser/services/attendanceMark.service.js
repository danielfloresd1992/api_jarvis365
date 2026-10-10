import { notify } from '../../notification/notification.service.js';
import { overtimeOfDay, workedMinutesOf } from './overtime.lib.js';
import { emitRecordRefresh } from './attendanceRecord.service.js';

// Avisos de un marcaje ya guardado: refresca la grilla por socket y le deja al
// empleado una notificación privada con su comprobante. Nunca tumba el marcaje:
// si un aviso falla, solo se registra en el log.


// Fotos de entrada y salida. La última del arreglo es siempre la del marcaje que
// acaba de ocurrir; por eso se decide con `kind` y no con "la primera es la entrada".
const fotosDe = (record, kind) => {
    const imgs = (record?.imageReference || []).filter(Boolean);
    const ultima = imgs.length ? imgs[imgs.length - 1] : null;

    if (kind === 'checkOut') {
        return {
            // Con una sola foto no hay entrada que mostrar: esa es la salida.
            photoIn: imgs.length > 1 ? imgs[0] : null,
            photoOut: ultima,
        };
    }

    return { photoIn: ultima, photoOut: null };
};


// Minutos a texto: 545 → "9h 05m". Vacío si no hay minutos.
const duracionLegible = (minutos) => {
    if (!Number.isFinite(minutos) || minutos <= 0) return '';
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
};


// Publica un marcaje: refresca la grilla y notifica en privado a quien marcó.
// `schedule` es el horario efectivo que resolvió el marcaje: { startTime, endTime, shift, minutesLate }.
export async function publishAttendanceMark({ record, user, kind, schedule = {} } = {}) {
    if (!record || !user) return;

    emitAttendanceToScreens(record, user);

    try {
        const shift = schedule.shift || user.workSchedule?.shiftType || 'Diurno';
        const { photoIn, photoOut } = fotosDe(record, kind);
        // Sin salida da 0: la jornada sigue abierta.
        const trabajados = workedMinutesOf(record);

        // El retardo se lee del documento, igual que el reporte del mes.
        // `minutesLate` no se guarda, por eso llega como parámetro.
        const meta = {
            kind,
            attendanceId: String(record._id),
            date: record.date,
            checkIn: record.checkIn || null,
            checkOut: record.checkOut || null,
            shift,
            startTime: schedule.startTime || null,
            endTime: schedule.endTime || null,
            isLate: Boolean(record.isLate),
            minutesLate: Number(schedule.minutesLate) || 0,
            discountUnits: Number(record.discountUnits) || 0,
            isExtraDay: Boolean(record.isExtraDay),
            status: record.status || '',
            workedMinutes: trabajados,
            workedLabel: duracionLegible(trabajados),
            photoIn,
            photoOut,
        };

        // Horas extras: solo existen con la jornada cerrada.
        if (record.checkOut) {
            const extras = overtimeOfDay(record, shift);
            meta.overtimeMinutes = extras.minutes;
            meta.overtimeStatus = extras.status;
            meta.overtimeApprovedMinutes = extras.approvedMinutes;
        }

        await notify({
            type: kind === 'checkOut' ? 'attendance.checkOut' : 'attendance.checkIn',
            // Firma el propio empleado: es su marcaje, no una acción de otro sobre él.
            actor: {
                user: user._id,
                name: user.name || '',
                surName: user.surName || '',
                img: user.img || null,
            },
            resource: {
                kind: 'attendance',
                id: record._id,
                name: `${user.name || ''} ${user.surName || ''}`.trim(),
                // Sin ruta: la notificación ya trae todo, y el empleado puede no
                // tener permiso sobre las pantallas de gestión.
                path: '',
                img: user.img || null,
            },
            meta,
            // Audiencia: solo quien marcó.
            extra: { targetUserId: String(user._id) },
        });
    }
    catch (error) {
        console.log('[asistencia] no se pudo notificar el marcaje:', error?.message || error);
    }
}


// Refresca la grilla sin dejar que un fallo del socket afecte al marcaje.
function emitAttendanceToScreens(record, user) {
    try {
        emitRecordRefresh(record, user);
    }
    catch (error) {
        console.log('[asistencia] no se pudo emitir el marcaje:', error?.message || error);
    }
}
