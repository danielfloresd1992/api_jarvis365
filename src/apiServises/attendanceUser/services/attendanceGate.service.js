import AttendanceModel from '../attendanceUser.model.js';
import { getZonedDateParts, toUtcMidnightFromZonedParts, addUtcDays } from './attendanceTime.lib.js';
import { dayRuleOf, resolveShift, weeklyRuleCount, DAY_OFF_WORK_TYPES } from './workday.lib.js';

// "¿El empleado ya marcó hoy?" Jarvis-express lo consulta antes del login: con
// authenticated=false bloquea el acceso hasta que registre su jornada.


// Decide si el empleado puede entrar. Devuelve { authenticated, reason, ...detalle }.
export async function checkAttendanceGate(user, now = new Date()) {
    const today = toUtcMidnightFromZonedParts(getZonedDateParts(now));
    const record = await AttendanceModel.findOne({ userId: user._id, date: today });

    // 1. Marcó su entrada hoy (cubre también el franco trabajado).
    if (record?.checkIn) {
        return { authenticated: true, reason: 'Registró su entrada hoy', checkIn: record.checkIn };
    }

    // 2. Sin departamento o sin horario semanal no está bajo control de asistencia.
    const scheduleByDay = user.workSchedule?.scheduleByDay;
    const underAttendanceControl =
        Boolean(user.jobInformation && user.jobInformation.department) && weeklyRuleCount(scheduleByDay) > 0;

    if (!underAttendanceControl) {
        return { authenticated: true, reason: 'No sujeto a control de asistencia (sin jobInformation/workSchedule configurados)' };
    }

    // 3. Nocturno que entró ayer y todavía no marcó la salida.
    const yesterday = addUtcDays(today, -1);
    const yesterdayRecord = await AttendanceModel.findOne({ userId: user._id, date: yesterday });
    if (yesterdayRecord?.checkIn && !yesterdayRecord?.checkOut) {
        const yesterdayRule = dayRuleOf(scheduleByDay, yesterday.getUTCDay());
        if (resolveShift(yesterdayRecord.scheduleOverride, yesterdayRule, user.workSchedule) === 'Nocturno') {
            return { authenticated: true, reason: 'Turno nocturno de ayer aún abierto', checkIn: yesterdayRecord.checkIn };
        }
    }

    // 4. Hoy no le toca venir.
    const workType = record?.scheduleOverride?.workType
        || dayRuleOf(scheduleByDay, today.getUTCDay())?.workType
        || 'laboral';

    if (DAY_OFF_WORK_TYPES.includes(workType)) {
        return { authenticated: false, reason: 'día libre', workType };
    }

    // 5. Le toca trabajar y no ha marcado.
    return { authenticated: false, reason: 'No ha registrado su llegada laboral' };
}
