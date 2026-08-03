import UserModel from './user.model.js';
import AttendanceModel from './attendance.model.js';
import { getOperationalDay } from '../../services/noveltyReport/noveltyReport.service.js';

// ══════════════════════════════════════════════════════════════════════
// SERVICIO: Ficha del personal del día (roster del día OPERATIVO)
// ══════════════════════════════════════════════════════════════════════
// Resuelve, para CADA usuario habilitado, su jornada EFECTIVA de hoy con la
// misma cadena de prioridad que usa la grilla de /user:
//
//   attendance.scheduleOverride (cambio puntual por fecha)
//     > workSchedule.scheduleByDay[díaSemana] (regla semanal)
//       > shiftType global del usuario (por defecto: laboral diurno)
//
// Además adjunta lo que ya pasó hoy: marcaje de entrada/salida y los roles
// del día (encargado de turno / auxiliar). El front decide cómo agrupar.
//
// "Hoy" es el día OPERATIVO (getOperationalDay: 08:00 → 07:00 del día
// siguiente), el MISMO criterio del middleware validateDayRoleUser. Antes se
// usaba el día civil (frontera a las 00:00) y a medianoche el personal
// nocturno "perdía" el rol en el front a mitad de turno, aunque la API aún
// lo aceptara: los dos lados quedaban en desacuerdo.
//
// REGLA OFICIAL: los roles del día (onDuty / auxiliary) valen hasta las
// 07:59:59 — a las 08:00 en punto arranca el día operativo siguiente y la
// designación anterior deja de aplicar.

// Tipos de jornada con los que el empleado NO viene hoy
const NO_WORK_TYPES = ['descanso', 'vacaciones', 'permiso', 'falta'];

// Horas estándar de cada turno: se usan como respaldo visual cuando la
// jornada efectiva no tiene horas propias configuradas.
const SHIFT_DEFAULT_TIMES = {
    Diurno: { startTime: '08:00', endTime: '18:00' },
    Nocturno: { startTime: '18:00', endTime: '07:00' }
};

// Fecha civil (medianoche UTC) y día de semana del día OPERATIVO en curso —
// el formato con el que attendance guarda `date`. A las 02:00 de la
// madrugada el día operativo sigue siendo el de ayer.
function operationalToday() {
    const { start } = getOperationalDay();
    return {
        civilDate: new Date(Date.UTC(start.year(), start.month(), start.date())),
        dayNumber: start.day()
    };
}

// Rol del día de UN usuario (encargado de turno / auxiliar) con su jornada
// efectiva (turno + horas) para que el front pueda mostrar la ventana del
// rol. Dos lecturas puntuales: su asistencia del día operativo y su horario.
export async function getUserDayRole(userId) {
    const { civilDate, dayNumber } = operationalToday();

    const [att, user] = await Promise.all([
        AttendanceModel.findOne({ userId, date: civilDate })
            .select('onDuty auxiliary scheduleOverride')
            .lean(),
        UserModel.findById(userId).select('workSchedule').lean()
    ]);

    const map = user?.workSchedule?.scheduleByDay;
    const rule = map?.get?.(String(dayNumber)) ?? map?.[String(dayNumber)] ?? null;
    const override = att?.scheduleOverride?.workType ? att.scheduleOverride : null;

    const shift = override?.shift || rule?.shift || user?.workSchedule?.shiftType || 'Diurno';
    const defaults = SHIFT_DEFAULT_TIMES[shift] || SHIFT_DEFAULT_TIMES.Diurno;

    return {
        onDuty: Boolean(att?.onDuty),
        auxiliary: Boolean(att?.auxiliary),
        shift,
        startTime: override?.startTime ?? rule?.startTime ?? defaults.startTime,
        endTime: override?.endTime ?? rule?.endTime ?? defaults.endTime
    };
}

export async function buildTodayRoster() {
    // Día OPERATIVO en curso (08:00 → 07:00): a las 02:00 el roster sigue
    // siendo el de ayer, con el personal nocturno todavía en su jornada.
    const { civilDate, dayNumber } = operationalToday();

    const [users, attendances] = await Promise.all([
        // Los outForkSchedule están FUERA del horario (igual que la grilla de
        // /user, que no los renderiza): no forman parte del roster del día.
        UserModel.find({ inabilited: { $ne: true }, 'workSchedule.outForkSchedule': { $ne: true } })
            .select('name surName img jobInformation workSchedule')
            .lean(),
        AttendanceModel.find({ date: civilDate })
            .select('userId scheduleOverride onDuty auxiliary checkIn checkOut isLate')
            .lean(),
    ]);
    const attByUser = new Map(attendances.map(a => [String(a.userId), a]));

    const roster = users.map(u => {
        const att = attByUser.get(String(u._id)) ?? null;
        // Con .lean() scheduleByDay llega como objeto plano; se tolera Map por si acaso
        const map = u.workSchedule?.scheduleByDay;
        const rule = map?.get?.(String(dayNumber)) ?? map?.[String(dayNumber)] ?? null;
        const override = att?.scheduleOverride?.workType ? att.scheduleOverride : null;

        // Solo está en el horario de HOY quien tiene la regla semanal del día
        // configurada O un documento de asistencia de hoy (override, marcaje o
        // rol del día). Un usuario sin nada configurado NO aparece en el roster.
        if (!rule?.workType && !att) return null;

        const workType = override?.workType || rule?.workType || 'laboral';
        return {
            userId: u._id,
            name: u.name ?? '',
            surName: u.surName ?? '',
            img: u.img ?? null,
            department: u.jobInformation?.department ?? null,
            position: u.jobInformation?.position ?? null,
            // Grupo de trabajo (jobInformation.detail): "Apoyo matutino",
            // "Verificadores", etc. Se recorta porque hay valores con espacios.
            group: u.jobInformation?.detail?.trim() || null,

            workType,
            shift: override?.shift || rule?.shift || u.workSchedule?.shiftType || 'Diurno',
            startTime: override?.startTime ?? rule?.startTime ?? null,
            endTime: override?.endTime ?? rule?.endTime ?? null,
            source: override ? 'override' : (rule?.workType ? 'regla' : 'default'),
            comes: !NO_WORK_TYPES.includes(workType),

            onDuty: Boolean(att?.onDuty),
            auxiliary: Boolean(att?.auxiliary),
            checkIn: att?.checkIn ?? null,
            checkOut: att?.checkOut ?? null,
            // Retardo persistido por el backend al marcar entrada (respeta
            // lateArrivalControl y los overrides del día)
            late: Boolean(att?.isLate),
        };
    }).filter(Boolean);

    return { date: civilDate.toISOString(), dayNumber, roster };
}
