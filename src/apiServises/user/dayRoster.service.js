import moment from 'moment-timezone';
import UserModel from './user.model.js';
import AttendanceModel from './attendance.model.js';

// ══════════════════════════════════════════════════════════════════════
// SERVICIO: Ficha del personal del día (roster de HOY)
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
// "Hoy" es el día CIVIL en la zona de referencia del monitoreo, para que el
// servidor responda lo mismo sin importar el reloj del SO.

const ROSTER_TZ = process.env.MONITORING_TZ || 'America/Caracas';

// Tipos de jornada con los que el empleado NO viene hoy
const NO_WORK_TYPES = ['descanso', 'vacaciones', 'permiso', 'falta'];

export async function buildTodayRoster() {
    const now = moment.tz(ROSTER_TZ);
    // Fecha civil de hoy a medianoche UTC — el formato con el que attendance guarda `date`
    const civilDate = new Date(Date.UTC(now.year(), now.month(), now.date()));
    const dayNumber = now.day();

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
