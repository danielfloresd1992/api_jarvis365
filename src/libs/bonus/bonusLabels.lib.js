import { BONUS_SOURCE } from './bonusRules.lib.js';

// ══════════════════════════════════════════════════════════════════════
// PONER EN PALABRAS EL SISTEMA DE BONIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Lo usan tres consumidores que si no armarían cada uno su propia frase:
//
//   · el texto de la notificación de un cambio de bonificación
//   · el resumen que se ve en la lista de alertas
//   · el PDF del sistema de bonificación
//
// Que salga de un solo lugar importa porque el texto de una notificación se
// guarda YA RENDERIZADO: si cada consumidor redactara lo suyo, un aviso de hace
// seis meses podría describir el mismo cambio de otra forma que el informe.

const NOMBRE_DE_CAPA = {
    [BONUS_SOURCE.DISABLED]: { es: 'sin bonificación', en: 'no bonus' },
    [BONUS_SOURCE.DEFAULT]: { es: 'regla general', en: 'default rule' },
    [BONUS_SOURCE.FRANCHISE]: { es: 'excepción por franquicia', en: 'franchise exception' },
    [BONUS_SOURCE.LOCAL]: { es: 'excepción del establecimiento', en: 'local exception' },
};

/** Nombre legible de la capa que resolvió una bonificación. */
export const labelOfSource = (source, lang = 'es') =>
    NOMBRE_DE_CAPA[source]?.[lang] ?? (lang === 'en' ? 'unknown' : 'desconocida');


/**
 * La proporción tal como la escribe el reglamento: "3x1", "1x2".
 *
 * Se lee "tres alertas por un bono". Con acumulación y valor en 1 no se escribe
 * nada: es el caso normal y ponerle etiqueta lo haría parecer una excepción.
 */
export const ratioLabel = ({ bonusWorth = 1, accumulationRequired = 1 } = {}) => {
    if (accumulationRequired === 1 && bonusWorth === 1) return '';
    return `${accumulationRequired}x${bonusWorth}`;
};


/** "X1", "X2"… el multiplicador como lo muestra la lista de alertas. */
export const worthLabel = (bonusWorth) => `X${Number(bonusWorth) || 1}`;


/**
 * Resumen en una línea del sistema de bonificación de una alerta.
 *
 * Ejemplos:
 *   "Sin bonificación"
 *   "Bonifica X1 en todos los establecimientos"
 *   "Bonifica X2 (3x2) en todos, con 1 excepción de franquicia y 5 de establecimiento"
 *   "No bonifica por defecto, salvo en 4 establecimientos"
 */
export const describeBonusSystem = (bonusSystem, lang = 'es') => {
    const en = lang === 'en';

    if (!bonusSystem?.isEnabled) return en ? 'No bonus' : 'Sin bonificación';

    const regla = bonusSystem.defaultRule || {};
    const marcas = bonusSystem.franchiseExceptions?.length || 0;
    const locales = bonusSystem.localExceptions?.length || 0;

    const proporcion = ratioLabel(regla);
    const conProporcion = proporcion ? ` (${proporcion})` : '';

    const base = regla.bonifies
        ? (en
            ? `Bonifies ${worthLabel(regla.bonusWorth)}${conProporcion} everywhere`
            : `Bonifica ${worthLabel(regla.bonusWorth)}${conProporcion} en todos los establecimientos`)
        : (en
            ? 'Does not bonify by default'
            : 'No bonifica por defecto');

    // El sustantivo va en la PRIMERA parte y las siguientes lo dan por dicho:
    // "1 excepción de franquicia y 5 de establecimiento". Si el sustantivo
    // viviera solo en la parte de franquicia, una alerta sin excepciones de
    // marca diría "con 5 de establecimiento", que es una frase cortada.
    const partes = [];

    if (marcas) {
        partes.push(en
            ? `${marcas} franchise exception${marcas === 1 ? '' : 's'}`
            : `${marcas} ${marcas === 1 ? 'excepción' : 'excepciones'} de franquicia`);
    }

    if (locales) {
        const yaSeDijo = partes.length > 0;
        if (en) {
            partes.push(yaSeDijo
                ? `${locales} local one${locales === 1 ? '' : 's'}`
                : `${locales} local exception${locales === 1 ? '' : 's'}`);
        }
        else {
            partes.push(yaSeDijo
                ? `${locales} de establecimiento`
                : `${locales} ${locales === 1 ? 'excepción' : 'excepciones'} de establecimiento`);
        }
    }

    if (!partes.length) return base;

    return en
        ? `${base}, with ${partes.join(' and ')}`
        : `${base}, con ${partes.join(' y ')}`;
};


