import moment from 'moment-timezone';
import UserModel from './user.model.js';
import AttendanceModel from './attendance.model.js';

// ══════════════════════════════════════════════════════════════════════
// SERVICIO: Corte diario de asistencia (retardos y ausencias)
// ══════════════════════════════════════════════════════════════════════
// Construye la "foto" del día al momento de ejecutarse:
//   1. Toma todos los empleados ACTIVOS dentro de la estructura de horario
//      (inabilited:false y workSchedule.outForkSchedule != true).
//   2. Trae todos los registros de AttendanceModel del día (marcajes).
//   3. Resuelve el horario EFECTIVO de cada empleado con la misma prioridad
//      que usa el endpoint de marcado (user.routes.js → /attendance/machine):
//         scheduleOverride (regla manual del día en Attendance)
//         → user.workSchedule.scheduleByDay[díaSemana] (horario por defecto)
//   4. Clasifica a cada empleado en: presente a tiempo, retardo, ausente,
//      pendiente (su turno aún no inicia), no requerido (descanso/permiso/
//      vacaciones) o sin horario configurado.
//
// La fecha del día se calcula en la zona horaria de Venezuela, igual que el
// marcado (date = medianoche UTC de la fecha civil de Caracas).

const ATTENDANCE_TIMEZONE = 'America/Caracas';
const LATE_GRACE_MINUTES = 8; // misma tolerancia que el endpoint de marcado

// Descuento por retardo: pasada la tolerancia (8 min), el primer tramo (de 8 a
// 20 min) ya cuenta 1 unidad, y de ahí en adelante cada 20 min suma otra.
// Ej. entrada 09:00 (tolerancia hasta 09:08):
//   hasta 09:08 → 0 · 09:09–09:20 → 1 · 09:21–09:40 → 2 · 09:41–10:00 → 3 …
const DISCOUNT_BLOCK_MINUTES = 20;

const computeDiscountUnits = (minutesLate) => {
    if (minutesLate === null || minutesLate <= LATE_GRACE_MINUTES) return 0;
    return Math.ceil(minutesLate / DISCOUNT_BLOCK_MINUTES);
};

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const NOT_REQUIRED_TYPES = ['descanso', 'permiso', 'vacaciones'];


const formatTime12 = (m) => m.format('hh:mm A');

const toMinutes = (hhmm) => {
    if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
    const [h, min] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(min)) return null;
    return (h * 60) + min;
};


// Resuelve la regla efectiva del día para un usuario:
// prioridad scheduleOverride (manual) → scheduleByDay (por defecto en user).
const resolveEffectiveRule = (user, record, dayNumber) => {
    const override = record?.scheduleOverride;
    const hasOverride = Boolean(override?.workType);

    const scheduleByDayMap = user?.workSchedule?.scheduleByDay;
    const dayRule = scheduleByDayMap?.get?.(String(dayNumber))
        || scheduleByDayMap?.[String(dayNumber)]
        || null;

    return {
        source: hasOverride ? 'manual' : (dayRule ? 'por defecto' : 'sin regla'),
        workType: (hasOverride && override.workType) || dayRule?.workType || 'laboral',
        shift: (hasOverride && override.shift)
            || dayRule?.shift
            || user?.workSchedule?.shiftType
            || 'Diurno',
        startTime: (hasOverride && override.startTime) || dayRule?.startTime || null,
        endTime: (hasOverride && override.endTime) || dayRule?.endTime || null
    };
};


/**
 * Construye los datos del corte de asistencia del día.
 * @param {Date} [referenceDate] - Momento de referencia (default: ahora).
 * @returns {Promise<object>} Datos clasificados + totales.
 */
