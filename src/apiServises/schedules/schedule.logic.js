/**
 * schedule.logic.js — Lógica de negocio del horario de monitoreo.
 *
 * Funciones PURAS (sin BD ni Express) para poder testearlas y reutilizarlas
 * tanto en los controladores como en el futuro job de notificaciones.
 *
 * Convenciones:
 *   - día de la semana: Date.getDay() → 0=Dom, 1=Lun … 6=Sáb.
 *   - hora del día: minutos desde medianoche (0..1439).
 *   - un rango con `end <= start` es CORRIDO: cruza la medianoche y termina en
 *     la madrugada del día siguiente (p. ej. 19:00→07:00).
 */

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const VALID_TYPES = ['analytical', 'perimeter'];

/** "HH:mm" o "HH:mm:ss" → minutos desde medianoche. Devuelve null si es inválido. */
function toMinutes(hhmm) {
    if (typeof hhmm !== 'string') return null;
    const parts = hhmm.split(':');
    if (parts.length < 2) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
}

/** true si el rango cruza la medianoche (end <= start). */
function isOvernight(range) {
    const start = toMinutes(range?.hours?.start);
    const end   = toMinutes(range?.hours?.end);
    if (start === null || end === null) return false;
    return end <= start;
}

/**
 * ¿El rango está activo en (dayOfWeek, minute)?
 *
 * Rango normal (start < end): activo su mismo día, en [start, end).
 * Rango corrido (end <= start): activo su día desde [start, 24:00) Y el día
 * SIGUIENTE en [00:00, end). Así una franja 19:00→07:00 registrada el lunes
 * sigue activa a las 03:00 del martes.
 */
function isRangeActiveAt(range, dayOfWeek, minute) {
    const start = toMinutes(range?.hours?.start);
    const end   = toMinutes(range?.hours?.end);
    if (start === null || end === null) return false;

    const day = Number(range?.dayMonitoring);
    if (!Number.isInteger(day)) return false;

    if (end > start) {
        // Rango dentro del mismo día
        return day === dayOfWeek && minute >= start && minute < end;
    }

    // Rango corrido: cola del propio día + arranque del día siguiente
    if (day === dayOfWeek && minute >= start) return true;
    if ((day + 1) % 7 === dayOfWeek && minute < end) return true;
    return false;
}

/**
 * Devuelve el horario que aplica AHORA para un doc de schedule.
 * Con invierno activo y establecimiento marcado como USA, usa el alternativo.
 */
function pickSchedule(scheduleDoc, isWinter = false) {
    const useWinter = Boolean(isWinter) && Boolean(scheduleDoc?.usesUsTimezone);
    const ranges = useWinter ? scheduleDoc?.dayMonitoringWinter : scheduleDoc?.dayMonitoring;
    return {
        ranges: Array.isArray(ranges) ? ranges : [],
        usingWinter: useWinter
    };
}

/**
 * Estado de monitoreo de un establecimiento en un instante dado.
 *
 * @param scheduleDoc  documento de schedule ({ dayMonitoring, dayMonitoringWinter, usesUsTimezone })
 * @param dayOfWeek    0..6 (Date.getDay) en la zona de referencia
 * @param minute       0..1439 en la zona de referencia
 * @param isWinter     ¿está en vigor el cambio de invierno?
 * @returns { active, types, ranges, usingWinter }
 */
function getActiveMonitoring(scheduleDoc, dayOfWeek, minute, isWinter = false) {
    const { ranges, usingWinter } = pickSchedule(scheduleDoc, isWinter);

    const activeRanges = ranges.filter(r => isRangeActiveAt(r, dayOfWeek, minute));
    const types = [...new Set(activeRanges.map(r => r.type || 'analytical'))];

    return {
        active: activeRanges.length > 0,
        types,                 // p. ej. ['analytical'], ['perimeter'] o ambos
        ranges: activeRanges,
        usingWinter
    };
}

/**
 * Zona horaria de referencia del monitoreo. FIJA e independiente del sistema
 * operativo: el mismo instante produce el mismo día/minuto tanto en el Linux
 * de desarrollo como en el Windows Server de producción, sin importar cómo
 * esté configurado el reloj/zona de cada máquina. Sobreescribible con la
 * variable de entorno MONITORING_TZ (IANA, p. ej. 'America/Havana').
 */
const MONITORING_TZ = process.env.MONITORING_TZ || 'America/Caracas';

const WEEKDAY_TO_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Día de la semana (0..6) y minuto del día (0..1439) del instante dado, en la
 * zona horaria de referencia (MONITORING_TZ). Usa Intl, disponible por igual
 * en Node sobre Linux y Windows. Si la zona configurada fuera inválida, cae a
 * la hora local del sistema (comportamiento anterior).
 */
function getServerNow(date = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: MONITORING_TZ,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(date);

        const get = type => parts.find(p => p.type === type)?.value;
        const dayOfWeek = WEEKDAY_TO_NUM[get('weekday')];
        const minute = Number(get('hour')) * 60 + Number(get('minute'));

        if (Number.isInteger(dayOfWeek) && Number.isFinite(minute)) {
            return { dayOfWeek, minute };
        }
    }
    catch { /* zona inválida → fallback a hora del sistema */ }

    return { dayOfWeek: date.getDay(), minute: date.getHours() * 60 + date.getMinutes() };
}

/**
 * Conveniencia: estado de monitoreo AHORA para un doc de schedule, tomando la
 * hora local del servidor. `isWinter` decide si aplica el horario alternativo.
 */
function getActiveMonitoringNow(scheduleDoc, isWinter = false, date = new Date()) {
    const { dayOfWeek, minute } = getServerNow(date);
    return getActiveMonitoring(scheduleDoc, dayOfWeek, minute, isWinter);
}

/**
 * Valida una lista de rangos antes de persistir.
 * @returns { ok: true } | { ok: false, error: string }
 */
function validateRanges(ranges) {
    if (!Array.isArray(ranges)) return { ok: false, error: 'El horario debe ser una lista de rangos.' };

    for (const [i, r] of ranges.entries()) {
        const day = Number(r?.dayMonitoring);
        if (!Number.isInteger(day) || day < 0 || day > 6) {
            return { ok: false, error: `Rango ${i}: día inválido (debe ser 0..6).` };
        }
        if (toMinutes(r?.hours?.start) === null || toMinutes(r?.hours?.end) === null) {
            return { ok: false, error: `Rango ${i}: hora inválida (formato HH:mm).` };
        }
        if (r?.type !== undefined && !VALID_TYPES.includes(r.type)) {
            return { ok: false, error: `Rango ${i}: tipo inválido (${VALID_TYPES.join(' | ')}).` };
        }
    }
    return { ok: true };
}

export {
    DAY_LABELS,
    VALID_TYPES,
    toMinutes,
    isOvernight,
    isRangeActiveAt,
    pickSchedule,
    getActiveMonitoring,
    getServerNow,
    getActiveMonitoringNow,
    validateRanges,
};