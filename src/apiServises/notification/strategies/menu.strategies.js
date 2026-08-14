import { registerStrategy } from './registry.js';
import { actorName } from './helpers.js';

// ══════════════════════════════════════════════════════════════════════
// ALERTAS Y SU BONIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Los avisos del recurso `menu` se parten en DOS familias, no en una:
//
//   menu   la alerta como tal: se creó, se editó, se eliminó
//   bonus  su sistema de bonificación: cuánto vale y dónde
//
// Son dos porque le importan a gente distinta. Que alguien renombre una alerta
// es información operativa; que le cambie el valor del bono toca lo que cobra
// la gente, y merece verse distinto de un vistazo — en el cliente sale con
// estrella dorada.
//
//
// QUIÉN PUEDE QUÉ
//
//   administrador   aplica el cambio y DESPUÉS se avisa. Alcance global: lo ve
//                   cualquier usuario, porque afecta a cualquiera.
//   usuario super   avisa y después —si un administrador aprueba— se guarda.
//                   Alcance de administradores: son quienes pueden resolverla.
//
// La diferencia no es de permiso sino de MOMENTO. Los dos pueden proponer
// cualquier cambio; lo que cambia es si el cambio ya ocurrió cuando se lee el
// aviso.

/** Nombre de la alerta, con respaldo cuando no vino. */
const nombreDeAlerta = (ctx, lang = 'es') =>
    ctx.resource?.name || (lang === 'en' ? 'an alert' : 'una alerta');


/** Qué operación se pidió, en palabras. */
const OPERACION = {
    create: { es: 'crear', en: 'create' },
    update: { es: 'editar', en: 'edit' },
    delete: { es: 'eliminar', en: 'delete' },
    bonus: { es: 'cambiar la bonificación de', en: 'change the bonus of' },
};

const verboDeOperacion = (op, lang = 'es') =>
    OPERACION[op]?.[lang] ?? (lang === 'en' ? 'change' : 'cambiar');


/**
 * Los cambios de bonificación ya vienen redactados desde libs/bonus
 * (`diffBonusSystems`), en `extra.bonusChanges`. Acá solo se arman en una línea.
 *
 * Se resumen y no se listan todos: un cambio que toca quince establecimientos
 * generaría un cuerpo que nadie lee. El detalle está en la pantalla.
 */
const resumenDeBonificacion = (ctx, lang = 'es') => {
    const cambios = ctx.extra?.bonusChanges || [];
    if (cambios.length === 0) return '';
    if (cambios.length <= 2) return cambios.join('. ');
    return lang === 'en'
        ? `${cambios.slice(0, 2).join('. ')} and ${cambios.length - 2} more change(s)`
        : `${cambios.slice(0, 2).join('. ')} y ${cambios.length - 2} cambio(s) más`;
};


// ══════════════════════════════════════════════════════════════════════
// LA ALERTA — cambios aplicados por un administrador
// ══════════════════════════════════════════════════════════════════════

registerStrategy('menu.created', {
    family: 'menu',
    scope: 'global',
    level: 'success',
    action: 'created',
    text: (ctx, lang) => lang === 'en'
        ? {
            title: 'New alert',
            body: `${actorName(ctx.actor, 'en')} created the alert ${nombreDeAlerta(ctx, 'en')}.`,
        }
        : {
            title: 'Nueva alerta',
            body: `${actorName(ctx.actor)} creó la alerta ${nombreDeAlerta(ctx)}.`,
        },
});

registerStrategy('menu.updated', {
    family: 'menu',
    scope: 'global',
    level: 'info',
    action: 'updated',
    text: (ctx, lang) => {
        // Los nombres de campo se muestran tal como los declaró el cliente, que
        // es quien sabe cómo se llaman en pantalla. Acá no se traducen: hacerlo
        // obligaría a mantener un diccionario de sesenta campos en dos idiomas.
        const campos = (ctx.changes || []).map(c => c.label || c.field).filter(Boolean);
        const detalle = campos.length
            ? `${campos.slice(0, 4).join(', ')}${campos.length > 4 ? `, +${campos.length - 4}` : ''}`
            : '';
        return lang === 'en'
            ? {
                title: 'Alert updated',
                body: `${actorName(ctx.actor, 'en')} updated ${nombreDeAlerta(ctx, 'en')}`
                    + (detalle ? `: ${detalle}.` : '.'),
            }
            : {
                title: 'Alerta actualizada',
                body: `${actorName(ctx.actor)} actualizó ${nombreDeAlerta(ctx)}`
                    + (detalle ? `: ${detalle}.` : '.'),
            };
    },
});

registerStrategy('menu.deleted', {
    family: 'menu',
    scope: 'global',
    level: 'danger',
    action: 'deleted',
    text: (ctx, lang) => lang === 'en'
        ? {
            title: 'Alert deleted',
            body: `${actorName(ctx.actor, 'en')} deleted the alert ${nombreDeAlerta(ctx, 'en')}.`,
        }
        : {
            title: 'Alerta eliminada',
            body: `${actorName(ctx.actor)} eliminó la alerta ${nombreDeAlerta(ctx)}.`,
        },
});


// ══════════════════════════════════════════════════════════════════════
// LA BONIFICACIÓN — aplicada por un administrador
// ══════════════════════════════════════════════════════════════════════

