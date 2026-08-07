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
// REGLA DE NEGOCIO: la falta registrada (manual o automática del corte)
// PREVALECE sobre el marcaje — pasada la hora de corte del turno
// (FAULT_CUT_TIMES: 15:00 diurno / 21:00 nocturno), marcar entrada ya no
// quita la falta; el reporte lo muestra como ausente indicando la hora en
// que marcó.
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

// Exportada: el endpoint de marcado (user.routes.js) la usa para persistir
// el valor en Attendance.discountUnits al registrar una entrada con retardo.
export const computeDiscountUnits = (minutesLate) => {
    if (minutesLate === null || minutesLate <= LATE_GRACE_MINUTES) return 0;
    return Math.ceil(minutesLate / DISCOUNT_BLOCK_MINUTES);
};

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const NOT_REQUIRED_TYPES = ['descanso', 'permiso', 'vacaciones'];

// Horas estándar de cada turno (las mismas de dayRoster.service.js). Son el
// ÚLTIMO eslabón de la cadena de horario: si la regla del día no trae horas
// propias, se usan estas.
//
// Sin este respaldo, un empleado sin documento de asistencia y sin horas en su
// horario semanal se quedaba con startTime = null, caía en "sin horario
// configurado" y NUNCA llegaba a la rama que registra la falta. Por eso el
// corte dejó de marcar inasistencias en cuanto se acabaron los días que tenían
// documento pre-creado.
const SHIFT_DEFAULT_TIMES = {
    Diurno: { startTime: '08:00', endTime: '18:00' },
    Nocturno: { startTime: '18:00', endTime: '07:00' }
};

// Tipos de jornada en los que SÍ se espera que el empleado venga a trabajar.
const WORKING_TYPES = ['laboral', 'extra'];

// Cuántos días tiene configurados el horario semanal. Con documentos de
// mongoose `scheduleByDay` es un Map (tiene .size); con .lean() es un objeto.
const weeklyRuleCount = (map) => {
    if (!map) return 0;
    if (typeof map.size === 'number') return map.size;
    return Object.keys(map).length;
};


const formatTime12 = (m) => m.format('hh:mm A');

const toMinutes = (hhmm) => {
    if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
    const [h, min] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(min)) return null;
    return (h * 60) + min;
};


