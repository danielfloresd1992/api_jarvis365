import moment from 'moment-timezone';
import { esAltaDeHoy } from '../services/newEmployee.lib.js';
import { ATTENDANCE_TIMEZONE } from '../services/attendanceTime.lib.js';
import { LATE_GRACE_MINUTES, computeDiscountUnits } from '../services/lateness.lib.js';
import { dayRuleOf, activeOverrideOf, resolveShift, weeklyRuleCount, defaultTimesOf } from '../services/workday.lib.js';
import UserModel from '../../user/user.model.js';
import AttendanceModel from '../attendanceUser.model.js';
import { SYSTEM_USER_ID } from '../../../libs/systemUser.js';
// Registra el modelo 'TabuladorPosition' para el populate (hace falta fuera de app.ts).
import '../../tabulador/tabulador.model.js';

// Corte diario de asistencia: la "foto" del día al momento de ejecutarse.
// Clasifica a cada empleado activo en: a tiempo, retardo, ausente, pendiente
// (su turno no empezó), no requerido (descanso/permiso/vacaciones) o sin horario.
//
// REGLA: la falta registrada PREVALECE sobre el marcaje. Pasada la hora de corte
// (FAULT_CUT_TIMES), marcar la entrada ya no la quita.

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// Tipos de jornada que no exigen asistencia. Sin 'falta' a propósito (no es
// DAY_OFF_WORK_TYPES): la falta se clasifica antes, como ausencia, y esta lista
// también se compara contra record.status.
const NOT_REQUIRED_TYPES = ['descanso', 'permiso', 'vacaciones'];

// Tipos de jornada en los que SÍ se espera que el empleado venga a trabajar.
const WORKING_TYPES = ['laboral', 'extra'];


// Hora en formato 12 h: "09:05 AM".
const formatTime12 = (m) => m.format('hh:mm A');

// "HH:mm" → minutos desde la medianoche. null si no es una hora válida.
const toMinutes = (hhmm) => {
    if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
    const [h, min] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(min)) return null;
    return (h * 60) + min;
};


// Regla efectiva del día de un empleado: override del día > regla semanal >
// turno del perfil con sus horas estándar.
const resolveEffectiveRule = (user, record, dayNumber) => {
    const override = activeOverrideOf(record);
    const scheduleByDayMap = user?.workSchedule?.scheduleByDay;
    const dayRule = dayRuleOf(scheduleByDayMap, dayNumber);

    const workType = override?.workType || dayRule?.workType || 'laboral';
    const shift = resolveShift(override, dayRule, user?.workSchedule);

    const defaults = defaultTimesOf(shift);
    // Las horas de respaldo solo aplican en días de trabajo.
    const usesDefaultTimes = WORKING_TYPES.includes(workType);

    const startTime = override?.startTime || dayRule?.startTime
        || (usesDefaultTimes ? defaults.startTime : null);
    const endTime = override?.endTime || dayRule?.endTime
        || (usesDefaultTimes ? defaults.endTime : null);

    return {
        source: override ? 'manual' : (dayRule ? 'por defecto' : 'turno del perfil'),
        workType,
        shift,
        startTime,
        endTime,
        // Señales para clasificar sin volver a leer el horario
        hasDayRule: Boolean(dayRule),
        hasWeeklySchedule: weeklyRuleCount(scheduleByDayMap) > 0,
    };
};


