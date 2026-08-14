import { resolveBonusForLocal, WORK_SHIFT } from './bonusRules.lib.js';

// ══════════════════════════════════════════════════════════════════════
// EL SELLO DE BONIFICACIÓN DE UNA NOVEDAD
// ══════════════════════════════════════════════════════════════════════
// Cuando se crea una novedad se resuelve la bonificación y se COPIA dentro.
// No se guarda una referencia a la regla: se guarda la regla.
//
//
// POR QUÉ SE COPIA
//
// El reglamento se actualiza —el vigente lleva fecha en el encabezado—. Sin el
// sello, cambiar hoy el valor de una alerta recalcularía lo que se pagó la
// semana pasada, y no habría forma de reconstruir por qué se pagó lo que se
// pagó. Es el mismo criterio con el que las notificaciones guardan su texto ya
// renderizado.
//
//
// SE SELLA TAMBIÉN CUANDO NO BONIFICA
//
// Si el sello solo se escribiera al bonificar, una novedad vieja —anterior al
// sistema— y una que legítimamente no bonifica se verían igual: las dos sin
// campo. Son cosas distintas y se pagan distinto, así que se distinguen:
//
//     appliesBonus: true    bonificaba, y acá está con cuánto
//     appliesBonus: false   no bonificaba, y fue una decisión
//     appliesBonus: null    la novedad es anterior al sistema
//
//
// EL SELLO GUARDA LA REGLA, NO EL RESULTADO
//
// "Se considera bono a la 2ª vez" no se puede decidir mirando una novedad
// suelta: depende de cuántas van. Por eso acá va `accumulationRequired` y el
// total se calcula al corte. Ver bonusTotals.lib.js.

/** Turno del operador a partir de la novedad. Cualquier cosa que no sea noche cuenta como día. */
export const workShiftOfNovelty = (shift) =>
    String(shift || '').toLowerCase().startsWith('nig')
        || String(shift || '').toLowerCase().startsWith('noc')
        ? WORK_SHIFT.NIGHT
        : WORK_SHIFT.DAY;


/**
 * Arma el sello para guardar en `Noveltie.bonus`.
 *
 * @param {object} menu   la alerta que se está reportando
 * @param {object} local  el establecimiento donde ocurrió
 * @param {string} shift  turno de la novedad ('day' | 'night' | 'nocturno'…)
 * @param {Date}   ahora  inyectable para poder probarlo sin depender del reloj
 */
export const buildBonusSeal = (menu, local, shift, ahora = new Date()) => {
    const workShift = workShiftOfNovelty(shift);
    const resuelto = resolveBonusForLocal(menu, local, workShift);

    const sello = {
        appliesBonus: resuelto.appliesBonus,
        appliedFrom: resuelto.appliedFrom,
        workShift,
        frozenAt: ahora,
    };

    // Cuando no bonifica se sella el hecho y nada más. Guardar un valor de bono
    // junto a un "no bonifica" invita a que alguien lo sume por error.
    if (!resuelto.appliesBonus) return sello;

    return {
        ...sello,
        bonusWorth: resuelto.bonusWorth,
        accumulationRequired: resuelto.accumulationRequired,
        pointValue: resuelto.pointValue,
        thresholdParams: resuelto.thresholdParams,
        regulationCode: resuelto.regulationCode,
    };
};


/**
 * El sello de una novedad anterior al sistema.
 *
 * Se usa al migrar: deja explícito "no se sabe" en vez de dejar el campo
 * ausente, que se confunde con "no bonificó".
 */
export const emptyBonusSeal = () => ({
    appliesBonus: null,
    appliedFrom: null,
    workShift: null,
    frozenAt: null,
});
