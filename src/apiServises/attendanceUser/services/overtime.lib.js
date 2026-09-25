// Cálculo de horas extras. Fuente de verdad para la celda del horario, el
// reporte global y la aprobación. (El extraMinutes del reporte de un empleado es
// otra medida: minutos trabajados sobre lo pautado, sin jornada base ni gracia.)
//
// Los MINUTOS no se guardan: se derivan de checkIn/checkOut y del turno. Lo que
// sí se guarda es la DECISIÓN (aprobada, rechazada, quién y cuándo).

// Jornada base por turno, en minutos. Pasado ese tiempo empieza la hora extra.
export const BASE_MINUTES_BY_SHIFT = {
    Diurno: 9 * 60,
    Nocturno: 12 * 60,
};

const DEFAULT_SHIFT = 'Diurno';

// Por debajo de estos minutos de más no hay hora extra.
export const OVERTIME_GRACE_MINUTES = 15;


// Minutos trabajados entre entrada y salida (soporta turnos que cruzan la medianoche).
export const workedMinutesOf = (record) => {
    if (!record?.checkIn || !record?.checkOut) return 0;
    const start = new Date(record.checkIn).getTime();
    const end = new Date(record.checkOut).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.floor((end - start) / 60000);
};


// Jornada base del turno, en minutos.
export const baseMinutesOf = (shift) => BASE_MINUTES_BY_SHIFT[shift] ?? BASE_MINUTES_BY_SHIFT[DEFAULT_SHIFT];


// Minutos aprobados de un excedente ya decidido. `approvedMinutes` null significa
// "todo el excedente"; nunca se cuenta más de lo que el día generó.
const approvedMinutesOf = (record, derivedMinutes) => {
    const stored = record?.overtime?.approvedMinutes;
    if (stored === null || stored === undefined) return derivedMinutes;

    const parsed = Number(stored);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(Math.floor(parsed), derivedMinutes);
};


// Horas extras de UN día: cuánto generó, cuánto se aprobó y en qué estado está.
// El estado sale solo de lo guardado; sin excedente se informa 'none'.
export function overtimeOfDay(record, shift = DEFAULT_SHIFT) {
    const worked = workedMinutesOf(record);
    const excess = Math.max(0, worked - baseMinutesOf(shift));
    const minutes = excess >= OVERTIME_GRACE_MINUTES ? excess : 0;

    const status = minutes === 0 ? 'none' : (record?.overtime?.status || 'pending');

    // Solo un día aprobado aporta minutos.
    const approvedMinutes = status === 'approved' ? approvedMinutesOf(record, minutes) : 0;

    return {
        minutes,
        approvedMinutes,
        unapprovedMinutes: Math.max(0, minutes - approvedMinutes),
        // true cuando se aprobó solo una parte del excedente
        isPartial: status === 'approved' && approvedMinutes > 0 && approvedMinutes < minutes,
        status,
        decidedBy: record?.overtime?.decidedBy ?? null,
        decidedAt: record?.overtime?.decidedAt ?? null,
        auto: Boolean(record?.overtime?.auto),
        note: record?.overtime?.note || '',
    };
}


// Suma las horas extras de varios días, separadas por estado.
// Siempre se cumple: aprobadas + por aprobar + rechazadas = generadas
// (el tramo no aprobado de una aprobación parcial cuenta como rechazado).
export function accumulateOvertime(days = []) {
    const totals = {
        approvedMinutes: 0, pendingMinutes: 0, rejectedMinutes: 0, totalMinutes: 0,
        approvedDays: 0, pendingDays: 0, rejectedDays: 0, partialDays: 0,
    };

    days.forEach(({ record, shift }) => {
        const { minutes, status, approvedMinutes, unapprovedMinutes, isPartial } = overtimeOfDay(record, shift);
        if (minutes === 0) return;

        totals.totalMinutes += minutes;

        if (status === 'approved') {
            totals.approvedMinutes += approvedMinutes;
            totals.rejectedMinutes += unapprovedMinutes;
            totals.approvedDays++;
            if (isPartial) totals.partialDays++;
        }
        else if (status === 'rejected') { totals.rejectedMinutes += minutes; totals.rejectedDays++; }
        else { totals.pendingMinutes += minutes; totals.pendingDays++; }
    });

    return totals;
}


// Estado con el que nace la hora extra al marcar la salida: aprobada sola si el
// empleado tiene autoApproveOvertime, si no pendiente. Limpia approvedMinutes
// porque la salida nueva reemplaza el excedente anterior. `now` es la fecha de
// la aprobación automática (por defecto, ahora).
export const overtimeOnCheckout = (userDoc, now = new Date()) => {
    const auto = userDoc?.workSchedule?.autoApproveOvertime === true;
    return auto
        ? { 'overtime.status': 'approved', 'overtime.auto': true, 'overtime.decidedAt': now, 'overtime.approvedMinutes': null }
        : { 'overtime.status': 'pending', 'overtime.auto': false, 'overtime.approvedMinutes': null };
};


// Valida cuántos minutos se aprueban. Devuelve { error } o { minutesToApprove },
// donde null significa "todo el excedente" (así no queda atado a un número que
// puede cambiar si se corrige el marcaje).
export function resolveMinutesToApprove(status, approvedMinutes, minutes) {
    if (status !== 'approved' || approvedMinutes === undefined || approvedMinutes === null) {
        return { minutesToApprove: null };
    }

    const parsed = Number(approvedMinutes);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { error: 'Los minutos a aprobar deben ser un entero mayor que cero.' };
    }
    if (parsed > minutes) {
        return { error: `No se pueden aprobar ${parsed} minutos: ese día solo generó ${minutes}.` };
    }
    return { minutesToApprove: parsed === minutes ? null : parsed };
}
