import { registerStrategy } from './registry.js';
import { actorName, changedLabels } from './helpers.js';

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

