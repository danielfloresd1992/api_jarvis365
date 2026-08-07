// ══════════════════════════════════════════════════════════════════════
// HORAS EXTRAS — cálculo reutilizable
// ══════════════════════════════════════════════════════════════════════
// Una sola fuente de verdad para:
//   · la celda del horario (un día)
//   · el reporte individual (acumulado por rango)
//   · el endpoint de aprobación
//
// Los minutos NO se guardan en el documento: se derivan de checkIn/checkOut
// y del turno. Así los registros anteriores a esta función también muestran
// sus horas extras, sin migrar nada. Lo que SÍ se persiste es la decisión
// (aprobada / rechazada / quién y cuándo), que no se puede derivar.

// Jornada base por turno, en minutos. Pasado ese tiempo empieza la hora extra.
//   Diurno   →  9 h
//   Nocturno → 12 h (18:00 → 06:00)
export const BASE_MINUTES_BY_SHIFT = {
    Diurno: 9 * 60,
    Nocturno: 12 * 60,
};

const DEFAULT_SHIFT = 'Diurno';

// Tolerancia: por debajo de estos minutos no se considera hora extra, para
// que unos minutos de más al fichar la salida no generen una solicitud.
export const OVERTIME_GRACE_MINUTES = 15;


/** Minutos trabajados entre entrada y salida. Soporta turnos que cruzan la medianoche. */
export const workedMinutesOf = (record) => {
    if (!record?.checkIn || !record?.checkOut) return 0;
    const start = new Date(record.checkIn).getTime();
    const end = new Date(record.checkOut).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.floor((end - start) / 60000);
};


/** Jornada base del día, en minutos, según el turno efectivo. */
export const baseMinutesOf = (shift) => BASE_MINUTES_BY_SHIFT[shift] ?? BASE_MINUTES_BY_SHIFT[DEFAULT_SHIFT];


/**
 * Horas extras de UN día.
 * @param {object} record  documento de Attendance (necesita checkIn y checkOut)
 * @param {string} shift   turno efectivo del día ('Diurno' | 'Nocturno')
 * @returns {{ minutes:number, status:string, decidedBy:any, decidedAt:Date|null, auto:boolean }}
 */
export function overtimeOfDay(record, shift = DEFAULT_SHIFT) {
    const worked = workedMinutesOf(record);
    const excess = Math.max(0, worked - baseMinutesOf(shift));
    const minutes = excess >= OVERTIME_GRACE_MINUTES ? excess : 0;

    // El estado sale ÚNICAMENTE de lo persistido. La aprobación automática se
    // resuelve UNA vez, al registrar la salida (overtimeOnCheckout en
    // user.routes.js, según workSchedule.autoApproveOvertime). Derivarla acá en
    // cada lectura haría que cambiar la configuración reescribiera el pasado.
    return {
        minutes,
        // Sin excedente no hay nada que decidir: se informa como 'none' para
        // que la UI no muestre una solicitud pendiente inexistente.
        status: minutes === 0 ? 'none' : (record?.overtime?.status || 'pending'),
        decidedBy: record?.overtime?.decidedBy ?? null,
        decidedAt: record?.overtime?.decidedAt ?? null,
        auto: Boolean(record?.overtime?.auto),
        note: record?.overtime?.note || '',
    };
}


/**
 * Acumulado de horas extras por rango, desglosado por estado.
 * @param {Array<{record:object, shift:string}>} days
 * @returns {{ approvedMinutes, pendingMinutes, rejectedMinutes, totalMinutes, approvedDays, pendingDays, rejectedDays }}
 */
export function accumulateOvertime(days = []) {
    const totals = {
        approvedMinutes: 0, pendingMinutes: 0, rejectedMinutes: 0, totalMinutes: 0,
        approvedDays: 0, pendingDays: 0, rejectedDays: 0,
    };

    days.forEach(({ record, shift }) => {
        const { minutes, status } = overtimeOfDay(record, shift);
        if (minutes === 0) return;

        totals.totalMinutes += minutes;
        if (status === 'approved') { totals.approvedMinutes += minutes; totals.approvedDays++; }
        else if (status === 'rejected') { totals.rejectedMinutes += minutes; totals.rejectedDays++; }
        else { totals.pendingMinutes += minutes; totals.pendingDays++; }
    });

    return totals;
}
