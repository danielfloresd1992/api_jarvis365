// Jornada efectiva de un día: qué regla aplica y en qué turno trabaja.
//
// Precedencia: override del día (attendance.scheduleOverride)
//            > regla semanal (user.workSchedule.scheduleByDay)
//            > turno del perfil (user.workSchedule.shiftType) > 'Diurno'.


// Regla semanal de un día de la semana (0 = domingo). scheduleByDay puede ser Map u objeto.
export const dayRuleOf = (scheduleByDay, dayNumber) =>
    scheduleByDay?.get?.(String(dayNumber)) || scheduleByDay?.[String(dayNumber)] || null;


// Override del día, solo si trae tipo de jornada. Sin workType se ignora entero.
export const activeOverrideOf = (record) =>
    record?.scheduleOverride?.workType ? record.scheduleOverride : null;


// Turno efectivo: override > regla semanal > turno del perfil > 'Diurno'.
export const resolveShift = (override, dayRule, workSchedule) =>
    override?.shift || dayRule?.shift || workSchedule?.shiftType || 'Diurno';


// Cuántos días tiene cargados el horario semanal (Map u objeto plano).
export const weeklyRuleCount = (scheduleByDay) => {
    if (!scheduleByDay) return 0;
    return typeof scheduleByDay.size === 'number' ? scheduleByDay.size : Object.keys(scheduleByDay).length;
};


// Tipos de jornada con los que el empleado no viene ese día.
// (El corte diario usa su propia lista de 3, sin 'falta': la trata aparte.)
export const DAY_OFF_WORK_TYPES = ['descanso', 'permiso', 'vacaciones', 'falta'];


// Horas estándar de cada turno: último respaldo cuando la jornada no trae horas.
// Sin él, quien no tenía horas cargadas nunca llegaba a registrar la falta.
export const SHIFT_DEFAULT_TIMES = {
    Diurno: { startTime: '08:00', endTime: '18:00' },
    Nocturno: { startTime: '18:00', endTime: '07:00' }
};


// Horas estándar del turno; un turno desconocido usa las del diurno.
export const defaultTimesOf = (shift) => SHIFT_DEFAULT_TIMES[shift] || SHIFT_DEFAULT_TIMES.Diurno;