export async function buildDailyAttendanceReport(referenceDate = new Date(), shiftFocus = null) {
    const now = moment.tz(referenceDate, ATTENDANCE_TIMEZONE);

    // Medianoche UTC de la fecha civil de Caracas (mismo criterio del marcado)
    const todayMidnight = new Date(Date.UTC(now.year(), now.month(), now.date(), 0, 0, 0, 0));
    const dayNumber = todayMidnight.getUTCDay();
    const nowMinutes = (now.hours() * 60) + now.minutes();

    const [users, records] = await Promise.all([
        UserModel.find({ inabilited: false, 'workSchedule.outForkSchedule': { $ne: true } }),
        AttendanceModel.find({ date: todayMidnight })
    ]);

    const recordByUser = new Map(records.map(r => [String(r.userId), r]));

    const presentOnTime = [];
    const lateArrivals = [];
    const absents = [];
    const pending = [];
    const notRequired = [];
    const noSchedule = [];
    const extraDays = [];
    const permissions = [];
    let consideredEmployees = 0;

    for (const user of users) {
        const record = recordByUser.get(String(user._id)) || null;
        const rule = resolveEffectiveRule(user, record, dayNumber);

        // Corte enfocado por turno: si se pide un turno específico (Diurno /
        // Nocturno) se omiten los empleados cuyo turno efectivo de hoy no coincide.
        if (shiftFocus && rule.shift !== shiftFocus) continue;
        consideredEmployees++;

        const startMinutes = toMinutes(rule.startTime);

        const base = {
            userId: String(user._id),
            name: `${user.name || ''} ${user.surName || ''}`.trim(),
            dni: user.dni || '—',
            department: user.jobInformation?.department || '—',
            position: user.jobInformation?.position || '—',
            shift: rule.shift,
            workType: rule.workType,
            scheduleSource: rule.source,
            startTime: rule.startTime,
            endTime: rule.endTime
        };

        // 1) Si marcó entrada hoy, es presente (a tiempo o con retardo),
        //    sin importar la regla del día (cubre franco-trabajado).
        if (record?.checkIn) {
            const checkInMoment = moment.tz(record.checkIn, ATTENDANCE_TIMEZONE);
            const checkInMinutes = (checkInMoment.hours() * 60) + checkInMoment.minutes();
            const minutesLate = (startMinutes !== null)
                ? Math.max(0, checkInMinutes - startMinutes)
                : null;

            const entry = {
                ...base,
                checkIn: formatTime12(checkInMoment),
                minutesLate,
                discountUnits: computeDiscountUnits(minutesLate),
                isJustified: Boolean(record.isJustified),
                lateJustification: record.lateJustification || '',
                isExtraDay: Boolean(record.isExtraDay),
                status: record.status
            };

            // Día extra (franco trabajado): se lista aparte, además de entrar en
            // su grupo por puntualidad, para que quede reflejado en el reporte.
            if (entry.isExtraDay) extraDays.push(entry);

            if (record.isLate) lateArrivals.push(entry);
            else presentOnTime.push(entry);
            continue;
        }

        // 2) Falta pre-registrada por el administrador (override manual)
        if (rule.workType === 'falta') {
            absents.push({ ...base, reason: 'Falta pre-registrada por administración' });
            continue;
        }

        // 3) Día sin asistencia requerida (descanso / permiso / vacaciones).
        //    El tipo puede venir de la regla del día (override o horario base) o
        //    del status del propio registro, que ya admite 'permiso'/'vacaciones'.
        const statusNotRequired = NOT_REQUIRED_TYPES.includes(record?.status) ? record.status : null;
        const notRequiredType = NOT_REQUIRED_TYPES.includes(rule.workType) ? rule.workType : statusNotRequired;

        if (notRequiredType) {
            // Nota del administrador que justifica el permiso, si la registró.
            const notes = record?.scheduleOverride?.note;
            const noteMessage = Array.isArray(notes) && notes.length
                ? (notes[notes.length - 1]?.message || '')
                : '';

            const entry = { ...base, reason: notRequiredType, note: noteMessage };
            notRequired.push(entry);

            // Los permisos se listan aparte para que salgan en el reporte.
            if (notRequiredType === 'permiso') permissions.push(entry);
            continue;
        }

        // 4) Marcado como ausente explícitamente en el registro del día
        if (record?.status === 'ausente') {
            absents.push({ ...base, reason: 'Marcado ausente en el registro del día' });
            continue;
        }

        // 5) Día laboral/extra sin hora de entrada configurada → no evaluable
        if (startMinutes === null) {
            noSchedule.push({ ...base, reason: 'Sin hora de entrada configurada para hoy' });
            continue;
        }

        // 6) Su turno aún no comienza al momento del corte (ej. turno nocturno
        //    en el corte del mediodía) → pendiente, NO se cuenta como ausencia.
        if (nowMinutes <= (startMinutes + LATE_GRACE_MINUTES)) {
            pending.push({ ...base, reason: 'Turno aún no inicia al momento del corte' });
            continue;
        }

        // 7) Debía presentarse, ya pasó su hora de entrada y no marcó → ausente
        absents.push({ ...base, reason: 'No ha marcado entrada' });
    }

    // Orden legible: retardos por minutos desc, ausencias por departamento/nombre
    lateArrivals.sort((a, b) => (b.minutesLate ?? 0) - (a.minutesLate ?? 0));
    const byDeptName = (a, b) => (a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
    absents.sort(byDeptName);
    pending.sort(byDeptName);
    presentOnTime.sort(byDeptName);
    extraDays.sort(byDeptName);
    permissions.sort(byDeptName);

    const dateLabel = `${DAY_NAMES[dayNumber]}, ${now.date()} de ${MONTH_NAMES[now.month()]} de ${now.year()}`;

    return {
        date: todayMidnight,
        dateLabel,
        generatedAtLabel: `${formatTime12(now)} (hora Venezuela)`,
        timezone: ATTENDANCE_TIMEZONE,
        shiftFocus: shiftFocus || null,
        totals: {
            activeEmployees: shiftFocus ? consideredEmployees : users.length,
            expected: presentOnTime.length + lateArrivals.length + absents.length + pending.length,
            presentOnTime: presentOnTime.length,
            late: lateArrivals.length,
            absent: absents.length,
            pending: pending.length,
            notRequired: notRequired.length,
            noSchedule: noSchedule.length,
            extraDays: extraDays.length,
            permissions: permissions.length,
            discountUnits: lateArrivals.reduce((sum, r) => sum + (r.discountUnits || 0), 0)
        },
        lateArrivals,
        absents,
        pending,
        presentOnTime,
        notRequired,
        noSchedule,
        extraDays,
        permissions
    };
}
