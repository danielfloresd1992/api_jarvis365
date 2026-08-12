import { registerStrategy } from './registry.js';


// ══════════════════════════════════════════════════════════════════════
// MARCAJE DE ASISTENCIA
// ══════════════════════════════════════════════════════════════════════
// El resultado de fichar entrada o salida, para el PROPIO empleado.
//
// Es estrictamente PERSONAL: la audiencia es él y nadie más. Sus retardos y
// sus unidades de descuento son suyos, y una notificación global o de admin
// los pondría a la vista de gente que no tiene por qué verlos.
//
// El detalle —fotos, horas, minutos de retardo— viaja en `meta`, que es lo que
// lee la vista de esta familia en el cliente.

/** "3 unidades" · "1 unidad" */
const unidades = (n, lang = 'es') => lang === 'en'
    ? `${n} unit${n === 1 ? '' : 's'}`
    : `${n} unidad${n === 1 ? '' : 'es'}`;

/**
 * Hora legible del marcaje, en la zona del monitoreo: "08:02 am".
 *
 * Intl en es-VE devuelve "a. m." — con punto final. Metida en una frase que
 * también termina en punto queda "a las 08:02 a. m..", así que se normaliza a
 * "am"/"pm". Además separa con espacio fino, que no siempre se ve bien.
 */
const horaDe = (fecha) => {
    if (!fecha) return '';
    try {
        return new Date(fecha)
            .toLocaleTimeString('es-VE', {
                timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: true,
            })
            .replace(/[  ]/g, ' ')
            .replace(/\ba\.\s*m\./i, 'am')
            .replace(/\bp\.\s*m\./i, 'pm')
            .trim();
    } catch { return ''; }
};

registerStrategy('attendance.checkIn', {
    family: 'attendance',
    scope: 'personal',
    level: 'info',
    action: 'created',
    audience: (ctx) => [ctx.extra?.targetUserId].filter(Boolean),
    text: (ctx, lang) => {
        const m = ctx.meta || {};
        const hora = horaDe(m.checkIn);

        // Si por lo que sea no hay hora, la frase se arma sin ella: mejor
        // "Marcaste tu entrada." que "Marcaste tu entrada a las .".
        const aLas = hora ? ` a las ${hora}` : '';
        const at = hora ? ` at ${hora}` : '';

        // Sin retardo el mensaje FELICITA, no solo informa: llegar a tiempo es
        // lo que se quiere reforzar y merece leerse distinto.
        if (!m.isLate) {
            return lang === 'en'
                ? { title: 'Entry recorded', body: `You clocked in${at}. On time — thanks for your punctuality.` }
                : { title: 'Entrada registrada', body: `Marcaste tu entrada${aLas}. Llegaste a tiempo, gracias por tu puntualidad.` };
        }

        const desc = m.discountUnits > 0
            ? (lang === 'en'
                ? ` It generates a discount of ${unidades(m.discountUnits, 'en')}.`
                : ` Genera un descuento de ${unidades(m.discountUnits)}.`)
            : '';

        return lang === 'en'
            ? {
                title: 'Entry recorded with delay',
                body: `You clocked in${at}, ${m.minutesLate || 0} minutes after your start time.${desc}`,
            }
            : {
                title: 'Entrada registrada con retardo',
                body: `Marcaste tu entrada${aLas}, ${m.minutesLate || 0} minutos después de tu hora.${desc}`,
            };
    },
});

registerStrategy('attendance.checkOut', {
    family: 'attendance',
    scope: 'personal',
    level: 'success',
    action: 'updated',
    audience: (ctx) => [ctx.extra?.targetUserId].filter(Boolean),
    text: (ctx, lang) => {
        const m = ctx.meta || {};
        const hora = horaDe(m.checkOut);
        const aLas = hora ? ` a las ${hora}` : '';
        const at = hora ? ` at ${hora}` : '';

        // Cada dato se agrega solo si existe: así el aviso nunca queda con un
        // hueco a la vista ("Trabajaste —.").
        const jornada = m.workedLabel
            ? (lang === 'en' ? ` Worked: ${m.workedLabel}.` : ` Trabajaste ${m.workedLabel}.`)
            : '';
        const extra = m.isExtraDay
            ? (lang === 'en' ? ' Counted as an extra day.' : ' Cuenta como día extra.')
            : '';

        return lang === 'en'
            ? { title: 'Day closed', body: `You clocked out${at}.${jornada}${extra}` }
            : { title: 'Jornada cerrada', body: `Marcaste tu salida${aLas}.${jornada}${extra}` };
    },
});

