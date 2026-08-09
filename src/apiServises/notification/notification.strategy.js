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
//   scope:  'global' | 'personal' | 'admin'
//   level:  'info' | 'success' | 'warning' | 'danger'
//   action: created | updated | deleted | activated | deactivated | requested…
//   text(ctx, lang) -> { title, body }
//   audience(ctx)   -> array de userId  (solo si scope !== 'global')
// }

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
// ANUNCIOS DEL SISTEMA
// ══════════════════════════════════════════════════════════════════════
// Aviso global que no nace de que alguien tocara un documento: lo firma el
// usuario de Jarvis. El texto llega en `extra` en vez de estar escrito acá,
// para que sirva a cualquier anuncio futuro sin registrar una estrategia nueva
// por cada uno.

registerStrategy('system.announcement', {
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

registerStrategy('schedule.changeRequested', {
    scope: 'admin',
    level: 'warning',
    action: 'requested',
    text: (ctx, lang) => lang === 'en'
        ? {
            title: 'Schedule change request',
            body: `${actorName(ctx.actor, 'en')} requested a schedule change`
                + (ctx.resource?.name ? ` for ${ctx.resource.name}` : '') + '. Pending approval.',
        }
        : {
            title: 'Solicitud de cambio de horario',
            body: `${actorName(ctx.actor)} solicitó un cambio de horario`
                + (ctx.resource?.name ? ` para ${ctx.resource.name}` : '') + '. Pendiente por aprobar.',
        },
});


export { actorName, changedLabels, readable };
