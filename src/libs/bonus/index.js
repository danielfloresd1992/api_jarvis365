// ══════════════════════════════════════════════════════════════════════
// BONIFICACIÓN — la puerta del módulo
// ══════════════════════════════════════════════════════════════════════
// Todo lo que sabe de bonos vive acá y en ningún otro lado. Antes estaba
// repartido entre el modelo, un util suelto que nadie importaba y la pantalla
// que lo editaba, y cada uno tenía su propia idea de cómo se calculaba.
//
// El recorrido completo, y en qué archivo está cada tramo:
//
//   1. CONFIGURAR   `Menu.bonusSystem` guarda tres capas: la regla general,
//                   las excepciones por franquicia y las de establecimiento.
//
//   2. RESOLVER     bonusRules.lib.js — dado un establecimiento y un turno,
//                   qué regla aplica y de qué capa salió.
//
//   3. CONGELAR     bonusSeal.lib.js — al crear la novedad, esa regla se COPIA
//                   dentro. Lo que ya se reportó no vuelve a consultar la
//                   configuración: el reglamento cambia, lo pagado no.
//
//   4. CONTAR       bonusTotals.lib.js — al corte, se agrupa por alerta y se
//                   aplica la proporción del reglamento.
//
//   5. EXPLICAR     bonusLabels.lib.js — el mismo texto para la notificación,
//                   la lista de alertas y el PDF.

export {
    BONUS_SOURCE,
    WORK_SHIFT,
    resolveBonusForLocal,
    franchiseIdOfLocal,
    bonusIsActive,
    countBonusExceptions,
    normalizeBonusSystem,
} from './bonusRules.lib.js';

export {
    buildBonusSeal,
    emptyBonusSeal,
    workShiftOfNovelty,
} from './bonusSeal.lib.js';

export {
    calculateBonusTotals,
    isApprovedNovelty,
    countsForBonus,
} from './bonusTotals.lib.js';

export {
    describeBonusSystem,
    diffBonusSystems,
    labelOfSource,
    ratioLabel,
    worthLabel,
} from './bonusLabels.lib.js';
