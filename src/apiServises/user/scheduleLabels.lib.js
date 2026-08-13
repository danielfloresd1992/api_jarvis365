// ══════════════════════════════════════════════════════════════════════
// CÓMO SE LLAMA CADA CAMBIO DE HORARIO
// ══════════════════════════════════════════════════════════════════════
// El sistema guarda `workType` con nombres de base de datos —'descanso',
// 'falta'— y la gente lee otra cosa: "Libre", "Falta". Acá se traduce.
//
// Vive en un archivo propio porque lo necesitan tres sitios: el texto del
// aviso, el detalle que lo acompaña y —el día que haga falta— cualquier
// reporte. Repartido, el día que "descanso" pase a leerse distinto habría que
// perseguir la palabra por todo el proyecto.
//
// El aviso guarda la etiqueta YA TRADUCIDA. Es coherente con el resto del
// sistema de notificaciones: el texto se persiste renderizado, así que un aviso
// de hace seis meses sigue diciendo lo que dijo aunque hoy se llame distinto.

/** Nombre legible de cada tipo de jornada. */
const TIPOS = {
    laboral:    { es: 'Laboral',    en: 'Working day' },
    extra:      { es: 'Día extra',  en: 'Extra day' },
    descanso:   { es: 'Libre',      en: 'Day off' },
    permiso:    { es: 'Permiso',    en: 'Leave' },
    vacaciones: { es: 'Vacaciones', en: 'Vacation' },
    falta:      { es: 'Falta',      en: 'Absence' },
};

/** Nombre legible de los roles del día. */
const ROLES = {
    onDuty:    { es: 'Guardia',  en: 'On duty' },
    auxiliary: { es: 'Auxiliar', en: 'Auxiliary' },
};

export const etiquetaTipo = (workType, lang = 'es') =>
    TIPOS[workType]?.[lang] || TIPOS[workType]?.es || workType || '';

export const etiquetaRol = (campo, lang = 'es') =>
    ROLES[campo]?.[lang] || ROLES[campo]?.es || campo || '';


/**
 * "12/08/2026" en la zona en que se guardan los días del horario.
 *
 * El día y el mes se piden con dos dígitos explícitamente. Sin eso, Node
 * escribe "12/8/2026" y el navegador "12/08/2026": la misma fecha se leería
 * distinta según dónde se genere el aviso.
 */
export const fechaCorta = (fecha) => {
    try {
        return new Date(fecha).toLocaleDateString('es-VE', {
            timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric',
        });
    } catch { return ''; }
};

/** "2026-08-12": la clave con la que el cliente encuentra la celda. */
export const claveDia = (fecha) => {
    try {
        return new Date(fecha).toISOString().slice(0, 10);
    } catch { return ''; }
};


/**
 * Convierte un documento de asistencia ya escrito en el detalle del cambio.
 *
 * Es lo que hace que el aviso pueda decir "Falta el 12/08/2026" en vez del
 * genérico "modificó tu horario": sin esto, para saber QUÉ cambió había que
 * abrir el horario e ir a mirar la celda.
 *
 * @param {object} record documento de AttendanceModel con su scheduleOverride
 */
export const detalleDelCambio = (record) => {
    const o = record?.scheduleOverride || {};
    return {
        dayKey: claveDia(record?.date),
        fecha: fechaCorta(record?.date),
        workType: o.workType || '',
        etiqueta: etiquetaTipo(o.workType),
        etiquetaEn: etiquetaTipo(o.workType, 'en'),
        shift: o.shift || null,
        // Las jornadas sin horario —libre, permiso, vacaciones, falta— guardan
        // las horas en null; mandarlas igual dejaría "de null a null" en la
        // vista.
        startTime: o.startTime || null,
        endTime: o.endTime || null,
    };
};


/**
 * Resume una lista de cambios en una frase.
 *
 *   1 cambio   → "Falta el 12/08/2026"
 *   2 o 3      → "Falta el 12/08 y Libre el 13/08"
 *   más        → "Falta, Libre y 3 cambios más"
 *
 * Se corta a propósito: el cuerpo del aviso tiene que leerse de un vistazo en
 * la campana. El desglose completo va en el detalle, debajo.
 */
export const resumenDeCambios = (cambios = [], lang = 'es') => {
    if (cambios.length === 0) return '';

    const nombre = (c) => (lang === 'en' ? c.etiquetaEn : c.etiqueta) || c.workType;

    if (cambios.length === 1) {
        const c = cambios[0];
        return lang === 'en'
            ? `${nombre(c)} on ${c.fecha}`
            : `${nombre(c)} el ${c.fecha}`;
    }

    if (cambios.length <= 3) {
        const partes = cambios.map(c => (lang === 'en'
            ? `${nombre(c)} on ${c.fecha}`
            : `${nombre(c)} el ${c.fecha}`));
        const ultimo = partes.pop();
        return lang === 'en'
            ? `${partes.join(', ')} and ${ultimo}`
            : `${partes.join(', ')} y ${ultimo}`;
    }

    // Con muchos se nombran los tipos, no las fechas: enumerar quince fechas
    // en la campana no lo lee nadie.
    const tipos = [...new Set(cambios.map(nombre))];
    const visibles = tipos.slice(0, 2).join(lang === 'en' ? ' and ' : ' y ');

    return lang === 'en'
        ? `${visibles} — ${cambios.length} changes in total`
        : `${visibles} — ${cambios.length} cambios en total`;
};
