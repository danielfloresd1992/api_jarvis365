import { registerStrategy } from './registry.js';


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