// Arma el corte del día: empleados clasificados y totales. shiftFocus filtra por turno.
export async function buildDailyAttendanceReport(referenceDate = new Date(), shiftFocus = null) {
    const now = moment.tz(referenceDate, ATTENDANCE_TIMEZONE);

    // Medianoche UTC de la fecha civil de Caracas (mismo criterio del marcado)
    const todayMidnight = new Date(Date.UTC(now.year(), now.month(), now.date(), 0, 0, 0, 0));
    const dayNumber = todayMidnight.getUTCDay();
    const nowMinutes = (now.hours() * 60) + now.minutes();

    const [users, records] = await Promise.all([
        // Con el nombre del cargo. Sin .lean(): resolveEffectiveRule lee scheduleByDay como Map.
        UserModel.find({ inabilited: false, 'workSchedule.outForkSchedule': { $ne: true } })
            .populate('jobInformation.tabuladorPosition', 'name'),
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

        // Corte enfocado en un turno: se omite a quien no es de ese turno hoy.
        if (shiftFocus && rule.shift !== shiftFocus) continue;
        consideredEmployees++;

        const startMinutes = toMinutes(rule.startTime);

        const base = {
            userId: String(user._id),
            name: `${user.name || ''} ${user.surName || ''}`.trim(),
            dni: user.dni || '—',
            department: user.jobInformation?.department || '—',
            // Nombre del cargo del tabulador ('—' sin cargo).
            position: user.jobInformation?.tabuladorPosition?.name ?? '—',
            shift: rule.shift,
            workType: rule.workType,
            scheduleSource: rule.source,
            startTime: rule.startTime,
            endTime: rule.endTime
        };

        // 0) Dado de alta hoy: su primer día no se le exige (ni retardo ni falta).
        //    Va antes que todo, incluso antes de una falta ya registrada.
        if (esAltaDeHoy(user, referenceDate)) {
            notRequired.push({
                ...base,
                reason: 'alta de hoy',
                note: 'Primer día: no genera falta ni llegada tarde',
            });
            continue;
        }

        // 1) Falta registrada (manual del admin o automática del corte):
        //    PREVALECE incluso si marcó entrada después — pasada la hora del
        //    corte la falta queda firme. Se informa la hora en que marcó.
        if (rule.workType === 'falta') {
            const lateCheckIn = record?.checkIn
                ? formatTime12(moment.tz(record.checkIn, ATTENDANCE_TIMEZONE))
                : null;
            absents.push({
                ...base,
                checkIn: lateCheckIn,
                reason: lateCheckIn
                    ? `Falta registrada (marcó ${lateCheckIn}, después del corte)`
                    : 'Falta pre-registrada por administración'
            });
            continue;
        }

        // 2) Si marcó entrada hoy (y no tiene falta firme), es presente — a
        //    tiempo o con retardo, sin importar la regla del día (cubre
        //    franco-trabajado).
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

        // 5) Tiene horario semanal pero este día no está cargado → hoy no le toca.
        if (!rule.hasDayRule && rule.hasWeeklySchedule && !record?.scheduleOverride?.workType) {
            notRequired.push({ ...base, reason: 'descanso', note: 'Día no configurado en su horario semanal' });
            continue;
        }

        // 6) Sin hora de entrada → no se puede evaluar (casi no ocurre).
        if (startMinutes === null) {
            noSchedule.push({ ...base, reason: 'Sin hora de entrada configurada para hoy' });
            continue;
        }

        // 7) Su turno aún no comienza al momento del corte (ej. turno nocturno
        //    en el corte del mediodía) → pendiente, NO se cuenta como ausencia.
        if (nowMinutes <= (startMinutes + LATE_GRACE_MINUTES)) {
            pending.push({ ...base, reason: 'Turno aún no inicia al momento del corte' });
            continue;
        }

        // 8) Debía venir, pasó su hora y no marcó → ausente. Solo esta rama es
        //    candidata a la falta automática (autoFaultCandidate).
        absents.push({ ...base, reason: 'No ha marcado entrada', autoFaultCandidate: true });
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
            // Sin shiftFocus se consideran todos, así que es users.length.
            activeEmployees: consideredEmployees,
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


// ─── REGISTRO AUTOMÁTICO DE FALTAS ───────────────────────────────────────────
// Las firma el usuario del sistema (SYSTEM_USER_ID, en libs/systemUser.js).

// Nota que queda en el horario del día.
const AUTO_FAULT_NOTE = 'Falta registrada automáticamente: no marcó entrada al corte de asistencia.';

// Comentario visible en la celda de la grilla.
const AUTO_FAULT_COMMENT = 'Falta automática con Jarvis Vision';

// Hora de corte por turno (hora Venezuela): desde ahí la falta queda firme.
// El job arma sus envíos a partir de estas mismas horas.
export const FAULT_CUT_TIMES = {
    Diurno: '15:00',
    Nocturno: '21:00'
};

// Margen por si el temporizador dispara unos segundos antes de la hora exacta.
const FAULT_CUT_TOLERANCE_MINUTES = 2;

// Registra la falta de los ausentes candidatos del corte, con la misma forma que
// "Editar grupo". Devuelve { attempted, registered, registeredNames, skipped, failed }.
export async function registerAbsencesAsFaults(report) {
    const candidates = (report?.absents || []).filter(a => a.autoFaultCandidate);
    const registered = [];
    const skipped = [];
    const failed = [];

    // Solo después de la hora de corte: antes todavía pueden llegar.
    const nowMoment = moment.tz(ATTENDANCE_TIMEZONE);
    const nowMinutes = (nowMoment.hours() * 60) + nowMoment.minutes();

    for (const absent of candidates) {
        try {
            const cutMinutes = toMinutes(FAULT_CUT_TIMES[absent.shift]);
            if (cutMinutes === null || nowMinutes < (cutMinutes - FAULT_CUT_TOLERANCE_MINUTES)) {
                skipped.push({ userId: absent.userId, name: absent.name, reason: `antes del corte de ${FAULT_CUT_TIMES[absent.shift] || 'turno desconocido'}` });
                continue;
            }

            const previousRecord = await AttendanceModel.findOne({ userId: absent.userId, date: report.date })
                .select('scheduleOverride')
                .lean();

            // Si la falta ya estaba, no se toca (el corte puede correr dos veces).
            if (previousRecord?.scheduleOverride?.workType === 'falta') {
                skipped.push({ userId: absent.userId, name: absent.name, reason: 'falta ya registrada' });
                continue;
            }

            const prevOverride = previousRecord?.scheduleOverride || {};
            const previousNotes = prevOverride?.note || [];

            const scheduleOverride = {
                workType: 'falta',
                shift: absent.shift || null,
                startTime: null, // la falta no lleva horario (mismo criterio del endpoint manual)
                endTime: null,
                note: [
                    ...previousNotes,
                    { user: SYSTEM_USER_ID, message: AUTO_FAULT_NOTE, date: new Date() }
                ]
            };

            const changedFields = ['workType', 'shift', 'startTime', 'endTime']
                .filter(field => (prevOverride?.[field] ?? null) !== (scheduleOverride[field] ?? null))
                .map(field => ({
                    field,
                    from: prevOverride?.[field] ?? null,
                    to: scheduleOverride[field] ?? null
                }));

            const updateOp = {
                $set: { scheduleOverride },
                $setOnInsert: { createdBy: SYSTEM_USER_ID },
                // Constancia visible de la falta automática.
                $push: {
                    comments: { user: SYSTEM_USER_ID, message: AUTO_FAULT_COMMENT, date: new Date() }
                }
            };
            if (previousRecord && changedFields.length > 0) {
                updateOp.$push.editedBy = { user: SYSTEM_USER_ID, change: changedFields, date: new Date() };
            }

            await AttendanceModel.findOneAndUpdate(
                { userId: absent.userId, date: report.date },
                updateOp,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            registered.push({ userId: absent.userId, name: absent.name });
        }
        catch (error) {
            failed.push({ userId: absent.userId, name: absent.name, error: error?.message ?? String(error) });
        }
    }

    return {
        attempted: candidates.length,
        registered: registered.length,
        registeredNames: registered.map(r => r.name),
        skipped,
        failed
    };
}
