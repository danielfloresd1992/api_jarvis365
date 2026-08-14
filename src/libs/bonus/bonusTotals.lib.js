// ══════════════════════════════════════════════════════════════════════
// EL CORTE: DE NOVEDADES SELLADAS A BONOS Y PUNTOS
// ══════════════════════════════════════════════════════════════════════
// Reemplaza a assets/util/calculateBonus.js, que tenía tres defectos y ninguno
// se notaba porque nadie lo importaba:
//
//   1. Leía `novedad.rulesForBonus`, un campo que el modelo tenía COMENTADO.
//      Daba undefined, luego NaN, y un guard lo convertía en 0 en silencio.
//   2. Filtraba por `isValidate.validation === 'true'` —una cadena— cuando la
//      validación vigente es `validationResult.isApproved`, un booleano.
//   3. Agrupaba por TÍTULO. Renombrar una alerta le parte el conteo en dos
//      grupos, y ninguno alcanza su acumulación.
//
// Acá se agrupa por `menuRef`, que es el identificador y no cambia nunca.

/** Una novedad cuenta si un validador la aprobó. */
export const isApprovedNovelty = (novelty) =>
    novelty?.validationResult?.isApproved === true;


/** Una novedad suma si además trae un sello que dice que bonificaba. */
export const countsForBonus = (novelty) =>
    isApprovedNovelty(novelty) && novelty?.bonus?.appliesBonus === true;


const idComoTexto = (valor) => {
    if (!valor) return '';
    if (typeof valor === 'string') return valor;
    if (valor._id) return String(valor._id);
    return String(valor);
};


/**
 * Bonos y puntos de un conjunto de novedades.
 *
 * La fórmula sale del reglamento, que expresa las proporciones como "3x1" o
 * "1x2": tres alertas por un bono es acumulación 3 con valor 1; una alerta por
 * dos bonos es acumulación 1 con valor 2.
 *
 *     bonos  = piso( cantidad × bonusWorth / accumulationRequired )
 *     puntos = bonos × pointValue
 *
 * El piso es intencional: con acumulación 3 y dos alertas reportadas todavía no
 * hay bono. Las que sobran NO se arrastran a la semana siguiente, igual que en
 * el cálculo anterior.
 *
 * @param {Array}  novelties  novedades del período, cada una con su sello
 * @returns {{groups: Array, totalNovelties: number, totalBonuses: number, totalPoints: number}}
 */
export const calculateBonusTotals = (novelties = []) => {
    const cuentan = novelties.filter(countsForBonus);

    // Agrupado por ALERTA. El titulo se guarda solo para mostrarlo; el que
    // agrupa es el id.
    const porAlerta = new Map();

    for (const novedad of cuentan) {
        const clave = idComoTexto(novedad.menuRef);
        if (!clave) continue;   // sin referencia no hay forma de agrupar

        if (!porAlerta.has(clave)) {
            porAlerta.set(clave, {
                menuRef: clave,
                title: novedad.menu || novedad.title || '',
                regulationCode: novedad.bonus?.regulationCode || '',
                novelties: [],
            });
        }
        porAlerta.get(clave).novelties.push(novedad);
    }

    const groups = [];
    let totalBonuses = 0;
    let totalPoints = 0;
    let totalNovelties = 0;

    for (const grupo of porAlerta.values()) {
        const cantidad = grupo.novelties.length;

        // Las reglas salen del SELLO, no de la alerta: si alguien cambió la
        // configuración esta semana, lo reportado antes conserva la suya. Se
        // toma la del primer sello del grupo y se avisa si no son todas iguales.
        const primero = grupo.novelties[0].bonus;
        const bonusWorth = primero?.bonusWorth ?? 1;
        const accumulationRequired = Math.max(1, primero?.accumulationRequired ?? 1);
        const pointValue = primero?.pointValue ?? 0;

        const reglasMezcladas = grupo.novelties.some(n =>
            n.bonus?.bonusWorth !== bonusWorth
            || n.bonus?.accumulationRequired !== accumulationRequired
            || n.bonus?.pointValue !== pointValue);

        const bonuses = Math.floor((cantidad * bonusWorth) / accumulationRequired);
        const points = Number((bonuses * pointValue).toFixed(2));

        groups.push({
            menuRef: grupo.menuRef,
            title: grupo.title,
            regulationCode: grupo.regulationCode,
            count: cantidad,
            bonusWorth,
            accumulationRequired,
            pointValue,
            bonuses,
            points,
            // Se informa, no se corrige: la regla cambió a mitad del período y
            // quien revise el corte tiene que saberlo para entender el número.
            mixedRules: reglasMezcladas,
        });

        totalBonuses += bonuses;
        totalPoints += points;
        totalNovelties += cantidad;
    }

    groups.sort((a, b) => b.bonuses - a.bonuses || b.count - a.count);

    return {
        groups,
        totalNovelties,
        totalBonuses,
        totalPoints: Number(totalPoints.toFixed(2)),
    };
};
