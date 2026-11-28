import { registerStrategy } from './registry.js';

// ══════════════════════════════════════════════════════════════════════
// ALERTAS PARA LOS CLIENTES (insights365)
// ══════════════════════════════════════════════════════════════════════
// Cuando una alerta de DEMORA o de INCIDENCIA queda validada y enviada al grupo
// (noveltie/insightsAlert.lib.js), se avisa a los clientes que ven ese local en
// insights365: en su campana (canal 'insights') y, con la app cerrada, por Web
// Push (push: 'insights365').
//
// Solo esas dos categorías del catálogo (Menu.category 'delay' e 'incident'):
// el resto de alertas sigue en el muro, sin avisar.
//
// A quién: lo calcula quien llama, con el mismo permiso con el que insights365
// enseña los locales (user.access), y llega en `extra.recipients`.
//
// El texto: arriba la categoría y el local («Demora · Francisca Davie»); debajo
// la alerta y la mesa («Demora en limpieza de mesa · Mesa 22»).

// CATEGORY_LABEL = «cómo se llama cada categoría en el aviso»
export const CATEGORY_LABEL = {
    delay: { es: 'Demora', en: 'Delay' },
    incident: { es: 'Incidencia', en: 'Incident' },
};

// tableLabel = «Mesa 22»; una mesa que no es un número (la barra) va tal cual
const tableLabel = (table, lang) => {
    const value = String(table ?? '').trim();
    if (!value) return '';
    return /^\d+$/.test(value) ? `${lang === 'en' ? 'Table' : 'Mesa'} ${value}` : value;
};

registerStrategy('novelty.alert', {
    family: 'alert',
    channel: 'insights',
    scope: 'personal',
    push: 'insights365',
    level: 'warning',
    action: 'created',
    audience: (ctx) => ctx.extra?.recipients || [],
    text: (ctx, lang) => {
        const kind = CATEGORY_LABEL[ctx.extra?.category]?.[lang === 'en' ? 'en' : 'es'] ?? (lang === 'en' ? 'Alert' : 'Alerta');
        const place = ctx.extra?.place || (lang === 'en' ? 'your location' : 'tu local');
        const alert = ctx.resource?.name || (lang === 'en' ? 'New alert' : 'Nueva alerta');
        const table = tableLabel(ctx.extra?.table, lang);
        return {
            title: `${kind} · ${place}`,
            body: table ? `${alert} · ${table}` : alert,
        };
    },
});
