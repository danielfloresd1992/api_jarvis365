import UserModel from '../../user/user.model.js';
import AttendanceModel from '../attendanceUser.model.js';
import { getOperationalDay } from '../../../services/noveltyReport/noveltyReport.service.js';
import { dayRuleOf, activeOverrideOf, resolveShift, weeklyRuleCount, defaultTimesOf, DAY_OFF_WORK_TYPES } from './workday.lib.js';
// Registra el modelo 'TabuladorPosition' para el populate (hace falta fuera de app.ts).
import '../../tabulador/tabulador.model.js';

// Personal del día OPERATIVO (08:00 → 07:00 del día siguiente, el mismo criterio
// que validateDayRoleUser): jornada efectiva de cada uno, marcajes y roles del día.
// Precedencia de la jornada: override del día > regla semanal > turno del perfil.
// Los roles del día valen hasta las 07:59:59.
//
// Las horas usan `??` a propósito (no `||` como el corte diario): una hora vacía
// cargada en el horario se respeta y no se reemplaza por la estándar.

// Fecha (medianoche UTC) y día de semana del día operativo en curso.
// A las 02:00 el día operativo sigue siendo el de ayer.
function operationalToday() {
    const { start } = getOperationalDay();
    return {
        civilDate: new Date(Date.UTC(start.year(), start.month(), start.date())),
        dayNumber: start.day()
    };
}

// Rol del día de UN usuario (guardia / auxiliar) con su turno y horas de hoy.
export async function getUserDayRole(userId) {
    const { civilDate, dayNumber } = operationalToday();

    const [att, user] = await Promise.all([
        AttendanceModel.findOne({ userId, date: civilDate })
            .select('onDuty auxiliary scheduleOverride')
            .lean(),
        UserModel.findById(userId).select('workSchedule').lean()
    ]);

    const rule = dayRuleOf(user?.workSchedule?.scheduleByDay, dayNumber);
    const override = activeOverrideOf(att);
    const shift = resolveShift(override, rule, user?.workSchedule);
    const defaults = defaultTimesOf(shift);

    return {
        onDuty: Boolean(att?.onDuty),
        auxiliary: Boolean(att?.auxiliary),
        shift,
        startTime: override?.startTime ?? rule?.startTime ?? defaults.startTime,
        endTime: override?.endTime ?? rule?.endTime ?? defaults.endTime
    };
}

// Lista del personal de hoy con su jornada efectiva, marcajes y roles del día.
export async function buildTodayRoster() {
    const { civilDate, dayNumber } = operationalToday();

    const [users, attendances] = await Promise.all([
        // Los outForkSchedule están fuera del horario: no entran en el roster.
        UserModel.find({ inabilited: { $ne: true }, 'workSchedule.outForkSchedule': { $ne: true } })
            .select('name surName img jobInformation workSchedule')
            // Nombre del cargo (también de cargos desactivados).
            .populate('jobInformation.tabuladorPosition', 'name')
            .lean(),
        AttendanceModel.find({ date: civilDate })
            .select('userId scheduleOverride onDuty auxiliary checkIn checkOut isLate')
            .lean(),
    ]);
    const attByUser = new Map(attendances.map(a => [String(a.userId), a]));

    const roster = users.map(u => {
        const att = attByUser.get(String(u._id)) ?? null;
        // scheduleByDay llega como objeto plano (.lean()); las libs toleran también Map.
        const map = u.workSchedule?.scheduleByDay;
        const rule = dayRuleOf(map, dayNumber);
        const override = activeOverrideOf(att);
        const weeklyRules = weeklyRuleCount(map);

        // Queda fuera quien tiene horario semanal pero no este día (hoy no le toca).
        // Sin horario semanal sí entra: trabaja por el turno de su perfil.
        if (!rule?.workType && !att && weeklyRules > 0) return null;

        const workType = override?.workType || rule?.workType || 'laboral';
        const shift = resolveShift(override, rule, u.workSchedule);
        const defaults = defaultTimesOf(shift);
        const worksToday = !DAY_OFF_WORK_TYPES.includes(workType);
        return {
            userId: u._id,
            name: u.name ?? '',
            surName: u.surName ?? '',
            img: u.img ?? null,
            department: u.jobInformation?.department ?? null,
            // Nombre del cargo del tabulador (null sin cargo).
            position: u.jobInformation?.tabuladorPosition?.name ?? null,
            // Grupo de trabajo ("Apoyo matutino", "Verificadores"…), sin espacios de más.
            group: u.jobInformation?.detail?.trim() || null,

            workType,
            shift,
            startTime: override?.startTime ?? rule?.startTime ?? (worksToday ? defaults.startTime : null),
            endTime: override?.endTime ?? rule?.endTime ?? (worksToday ? defaults.endTime : null),
            source: override ? 'override' : (rule?.workType ? 'regla' : 'default'),
            comes: worksToday,

            onDuty: Boolean(att?.onDuty),
            auxiliary: Boolean(att?.auxiliary),
            checkIn: att?.checkIn ?? null,
            checkOut: att?.checkOut ?? null,
            // Retardo guardado al marcar la entrada.
            late: Boolean(att?.isLate),
        };
    }).filter(Boolean);

    return { date: civilDate.toISOString(), dayNumber, roster };
}
