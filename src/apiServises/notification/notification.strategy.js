// ══════════════════════════════════════════════════════════════════════
// ESTRATEGIAS DE NOTIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Cada TIPO de notificación decide tres cosas por su cuenta:
//   · qué texto se lee, en español y en inglés
//   · a quién le llega (global, personal o admin)
//   · con qué nivel visual
//
// Sin esto, notification.service.js terminaría siendo un switch gigante que
// crece con cada evento nuevo del sistema. Con el patrón Estrategia, agregar
// "se solicitó un cambio de horario" es registrar un objeto más acá abajo: el
// servicio no se toca.
//
// Una estrategia recibe un CONTEXTO:
//   { actor, resource, changes, extra }
// y devuelve texto y audiencia. No sabe nada de Mongo ni de sockets.

/** Nombre legible del actor. Sin nombre, "El sistema" / "The system". */
const actorName = (actor, lang = 'es') => {
    const full = `${actor?.name || ''} ${actor?.surName || ''}`.trim();
    if (full) return full;
    return lang === 'en' ? 'The system' : 'El sistema';
};

/** Resume los campos que cambiaron: "Estado, Nombre". */
const changedLabels = (changes = []) => changes
    .map(c => c.label || c.field)
    .filter(Boolean)
    .join(', ');

/** Valor legible para el detalle "de X a Y". */
const readable = (v, lang = 'es') => {
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

const STRATEGIES = new Map();

/** Registra una estrategia para un tipo. */
export const registerStrategy = (type, strategy) => {
    STRATEGIES.set(type, strategy);
    return strategy;
};

/**
 * Estrategia por defecto: evita que un tipo sin registrar rompa el flujo.
 * Una notificación genérica es preferible a una excepción en medio de un
 * guardado que ya se hizo.
 */
const FALLBACK = {
    scope: 'global',
    level: 'info',
    action: 'updated',
    text: (ctx, lang) => ({
        title: lang === 'en' ? 'System update' : 'Actualización del sistema',
        body: lang === 'en'
            ? `${actorName(ctx.actor, 'en')} made a change${ctx.resource?.name ? ` on ${ctx.resource.name}` : ''}.`
            : `${actorName(ctx.actor)} realizó un cambio${ctx.resource?.name ? ` en ${ctx.resource.name}` : ''}.`,
    }),
};

export const resolveStrategy = (type) => STRATEGIES.get(type) || FALLBACK;


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


// ══════════════════════════════════════════════════════════════════════
// COMENTARIO EN UNA CELDA DEL HORARIO
// ══════════════════════════════════════════════════════════════════════
// Alguien escribe una nota sobre el día de OTRA persona: "llegó tarde por el
// tráfico", "cubrió el turno de Ana", "pidió permiso a media jornada".
//
// Es GLOBAL, a diferencia de todo lo demás del horario. Un comentario en una
// celda es información de operación —lo que pasó ese día en el local— y sirve
// justamente para que la vea el resto del equipo. Las de horario son personales
// porque afectan la jornada de alguien; esta es un tablón de anuncios.
//
// Por eso mismo el texto NO reproduce el comentario: viaja en `meta` para que
// la vista lo pinte aparte, y el título se lee igual de corrido en la campana
// aunque la nota sea larga.

registerStrategy('attendance.commented', {
    family: 'comment',
    scope: 'global',
    level: 'info',
    action: 'created',
    text: (ctx, lang) => {
        const quien = targetName(ctx.target);
        const dia = ctx.meta?.dayLabel || '';

        return lang === 'en'
            ? {
                title: 'New comment on the schedule',
                body: `${actorName(ctx.actor, 'en')} commented on `
                    + (quien ? `${quien}'s day` : 'a schedule day')
                    + (dia ? ` (${dia})` : '') + '.',
            }
            : {
                title: 'Nuevo comentario en el horario',
                body: `${actorName(ctx.actor)} comentó el día de `
                    + (quien || 'un empleado')
                    + (dia ? ` (${dia})` : '') + '.',
            };
    },
});


// ══════════════════════════════════════════════════════════════════════
// ANUNCIOS DEL SISTEMA
// ══════════════════════════════════════════════════════════════════════
// Aviso global que no nace de que alguien tocara un documento: lo firma el
// usuario de Jarvis. El texto llega en `extra` en vez de estar escrito acá,
// para que sirva a cualquier anuncio futuro sin registrar una estrategia nueva
// por cada uno.

registerStrategy('system.announcement', {
    family: 'system',
    scope: 'global',
    level: 'success',
    action: 'created',
    text: (ctx, lang) => {
        const t = ctx.extra?.[lang] || ctx.extra?.es || {};
        return {
            title: t.title || (lang === 'en' ? 'System announcement' : 'Anuncio del sistema'),
            body: t.body || '',
        };
    },
});


// ══════════════════════════════════════════════════════════════════════
// ESTABLECIMIENTOS
// ══════════════════════════════════════════════════════════════════════

registerStrategy('establishment.created', {
    family: 'resource',
    scope: 'global',
    level: 'success',
    action: 'created',
    text: (ctx, lang) => lang === 'en'
        ? {
            title: 'New establishment',
            body: `${actorName(ctx.actor, 'en')} created the establishment ${ctx.resource?.name || ''}.`.trim(),
        }
        : {
            title: 'Nuevo establecimiento',
            body: `${actorName(ctx.actor)} creó el establecimiento ${ctx.resource?.name || ''}.`.trim(),
        },
});

registerStrategy('establishment.updated', {
    family: 'resource',
    scope: 'global',
    level: 'info',
    action: 'updated',
    text: (ctx, lang) => {
        const campos = changedLabels(ctx.changes);
        return lang === 'en'
            ? {
                title: 'Establishment updated',
                body: `${actorName(ctx.actor, 'en')} updated ${ctx.resource?.name || 'an establishment'}`
                    + (campos ? `: ${campos}.` : '.'),
            }
            : {
                title: 'Establecimiento actualizado',
                body: `${actorName(ctx.actor)} actualizó ${ctx.resource?.name || 'un establecimiento'}`
                    + (campos ? `: ${campos}.` : '.'),
            };
    },
});

// Activación y desactivación van aparte del "actualizado" genérico: es el
// cambio que más se consulta y merece su propio color y su propio texto.
registerStrategy('establishment.deactivated', {
    family: 'resource',
    scope: 'global',
    level: 'warning',
    action: 'deactivated',
    text: (ctx, lang) => lang === 'en'
        ? {
            title: 'Establishment deactivated',
            body: `${actorName(ctx.actor, 'en')} changed the status of ${ctx.resource?.name || 'an establishment'} to DEACTIVATED.`,
        }
        : {
            title: 'Establecimiento desactivado',
            body: `${actorName(ctx.actor)} cambió el estatus de ${ctx.resource?.name || 'un establecimiento'} a DESACTIVADO.`,
        },
});

registerStrategy('establishment.activated', {
    family: 'resource',
    scope: 'global',
    level: 'success',
    action: 'activated',
    text: (ctx, lang) => lang === 'en'
        ? {
            title: 'Establishment activated',
            body: `${actorName(ctx.actor, 'en')} changed the status of ${ctx.resource?.name || 'an establishment'} to ACTIVE.`,
        }
        : {
            title: 'Establecimiento activado',
            body: `${actorName(ctx.actor)} cambió el estatus de ${ctx.resource?.name || 'un establecimiento'} a ACTIVO.`,
        },
});

registerStrategy('establishment.deleted', {
    family: 'resource',
    scope: 'global',
    level: 'danger',
    action: 'deleted',
    text: (ctx, lang) => lang === 'en'
        ? {
            title: 'Establishment deleted',
            body: `${actorName(ctx.actor, 'en')} deleted the establishment ${ctx.resource?.name || ''}.`.trim(),
        }
        : {
            title: 'Establecimiento eliminado',
            body: `${actorName(ctx.actor)} eliminó el establecimiento ${ctx.resource?.name || ''}.`.trim(),
        },
});


// ══════════════════════════════════════════════════════════════════════
// FRANQUICIAS
// ══════════════════════════════════════════════════════════════════════

registerStrategy('franchise.created', {
    family: 'resource',
    scope: 'global',
    level: 'success',
    action: 'created',
    text: (ctx, lang) => lang === 'en'
        ? {
            title: 'New franchise',
            body: `${actorName(ctx.actor, 'en')} created the franchise ${ctx.resource?.name || ''}.`.trim(),
        }
        : {
            title: 'Nueva franquicia',
            body: `${actorName(ctx.actor)} creó la franquicia ${ctx.resource?.name || ''}.`.trim(),
        },
});

registerStrategy('franchise.updated', {
    family: 'resource',
    scope: 'global',
    level: 'info',
    action: 'updated',
    text: (ctx, lang) => {
        const campos = changedLabels(ctx.changes);
        return lang === 'en'
            ? {
                title: 'Franchise updated',
                body: `${actorName(ctx.actor, 'en')} updated ${ctx.resource?.name || 'a franchise'}`
                    + (campos ? `: ${campos}.` : '.'),
            }
            : {
                title: 'Franquicia actualizada',
                body: `${actorName(ctx.actor)} actualizó ${ctx.resource?.name || 'una franquicia'}`
                    + (campos ? `: ${campos}.` : '.'),
            };
    },
});

registerStrategy('franchise.deleted', {
    family: 'resource',
    scope: 'global',
    level: 'danger',
    action: 'deleted',
    text: (ctx, lang) => lang === 'en'
        ? {
            title: 'Franchise deleted',
            body: `${actorName(ctx.actor, 'en')} deleted the franchise ${ctx.resource?.name || ''}.`.trim(),
        }
        : {
            title: 'Franquicia eliminada',
            body: `${actorName(ctx.actor)} eliminó la franquicia ${ctx.resource?.name || ''}.`.trim(),
        },
});


// ══════════════════════════════════════════════════════════════════════
// PERSONAL — impacta directamente a un usuario
// ══════════════════════════════════════════════════════════════════════
// Ejemplo de estrategia PERSONAL, con audiencia explícita. Sirve de molde para
// las que vengan: la audiencia sale del contexto, no de una consulta.

registerStrategy('overtime.decided', {
    family: 'schedule',
    scope: 'personal',
    level: 'info',
    action: 'updated',
    audience: (ctx) => [ctx.extra?.targetUserId].filter(Boolean),
    text: (ctx, lang) => {
        const aprobada = ctx.extra?.status === 'approved';
        return lang === 'en'
            ? {
                title: aprobada ? 'Overtime approved' : 'Overtime rejected',
                body: `${actorName(ctx.actor, 'en')} ${aprobada ? 'approved' : 'rejected'} your overtime`
                    + (ctx.extra?.label ? ` for ${ctx.extra.label}` : '') + '.',
            }
            : {
                title: aprobada ? 'Horas extras aprobadas' : 'Horas extras rechazadas',
                body: `${actorName(ctx.actor)} ${aprobada ? 'aprobó' : 'rechazó'} tus horas extras`
                    + (ctx.extra?.label ? ` del ${ctx.extra.label}` : '') + '.',
            };
    },
});


// ══════════════════════════════════════════════════════════════════════
// SOLICITUDES DE CAMBIO — pendientes de aprobación
// ══════════════════════════════════════════════════════════════════════
// Declarada para dejar el camino abierto: un usuario `super` solicita un cambio
// de horario y queda pendiente hasta que un administrador decide. El scope
// 'admin' ya está contemplado en el modelo y en el servicio; falta el
// middleware que resuelva quiénes son los administradores.

/** Nombre del empleado afectado por la solicitud. */
const targetName = (target) => `${target?.name || ''} ${target?.surName || ''}`.trim();

/** "el 12/08/2026" · " on 08/12/2026" — vacío si no hay fechas. */
const fechasDe = (ctx, lang = 'es') => {
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
// renderizado, así que no hay una segunda oportunidad de adaptarlo al lector.
registerStrategy('schedule.changed', {
    family: 'schedule',
    scope: 'personal',
    level: 'info',
    action: 'updated',
    audience: (ctx) => [ctx.extra?.targetUserId].filter(Boolean),
    text: (ctx, lang) => {
        // Si vino de una solicitud, intervinieron dos personas y las dos tienen
        // que quedar en el texto: quien lo pidió y quien lo autorizó.
        const pedido = ctx.extra?.requesterName;
        return lang === 'en'
            ? {
                title: 'Your schedule changed',
                body: `${actorName(ctx.actor, 'en')} updated your schedule${fechasDe(ctx, 'en')}`
                    + (pedido ? `, as requested by ${pedido}` : '') + '.',
            }
            : {
                title: 'Tu horario cambió',
                body: `${actorName(ctx.actor)} modificó tu horario${fechasDe(ctx)}`
                    + (pedido ? `, a solicitud de ${pedido}` : '') + '.',
            };
    },
});

// La misma modificación, contada para los OTROS administradores.
//
// Es 'personal' y no 'admin' a propósito: el scope 'admin' emite a la sala
// entera y ahí no se puede dejar a nadie afuera, con lo que el administrador
// que acaba de hacer el cambio se lo recibiría a sí mismo. Con destinatarios
// explícitos —los admins menos el actor— cada quien recibe solo lo que no sabe.
registerStrategy('schedule.changedAdmin', {
    family: 'schedule',
    scope: 'personal',
    level: 'info',
    action: 'updated',
    audience: (ctx) => ctx.extra?.adminIds || [],
    text: (ctx, lang) => {
        // Sin nombre del empleado la frase se arma igual, en genérico: mejor
        // "el horario de un empleado" que "el horario de ".
        const quien = targetName(ctx.target);
        const pedido = ctx.extra?.requesterName;
        return lang === 'en'
            ? {
                title: 'Schedule modified',
                body: `${actorName(ctx.actor, 'en')} updated `
                    + (quien ? `${quien}'s schedule` : 'an employee\'s schedule')
                    + `${fechasDe(ctx, 'en')}`
                    + (pedido ? `, as requested by ${pedido}` : '') + '.',
            }
            : {
                title: 'Horario modificado',
                body: `${actorName(ctx.actor)} modificó el horario de `
                    + (quien || 'un empleado')
                    + `${fechasDe(ctx)}`
                    + (pedido ? `, a solicitud de ${pedido}` : '') + '.',
            };
    },
});

registerStrategy('schedule.changeRequested', {
    family: 'schedule',
    scope: 'admin',
    level: 'warning',
    action: 'requested',
    text: (ctx, lang) => {
        // A CUÁNTOS toca, no solo al primero.
        //
        // El lote puede cambiar el horario de varias personas de una vez, y
        // antes el texto nombraba únicamente al primero: un administrador leía
        // "cambio para Ana" y al aprobar movía la jornada de cinco. Quien
        // autoriza tiene que saber el alcance de lo que autoriza.
        const afectados = ctx.extra?.targets || [];
        const otros = Math.max(0, afectados.length - 1);
        const quien = targetName(ctx.target);

        const paraEs = quien
            ? ` para ${quien}${otros > 0 ? ` y ${otros} empleado${otros === 1 ? '' : 's'} más` : ''}`
            : '';
        const paraEn = quien
            ? ` for ${quien}${otros > 0 ? ` and ${otros} more employee${otros === 1 ? '' : 's'}` : ''}`
            : '';

        return lang === 'en'
            ? {
                title: 'Schedule change request',
                body: `${actorName(ctx.actor, 'en')} requested a schedule change`
                    + paraEn + fechasDe(ctx, 'en')
                    + '. Pending your approval.',
            }
            : {
                title: 'Solicitud de cambio de horario',
                body: `${actorName(ctx.actor)} solicitó un cambio de horario`
                    + paraEs + fechasDe(ctx)
                    + '. Pendiente por aprobar.',
            };
    },
});

// Quien la pidió se arrepintió y la retiró. Va al revés que las demás: acá los
// administradores son los que NO se enteraron, porque la tenían pendiente en su
// bandeja esperando una decisión que ya no hace falta.
registerStrategy('schedule.changeWithdrawn', {
    family: 'schedule',
    scope: 'personal',
    level: 'info',
    action: 'rejected',
    audience: (ctx) => ctx.extra?.adminIds || [],
    text: (ctx, lang) => {
        const quien = targetName(ctx.target);
        return lang === 'en'
            ? {
                title: 'Request withdrawn',
                body: `${actorName(ctx.actor, 'en')} withdrew their schedule change request`
                    + (quien ? ` for ${quien}` : '') + fechasDe(ctx, 'en')
                    + '. Nothing left to approve.',
            }
            : {
                title: 'Solicitud retirada',
                body: `${actorName(ctx.actor)} retiró su solicitud de cambio de horario`
                    + (quien ? ` para ${quien}` : '') + fechasDe(ctx)
                    + '. No queda nada por aprobar.',
            };
    },
});

// El resultado se le avisa a QUIEN LO PIDIÓ, no a los administradores: ellos ya
// lo saben porque acaban de decidirlo.
registerStrategy('schedule.changeApproved', {
    family: 'schedule',
    scope: 'personal',
    level: 'success',
    action: 'approved',
    audience: (ctx) => [ctx.extra?.requesterId].filter(Boolean),
    text: (ctx, lang) => {
        const quien = targetName(ctx.target);
        return lang === 'en'
            ? {
                title: 'Schedule change approved',
                body: `${actorName(ctx.actor, 'en')} approved your schedule change`
                    + (quien ? ` for ${quien}` : '') + '. It is already applied.',
            }
            : {
                title: 'Cambio de horario aprobado',
                body: `${actorName(ctx.actor)} aprobó tu cambio de horario`
                    + (quien ? ` para ${quien}` : '') + '. Ya quedó aplicado.',
            };
    },
});

registerStrategy('schedule.changeRejected', {
    family: 'schedule',
    scope: 'personal',
    level: 'danger',
    action: 'rejected',
    audience: (ctx) => [ctx.extra?.requesterId].filter(Boolean),
    text: (ctx, lang) => {
        const quien = targetName(ctx.target);
        const motivo = ctx.extra?.note ? (lang === 'en' ? ` Reason: ${ctx.extra.note}` : ` Motivo: ${ctx.extra.note}`) : '';
        return lang === 'en'
            ? {
                title: 'Schedule change rejected',
                body: `${actorName(ctx.actor, 'en')} rejected your schedule change`
                    + (quien ? ` for ${quien}` : '') + '.' + motivo,
            }
            : {
                title: 'Cambio de horario rechazado',
                body: `${actorName(ctx.actor)} rechazó tu cambio de horario`
                    + (quien ? ` para ${quien}` : '') + '.' + motivo,
            };
    },
});


export { actorName, changedLabels, readable };
