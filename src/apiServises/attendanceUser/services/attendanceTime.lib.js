// Fechas y horas de la asistencia, siempre en hora de Venezuela.
// Un registro guarda `date` como la medianoche UTC del día civil de Caracas.

export const ATTENDANCE_TIMEZONE = 'America/Caracas';


// Descompone una fecha en año, mes, día, hora, minuto y segundo de Caracas.
export const getZonedDateParts = (date, timeZone = ATTENDANCE_TIMEZONE) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {});

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second)
    };
};


// Convierte esas partes en la medianoche UTC del mismo día (el formato de `date`).
export const toUtcMidnightFromZonedParts = (parts) => {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0));
};


// Copia de la fecha recortada a las 00:00 UTC. Una fecha inválida sigue inválida.
export const utcMidnightOf = (value) => {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    return date;
};


// Copia de la fecha con `days` días sumados (negativo para restar).
export const addUtcDays = (date, days) => {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
};


// Minutos transcurridos desde la medianoche según las partes de una hora.
export const minutesOfDay = (parts) => (parts.hour * 60) + parts.minute;


// "HH:mm" → minutos desde la medianoche. null si la hora o el minuto no son números.
export const hhmmToMinutes = (hhmm) => {
    const [hours, minutes] = hhmm.split(':');
    const h = Number(hours);
    const m = Number(minutes);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return (h * 60) + m;
};