/** Compara dos valores sin que un null y un undefined cuenten como cambio. */
const distinto = (a, b) => (a ?? null) !== (b ?? null);


/**
 * Qué cambió entre dos configuraciones de bonificación.
 *
 * Devuelve una lista de cambios ya redactados, lista para el cuerpo de la
 * notificación. Vacía si no cambió nada relevante.
 *
 * Las excepciones se resumen por CANTIDAD y no una por una: un cambio que toca
 * quince establecimientos generaría un aviso que nadie lee. Quien necesite el
 * detalle lo tiene en la pantalla.
 */
export const diffBonusSystems = (anterior, nuevo, lang = 'es') => {
    const en = lang === 'en';
    const cambios = [];

    const antes = anterior || {};
    const ahora = nuevo || {};

    if (distinto(antes.isEnabled, ahora.isEnabled)) {
        cambios.push(ahora.isEnabled
            ? (en ? 'Bonus turned ON' : 'Se activó la bonificación')
            : (en ? 'Bonus turned OFF' : 'Se desactivó la bonificación'));
    }

    const reglaAntes = antes.defaultRule || {};
    const reglaAhora = ahora.defaultRule || {};

    if (distinto(reglaAntes.bonifies, reglaAhora.bonifies)) {
        cambios.push(reglaAhora.bonifies
            ? (en ? 'Now bonifies by default' : 'Ahora bonifica por defecto')
            : (en ? 'No longer bonifies by default' : 'Ya no bonifica por defecto'));
    }

    if (distinto(reglaAntes.bonusWorth, reglaAhora.bonusWorth)) {
        cambios.push(en
            ? `Value: ${worthLabel(reglaAntes.bonusWorth)} to ${worthLabel(reglaAhora.bonusWorth)}`
            : `Valor: ${worthLabel(reglaAntes.bonusWorth)} a ${worthLabel(reglaAhora.bonusWorth)}`);
    }

    if (distinto(reglaAntes.accumulationRequired, reglaAhora.accumulationRequired)) {
        cambios.push(en
            ? `Accumulation: ${reglaAntes.accumulationRequired ?? 1} to ${reglaAhora.accumulationRequired ?? 1}`
            : `Acumulación: ${reglaAntes.accumulationRequired ?? 1} a ${reglaAhora.accumulationRequired ?? 1}`);
    }

    const valorAntes = reglaAntes.pointValue || {};
    const valorAhora = reglaAhora.pointValue || {};
    if (distinto(valorAntes.day, valorAhora.day) || distinto(valorAntes.night, valorAhora.night)) {
        cambios.push(en
            ? `Point value: ${valorAntes.day ?? '—'}/${valorAntes.night ?? '—'} to ${valorAhora.day ?? '—'}/${valorAhora.night ?? '—'}`
            : `Valor del punto: ${valorAntes.day ?? '—'}/${valorAntes.night ?? '—'} a ${valorAhora.day ?? '—'}/${valorAhora.night ?? '—'}`);
    }

    const marcasAntes = antes.franchiseExceptions?.length || 0;
    const marcasAhora = ahora.franchiseExceptions?.length || 0;
    if (marcasAntes !== marcasAhora) {
        cambios.push(en
            ? `Franchise exceptions: ${marcasAntes} to ${marcasAhora}`
            : `Excepciones de franquicia: ${marcasAntes} a ${marcasAhora}`);
    }

    const localesAntes = antes.localExceptions?.length || 0;
    const localesAhora = ahora.localExceptions?.length || 0;
    if (localesAntes !== localesAhora) {
        cambios.push(en
            ? `Local exceptions: ${localesAntes} to ${localesAhora}`
            : `Excepciones de establecimiento: ${localesAntes} a ${localesAhora}`);
    }

    if (distinto(antes.regulationCode, ahora.regulationCode)) {
        cambios.push(en
            ? `Regulation code: ${antes.regulationCode || '—'} to ${ahora.regulationCode || '—'}`
            : `Código del reglamento: ${antes.regulationCode || '—'} a ${ahora.regulationCode || '—'}`);
    }

    return cambios;
};
