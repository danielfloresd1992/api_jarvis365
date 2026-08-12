// ══════════════════════════════════════════════════════════════════════
// TEXTOS COMPARTIDOS
// ══════════════════════════════════════════════════════════════════════
// Trozos de frase que usan varias familias: nombres de personas, listas de
// campos cambiados, fechas. Sin estado y sin dependencias.
//
// Están juntos porque el día que "El sistema" pase a llamarse de otra forma,
// o que las fechas cambien de formato, se toca UN sitio y cambia en todas las
// notificaciones a la vez.

/** Nombre legible del actor. Sin nombre, "El sistema" / "The system". */
export const actorName = (actor, lang = 'es') => {
    const full = `${actor?.name || ''} ${actor?.surName || ''}`.trim();
    if (full) return full;
    return lang === 'en' ? 'The system' : 'El sistema';
};

/** Resume los campos que cambiaron: "Estado, Nombre". */
export const changedLabels = (changes = []) => changes
    .map(c => c.label || c.field)
    .filter(Boolean)
    .join(', ');

/** Valor legible para el detalle "de X a Y". */
export const readable = (v, lang = 'es') => {
    if (v === null || v === undefined || v === '') return lang === 'en' ? 'empty' : 'vacío';
    if (v === true) return lang === 'en' ? 'yes' : 'sí';
    if (v === false) return lang === 'en' ? 'no' : 'no';
    return String(v);
};


// ── Contrato de una estrategia ────────────────────────────────────────
// {
//   family: 'schedule' | 'resource' | 'system' | 'general'
//   scope:  'global' | 'personal' | 'admin'
//   level:  'info' | 'success' | 'warning' | 'danger'
//   action: created | updated | deleted | activated | deactivated | requested…
//   text(ctx, lang) -> { title, body }
//   audience(ctx)   -> array de userId  (solo si scope !== 'global')
// }
//
// `family` es lo único que mira el CLIENTE para decidir cómo se pinta la
// notificación. Se declara acá y no se deduce del nombre del tipo: partir la
// cadena por el punto obligaría a tocar el front cada vez que nace un tipo, y
// un tipo mal escrito caería en un estilo cualquiera sin avisar.


// ══════════════════════════════════════════════════════════════════════
// SOLICITUDES DE CAMBIO — pendientes de aprobación
// ══════════════════════════════════════════════════════════════════════
// Declarada para dejar el camino abierto: un usuario `super` solicita un cambio
// de horario y queda pendiente hasta que un administrador decide. El scope
// 'admin' ya está contemplado en el modelo y en el servicio; falta el
// middleware que resuelva quiénes son los administradores.

/** Nombre del empleado afectado por la solicitud. */
export const targetName = (target) => `${target?.name || ''} ${target?.surName || ''}`.trim();

/** "el 12/08/2026" · " on 08/12/2026" — vacío si no hay fechas. */
export const fechasDe = (ctx, lang = 'es') => {
    const fechas = ctx.extra?.fechas || [];
    if (fechas.length === 0) return '';
    const lista = fechas.length === 1
        ? fechas[0]
        : `${fechas[0]}${fechas.length > 1 ? ` y ${fechas.length - 1} fecha${fechas.length > 2 ? 's' : ''} más` : ''}`;
    return lang === 'en' ? ` on ${lista}` : ` el ${lista}`;
};

// Cambio APLICADO por un administrador, sin solicitud de por medio.
//
// Genera DOS avisos, no uno, porque son dos audiencias que necesitan leer cosas
// distintas: al empleado le importa que "su" horario cambió, y al resto de
// administradores les importa quién le tocó el horario a quién. Un solo texto
// no puede decir "tu horario" y "el horario de Ana" a la vez — se guarda ya
