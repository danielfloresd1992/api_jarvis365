// ══════════════════════════════════════════════════════════════════════
// REGISTRO DE ESTRATEGIAS
// ══════════════════════════════════════════════════════════════════════
// El fichero de tipos: cada TIPO de notificación se apunta acá y dice cómo se
// comporta. Nada más. Los textos viven en los archivos de cada familia.
//
// Se separa del resto para que quede claro que esto es solo el mecanismo: un
// Map, una función para meter y otra para sacar. Si algo no está registrado,
// sale el FALLBACK en vez de reventar.

import { actorName } from './helpers.js';

export const STRATEGIES = new Map();

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

