import AttendanceModel from '../attendanceUser.model.js';
import { getZonedDateParts, minutesOfDay } from '../services/attendanceTime.lib.js';
import { dayRuleOf } from '../services/workday.lib.js';

// Reporte de asistencia de UN empleado en un rango de fechas.


// "HH:mm" → minutos. Una hora mal escrita da NaN y ese día no suma.
const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h * 60) + m;
};


// Recorre el rango día por día y cuenta asistencia, retardos y minutos.
// Los días futuros sin marcaje no cuentan como ausencia.
export function summarizeAttendance(user, records, fromDate, toDate, now = new Date()) {
    const recordByDay = new Map();
    records.forEach(r => recordByDay.set(r.date.toISOString(), r));

    const scheduleByDay = user.workSchedule?.scheduleByDay;

    let totalWorkingDays = 0, presentDays = 0, absentDays = 0;
    let lateDays = 0, justifiedLateDays = 0, lateMinutes = 0, extraMinutes = 0;
    let expectedMinutes = 0;

    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);

    for (const day = new Date(fromDate); day <= toDate; day.setUTCDate(day.getUTCDate() + 1)) {
        const record = recordByDay.get(day.toISOString());
        const override = record?.scheduleOverride;
        const dayRule = dayRuleOf(scheduleByDay, day.getUTCDay());

        const workType = override?.workType || dayRule?.workType || 'laboral';
        if (workType === 'descanso') continue;

        totalWorkingDays++;

        const startTime = override?.startTime || dayRule?.startTime;
        const endTime = override?.endTime || dayRule?.endTime;
        const scheduledMinutes = (startTime && endTime) ? toMinutes(endTime) - toMinutes(startTime) : null;

        if (scheduledMinutes > 0) expectedMinutes += scheduledMinutes;

        if (!record?.checkIn) {
            if (day <= today) absentDays++;
            continue;
        }

        presentDays++;

        if (record.isLate) {
            lateDays++;
            if (record.isJustified) justifiedLateDays++;
            if (startTime) {
                const checkInMinutes = minutesOfDay(getZonedDateParts(record.checkIn));
                lateMinutes += Math.max(0, checkInMinutes - toMinutes(startTime));
            }
        }

        // Minutos trabajados de más respecto a lo pautado (endTime − startTime).
        // NO son las horas extras de overtime.lib: esas usan la jornada base del
        // turno y 15 min de gracia, y son las que muestra el reporte global.
        if (record.checkOut && startTime && endTime) {
            const workedMinutes = Math.floor((record.checkOut - record.checkIn) / 60000);
            if (scheduledMinutes > 0 && workedMinutes > scheduledMinutes) extraMinutes += workedMinutes - scheduledMinutes;
        }
    }

    return {
        totalWorkingDays,
        presentDays,
        absentDays,
        lateDays,
        justifiedLateDays,
        lateMinutes,
        extraMinutes,
        expectedMinutes,
        attendanceRate: totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 1000) / 10 : 0
    };
}


// Datos del empleado que viajan en el reporte (el horario semanal como objeto plano).
const userView = (user) => {
    const scheduleByDay = user.workSchedule?.scheduleByDay;
    const scheduleByDayObj = scheduleByDay
        ? Object.fromEntries(scheduleByDay instanceof Map ? scheduleByDay : Object.entries(scheduleByDay))
        : {};

    return {
        _id: user._id,
        name: user.name,
        surName: user.surName,
        dni: user.dni,
        email: user.email,
        jobInformation: user.jobInformation,
        workSchedule: {
            shiftType: user.workSchedule?.shiftType,
            scheduleByDay: scheduleByDayObj
        },
        img: user.img
    };
};


// Genera el reporte del empleado: { user, records, summary }.
export async function buildUserReport(user, fromDate, toDate) {
    const records = await AttendanceModel.find({
        userId: user._id,
        date: { $gte: fromDate, $lte: toDate }
    }).sort({ date: 1 })
        // Quién hizo cada cambio de horario y quién decidió las horas extras.
        .populate('scheduleOverride.note.user', 'name surName')
        .populate('overtime.decidedBy', 'name surName img');

    return { user: userView(user), records, summary: summarizeAttendance(user, records, fromDate, toDate) };
}
