import { registerStrategy } from './registry.js';
import { actorName, targetName } from './helpers.js';

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

