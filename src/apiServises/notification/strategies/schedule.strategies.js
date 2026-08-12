import { registerStrategy } from './registry.js';
import { actorName, targetName, fechasDe } from './helpers.js';

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

