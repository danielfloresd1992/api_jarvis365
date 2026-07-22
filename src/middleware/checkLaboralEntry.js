import UserModel from '../apiServises/user/user.model.js';
import AttendanceModel from '../apiServises/user/attendance.model.js';

/**
 * Middleware: evalúa si el usuario REGISTRÓ SU ENTRADA LABORAL hoy.
 *
 * Reutiliza el mismo criterio del endpoint GET /user/attendance/authenticated/:dni:
 *   - Marcó checkIn hoy                          → registrado
 *   - No está sujeto a control de asistencia     → registrado (no aplica)
 *   - Hoy es día libre (descanso/permiso/vac/falta) → registrado (no requiere)
 *   - Debía trabajar y no marcó                  → NO registrado
 *
 * Resuelve el usuario por `req.credentialForUser` (si ya viene de controller.login)
 * o, para reutilización futura, buscándolo por la propiedad `user` o `email` del body.
 *
 * Adjunta el resultado en `req.laboralEntry` y en `req.session.laboralEntry`.
 * Por defecto NO bloquea (solo evalúa). Poner BLOCK_LOGIN_IF_NO_ENTRY = true
 * para convertirlo en un gate que impida el login sin entrada registrada.
 */

// ── Zona horaria de asistencia (Venezuela, UTC-4) ──────────────────────
const ATTENDANCE_TIMEZONE = 'America/Caracas';

const getZonedDateParts = (date, timeZone = ATTENDANCE_TIMEZONE) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {});
    return {
        year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
        hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second)
    };
};

const toUtcMidnightFromZonedParts = (parts) =>
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0));

// Tipos de jornada que NO requieren marcar entrada
const NOT_REQUIRED = ['descanso', 'permiso', 'vacaciones', 'falta'];

// ⚙️ true = bloquea el login si el empleado no registró su entrada laboral hoy.
const BLOCK_LOGIN_IF_NO_ENTRY = true;

export default async function checkLaboralEntry(req, res, next) {
    try {
        // 1. Resolver el usuario: primero el ya autenticado (controller.login),
        //    si no, buscar por `user` o por `email` (para reutilización futura).
        let user = req.credentialForUser || null;
        if (!user) {
            const body = req.body || {};
            const query = body.user ? { user: body.user }
                : body.email ? { email: body.email }
                : null;
            if (query) user = await UserModel.findOne(query);
        }

        // Sin usuario no se puede evaluar: no se bloquea (el login ya validó credenciales)
        if (!user) {
            req.laboralEntry = { registered: null, reason: 'usuario no resuelto' };
            if (req.session) req.session.laboralEntry = req.laboralEntry;
            return next();
        }

        // 2. Fecha civil de HOY en Venezuela
        const todayMidnight = toUtcMidnightFromZonedParts(getZonedDateParts(new Date()));
        const dayNumber = todayMidnight.getUTCDay();

        // 3. ¿Está sujeto a control de asistencia? (jobInformation + workSchedule con días)
        const scheduleMap = user.workSchedule?.scheduleByDay;
        const scheduleSize = scheduleMap
            ? (typeof scheduleMap.size === 'number' ? scheduleMap.size : Object.keys(scheduleMap).length)
            : 0;
        const underControl = Boolean(user.jobInformation && user.jobInformation.department) && scheduleSize > 0;

        // 4. Registro de asistencia de hoy
        const record = await AttendanceModel.findOne({ userId: user._id, date: todayMidnight });

        // 4a. Marcó su entrada
        if (record?.checkIn) {
            req.laboralEntry = { registered: true, reason: 'marcó entrada hoy', checkIn: record.checkIn, underControl };
            if (req.session) req.session.laboralEntry = req.laboralEntry;
            return next();
        }

        // 4b. No sujeto a control → no requiere marcar
        if (!underControl) {
            req.laboralEntry = { registered: true, reason: 'no sujeto a control de asistencia', underControl: false };
            if (req.session) req.session.laboralEntry = req.laboralEntry;
            return next();
        }

        // 4c. Día libre efectivo (override del día > regla semanal) → no requiere marcar
        const override = record?.scheduleOverride;
        const dayRule = scheduleMap?.get?.(String(dayNumber)) || scheduleMap?.[String(dayNumber)] || null;
        const workType = (override?.workType) || dayRule?.workType || 'laboral';
        if (NOT_REQUIRED.includes(workType)) {
            req.laboralEntry = { registered: true, reason: `día libre (${workType})`, underControl, workType };
            if (req.session) req.session.laboralEntry = req.laboralEntry;
            return next();
        }

        // 4d. Debía trabajar y no marcó → NO registrado
        req.laboralEntry = { registered: false, reason: 'no ha registrado su entrada laboral', underControl, workType };
        if (req.session) req.session.laboralEntry = req.laboralEntry;

        if (BLOCK_LOGIN_IF_NO_ENTRY) {
            return res.status(403).json({
                status: 403,
                error: 'Attendance required',
                message: 'Primero debes registrar tu jornada laboral en el control de asistencia. Comunicarse con RRHH para más información.',
                laboralEntry: req.laboralEntry
            });
        }

        return next();
    }
    catch (error) {
        console.log(error);
        // Ante error, NO bloquear el login: solo se marca la evaluación como desconocida
        req.laboralEntry = { registered: null, reason: 'error al evaluar', error: error.message };
        if (req.session) req.session.laboralEntry = req.laboralEntry;
        return next();
    }
}