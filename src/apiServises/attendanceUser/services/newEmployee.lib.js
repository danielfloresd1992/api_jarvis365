// Empleado dado de alta HOY: su primer día no genera retardo, descuento ni falta
// (se le arma el horario el mismo día, a veces cuando ya empezó a trabajar).
//
// Se usa la fecha MÁS RECIENTE entre createdOn y createdAt porque ninguna es
// fiable sola: createdOn se evalúa una vez al arrancar el servidor, y createdAt
// solo existe en usuarios nuevos. Ante la duda se trata como nuevo.

import { ATTENDANCE_TIMEZONE } from './attendanceTime.lib.js';


// Día de calendario de una fecha en hora de Caracas: { dia, mes, anio, fecha: "YYYY-MM-DD" }.
// null si la fecha no es válida.
export const diaDe = (fecha = new Date()) => {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;

    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: ATTENDANCE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d).reduce((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
    }, {});

    const anio = Number(partes.year);
    const mes = Number(partes.month);
    const dia = Number(partes.day);

    return {
        dia,
        mes,
        anio,
        fecha: `${partes.year}-${partes.month}-${partes.day}`,
    };
};


// ¿Las dos fechas caen en el mismo día de calendario (hora de Caracas)?
export const esElMismoDia = (a, b) => {
    const uno = diaDe(a);
    const otro = diaDe(b);
    return Boolean(uno && otro && uno.fecha === otro.fecha);
};


// Fecha de alta del usuario: la más reciente entre createdAt y createdOn. null si no hay ninguna.
export const fechaDeAlta = (user) => {
    const candidatas = [user?.createdAt, user?.createdOn]
        .map(v => (v ? new Date(v) : null))
        .filter(d => d && !Number.isNaN(d.getTime()));

    if (candidatas.length === 0) return null;
    return new Date(Math.max(...candidatas.map(d => d.getTime())));
};


// ¿El usuario se dio de alta el mismo día que `referencia` (por defecto, hoy)?
export const esAltaDeHoy = (user, referencia = new Date()) => {
    const alta = fechaDeAlta(user);
    if (!alta) return false;
    return esElMismoDia(alta, referencia);
};