registerStrategy('bonus.updated', {
    family: 'bonus',
    scope: 'global',
    // Nivel 'warning' y no 'info' a propósito: no es una alarma, pero cambiar
    // lo que se le paga a la gente no puede leerse igual que renombrar un
    // campo. En el cliente sale con estrella dorada.
    level: 'warning',
    action: 'updated',
    text: (ctx, lang) => {
        const resumen = resumenDeBonificacion(ctx, lang);
        return lang === 'en'
            ? {
                title: 'Bonus changed',
                body: `${actorName(ctx.actor, 'en')} changed the bonus of ${nombreDeAlerta(ctx, 'en')}`
                    + (resumen ? `. ${resumen}.` : '.'),
            }
            : {
                title: 'Bonificación modificada',
                body: `${actorName(ctx.actor)} cambió la bonificación de ${nombreDeAlerta(ctx)}`
                    + (resumen ? `. ${resumen}.` : '.'),
            };
    },
});


// ══════════════════════════════════════════════════════════════════════
// SOLICITUDES — un usuario super propone, un administrador resuelve
// ══════════════════════════════════════════════════════════════════════
// Alcance 'admin': la audiencia son quienes pueden decidirla. Mandársela a
// todos llenaría la campana de la plantilla con avisos sobre los que no pueden
// hacer nada.

registerStrategy('menu.requested', {
    family: 'menu',
    scope: 'admin',
    level: 'warning',
    action: 'requested',
    text: (ctx, lang) => {
        const verbo = verboDeOperacion(ctx.extra?.operation, lang);
        return lang === 'en'
            ? {
                title: 'Alert change requested',
                body: `${actorName(ctx.actor, 'en')} wants to ${verbo} ${nombreDeAlerta(ctx, 'en')}. Waiting for approval.`,
            }
            : {
                title: 'Cambio de alerta por aprobar',
                body: `${actorName(ctx.actor)} quiere ${verbo} ${nombreDeAlerta(ctx)}. Esperando aprobación.`,
            };
    },
});

registerStrategy('bonus.requested', {
    family: 'bonus',
    scope: 'admin',
    level: 'warning',
    action: 'requested',
    text: (ctx, lang) => {
        const resumen = resumenDeBonificacion(ctx, lang);
        return lang === 'en'
            ? {
                title: 'Bonus change requested',
                body: `${actorName(ctx.actor, 'en')} wants to change the bonus of ${nombreDeAlerta(ctx, 'en')}`
                    + (resumen ? `. ${resumen}` : '') + '. Waiting for approval.',
            }
            : {
                title: 'Bonificación por aprobar',
                body: `${actorName(ctx.actor)} quiere cambiar la bonificación de ${nombreDeAlerta(ctx)}`
                    + (resumen ? `. ${resumen}` : '') + '. Esperando aprobación.',
            };
    },
});


// ══════════════════════════════════════════════════════════════════════
// EL RESULTADO — le vuelve a quien lo pidió
// ══════════════════════════════════════════════════════════════════════
// Sin esto, quien propone un cambio no se entera nunca de si entró. El alcance
// es personal: la decisión sobre SU solicitud no le interesa a nadie más.

registerStrategy('menu.request.resolved', {
    family: 'menu',
    scope: 'personal',
    level: 'info',
    action: 'decided',
    audience: (ctx) => (ctx.extra?.requesterId ? [ctx.extra.requesterId] : []),
    text: (ctx, lang) => {
        const aprobada = ctx.extra?.decision === 'approved';
        const nota = ctx.extra?.note ? ` "${ctx.extra.note}"` : '';
        return lang === 'en'
            ? {
                title: aprobada ? 'Your change was approved' : 'Your change was rejected',
                body: `${actorName(ctx.actor, 'en')} ${aprobada ? 'approved' : 'rejected'} your change on ${nombreDeAlerta(ctx, 'en')}.${nota}`,
            }
            : {
                title: aprobada ? 'Tu cambio fue aprobado' : 'Tu cambio fue rechazado',
                body: `${actorName(ctx.actor)} ${aprobada ? 'aprobó' : 'rechazó'} tu cambio en ${nombreDeAlerta(ctx)}.${nota}`,
            };
    },
});

registerStrategy('bonus.request.resolved', {
    family: 'bonus',
    scope: 'personal',
    level: 'info',
    action: 'decided',
    audience: (ctx) => (ctx.extra?.requesterId ? [ctx.extra.requesterId] : []),
    text: (ctx, lang) => {
        const aprobada = ctx.extra?.decision === 'approved';
        const nota = ctx.extra?.note ? ` "${ctx.extra.note}"` : '';
        return lang === 'en'
            ? {
                title: aprobada ? 'Your bonus change was approved' : 'Your bonus change was rejected',
                body: `${actorName(ctx.actor, 'en')} ${aprobada ? 'approved' : 'rejected'} your bonus change on ${nombreDeAlerta(ctx, 'en')}.${nota}`,
            }
            : {
                title: aprobada ? 'Tu cambio de bonificación fue aprobado' : 'Tu cambio de bonificación fue rechazado',
                body: `${actorName(ctx.actor)} ${aprobada ? 'aprobó' : 'rechazó'} tu cambio de bonificación en ${nombreDeAlerta(ctx)}.${nota}`,
            };
    },
});