// Resuelve la regla efectiva del día para un usuario. Cadena completa:
//   scheduleOverride del documento del día (cambio manual)
//     > workSchedule.scheduleByDay[díaSemana] (horario semanal del user)
//       > workSchedule.shiftType + horas estándar del turno (respaldo)
//
// El último eslabón es el que faltaba: sin él, no tener documento de asistencia
// ni horas en la regla semanal equivalía a no tener horario, y el corte no
// podía evaluar si la persona faltó.
const resolveEffectiveRule = (user, record, dayNumber) => {
    const override = record?.scheduleOverride;
    const hasOverride = Boolean(override?.workType);

    const scheduleByDayMap = user?.workSchedule?.scheduleByDay;
    const dayRule = scheduleByDayMap?.get?.(String(dayNumber))
        || scheduleByDayMap?.[String(dayNumber)]
        || null;

    const workType = (hasOverride && override.workType) || dayRule?.workType || 'laboral';
    const shift = (hasOverride && override.shift)
        || dayRule?.shift
        || user?.workSchedule?.shiftType
        || 'Diurno';

    const defaults = SHIFT_DEFAULT_TIMES[shift] || SHIFT_DEFAULT_TIMES.Diurno;
    // Las horas de respaldo solo tienen sentido en un día de trabajo: en un
    // descanso o unas vacaciones el horario debe seguir vacío.
    const usesDefaultTimes = WORKING_TYPES.includes(workType);

    const startTime = (hasOverride && override.startTime) || dayRule?.startTime
        || (usesDefaultTimes ? defaults.startTime : null);
    const endTime = (hasOverride && override.endTime) || dayRule?.endTime
        || (usesDefaultTimes ? defaults.endTime : null);

    return {
        source: hasOverride ? 'manual' : (dayRule ? 'por defecto' : 'turno del perfil'),
        workType,
        shift,
        startTime,
        endTime,
        // Señales para clasificar más abajo sin volver a leer el horario
        hasDayRule: Boolean(dayRule),
        hasWeeklySchedule: weeklyRuleCount(scheduleByDayMap) > 0,
        usedDefaultTimes: usesDefaultTimes && !((hasOverride && override.startTime) || dayRule?.startTime)
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

        // 5) El empleado tiene horario semanal, pero ESTE día de la semana no
        //    está configurado → ese día no le toca venir. No es una ausencia:
        //    marcarla convertiría en falta el día libre de quien tiene el
        //    horario cargado de lunes a viernes. Solo aplica sin override.
        if (!rule.hasDayRule && rule.hasWeeklySchedule && !record?.scheduleOverride?.workType) {
            notRequired.push({ ...base, reason: 'descanso', note: 'Día no configurado en su horario semanal' });
            continue;
        }

        // 6) Día laboral/extra sin hora de entrada configurada → no evaluable.
        //    Con el respaldo del turno esto ya casi no ocurre; queda como red
        //    de seguridad para un turno desconocido.
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

        // 8) Debía presentarse, ya pasó su hora de entrada y no marcó → ausente.
        //    autoFaultCandidate: solo ESTA rama es candidata al registro
        //    automático de falta (las faltas pre-registradas y los marcados
        //    'ausente' ya tienen su documento; ver registerAbsencesAsFaults).
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


// ══════════════════════════════════════════════════════════════════════
// REGISTRO AUTOMÁTICO DE FALTAS
// ══════════════════════════════════════════════════════════════════════
// Usuario del sistema que firma las faltas automáticas (Jarvis Vision, ya
// existe en la base de datos). Para que en el futuro las firme otro usuario
// basta cambiar este _id acá, o definir ATTENDANCE_SYSTEM_USER_ID en el .env.
const SYSTEM_USER_ID = process.env.ATTENDANCE_SYSTEM_USER_ID || '697657323dc213f05486e03a';

const AUTO_FAULT_NOTE = 'Falta registrada automáticamente: no marcó entrada al corte de asistencia.';

// Comentario que queda en attendance.comments al registrar la falta: visible
// en el popover de la grilla (con la muesca dorada en la celda), firmado por
// el usuario del sistema.
const AUTO_FAULT_COMMENT = 'Falta automática con Jarvis Vision';

// Hora de corte por turno (hora Venezuela): pasada esta hora, quien no marcó
// entrada queda con falta FIRME. Es la única fuente de verdad — el scheduler
// del job (REPORT_CUTS) arma sus cortes desde acá.
export const FAULT_CUT_TIMES = {
    Diurno: '15:00',
    Nocturno: '21:00'
};

// Margen para no perder un corte por unos segundos. setTimeout puede disparar
// una fracción antes de la hora exacta: sin este margen, un corte que arranca a
// las 20:59:59 encontraba nowMinutes = 1259 < 1260 y saltaba a TODO el personal
// nocturno, y como el corte ya quedaba marcado como enviado no se reintentaba
// hasta el día siguiente.
const FAULT_CUT_TOLERANCE_MINUTES = 2;

/**
 * Registra como falta en Attendance a los ausentes del reporte que debían
 * presentarse y no marcaron entrada (autoFaultCandidate). Crea el documento
 * si no existe o escribe el scheduleOverride sobre el existente, replicando
 * la MISMA forma que el endpoint manual de "Editar grupo" (user.routes.js):
 * notas preservadas + nota nueva, createdBy solo al insertar, y editedBy
 * con los campos que realmente cambiaron.
 *
 * @param {object} report - Salida de buildDailyAttendanceReport().
 * @returns {Promise<object>} { attempted, registered, skipped, failed }
 */
export async function registerAbsencesAsFaults(report) {
    const candidates = (report?.absents || []).filter(a => a.autoFaultCandidate);
    const registered = [];
    const skipped = [];
    const failed = [];

    // La falta solo se escribe DESPUÉS de la hora de corte del turno: un
    // reporte manual a media mañana no debe dejar faltas firmes de gente
    // que todavía puede llegar (con retardo, pero llega).
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

            // Idempotencia: si la falta ya estaba registrada no se toca (evita
            // duplicar la nota si el corte corre dos veces). Un checkIn tardío
            // NO la evita: pasada la hora de corte, la falta queda firme.
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
                // Comentario en el documento (attendance.comments): deja
                // constancia visible de la falta automática. El guard de
                // "falta ya registrada" evita duplicarlo si el corte repite.
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
