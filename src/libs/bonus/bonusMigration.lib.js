// ══════════════════════════════════════════════════════════════════════
// TRADUCIR EL SISTEMA VIEJO AL NUEVO
// ══════════════════════════════════════════════════════════════════════
// Vive acá y no dentro del script para poder probarla contra el volcado real de
// la colección antes de escribir una sola alerta. Una traducción que corre una
// vez sobre 348 documentos no se puede depurar después.
//
// De dónde sale cada cosa:
//
//   rulesForBonus.worth      → defaultRule.bonusWorth
//   rulesForBonus.amulative  → defaultRule.accumulationRequired
//   rulesForBonus.forLocal   → el alcance:
//        "Todos" o ausente         → bonifica en todos
//        lista de establecimientos → NO bonifica por defecto, y una excepción
//                                    por cada uno
//
// El NOMBRE del establecimiento que venía copiado se descarta y se guarda solo
// el id. Los datos actuales prueban por qué: el mismo id está como "Yacambu" en
// una alerta y como "La Villa" en otra, porque lo renombraron y las copias
// quedaron viejas.

/** Un número usable, diciendo además si hubo que corregirlo. */
const numeroValido = (valor, minimo, porDefecto) => {
    const n = Number(valor);
    if (!Number.isFinite(n)) {
        return { valor: porDefecto, corregido: valor !== undefined && valor !== null };
    }
    if (n < minimo) return { valor: Math.max(minimo, porDefecto), corregido: true };
    return { valor: n, corregido: false };
};


/**
 * Traduce una alerta del sistema viejo al nuevo.
 *
 * @param {object} doc         el documento tal como está en la colección
 * @param {Function} aObjectId cómo construir un id — se inyecta para poder
 *                             probar sin mongoose delante
 * @returns {{bonusSystem: object, avisos: string[]}}
 */
export const migrateBonusSystem = (doc, aObjectId = (v) => v) => {
    const viejo = doc?.rulesForBonus || {};
    const nuevoParcial = doc?.bonusCalculationRules || {};
    const avisos = [];

    // Si la alerta ya tenía el sistema intermedio configurado, sus valores
    // mandan: son los que alguien tocó más recientemente y a conciencia.
    const worthCrudo = nuevoParcial.defaultRule?.worth ?? viejo.worth;
    const acumCrudo = nuevoParcial.defaultRule?.acum ?? viejo.amulative;

    const worth = numeroValido(worthCrudo, 0, 1);
    const acumulacion = numeroValido(acumCrudo, 1, 1);

    // El alcance sale de forLocal. Solo una LISTA significa "en estos y en
    // ningún otro"; la cadena "Todos" y la ausencia significan lo mismo.
    const forLocal = viejo.forLocal;
    const esListaDeLocales = Array.isArray(forLocal) && forLocal.length > 0;

    const localExceptions = esListaDeLocales
        ? forLocal
            .filter(entrada => entrada?.idLocal)
            .map(entrada => ({
                local: aObjectId(String(entrada.idLocal)),
                bonifies: true,
                bonusWorth: null,
                accumulationRequired: null,
                thresholdParams: null,
                note: 'Migrado del sistema anterior (rulesForBonus.forLocal)',
            }))
        : [];

    if (esListaDeLocales && localExceptions.length !== forLocal.length) {
        avisos.push(`${forLocal.length - localExceptions.length} entrada(s) de forLocal sin idLocal, descartadas`);
    }

    if (typeof forLocal === 'string' && forLocal !== 'Todos') {
        avisos.push(`forLocal traía la cadena ${JSON.stringify(forLocal)}, se interpretó como "todos"`);
    }

    // Valor y acumulación en 0 significa que esa alerta nunca bonificó. Se
    // migra con el sistema APAGADO y no como "bonifica cero": son cosas
    // distintas, y así son 262 alertas —la mayoría del catálogo—.
    const nuncaBonifico = Number(worthCrudo) === 0 && Number(acumCrudo) === 0;
    const isEnabled = nuevoParcial.activate === true ? true : !nuncaBonifico;

    // ── Qué se informa y qué no ───────────────────────────────────────
    // Un 0 corregido a 1 en una alerta que queda APAGADA no le importa a nadie:
    // el valor no se va a usar. Informarlo igual llenaría la lista de revisión
    // con doscientas líneas y escondería las que sí hay que mirar.
    //
    // Un valor NEGATIVO se informa siempre, encendida o apagada: nadie escribe
    // -3 sin querer, así que detrás hay una intención que se perdió y conviene
    // preguntarle a quien la cargó.
    const negativo = (v) => Number.isFinite(Number(v)) && Number(v) < 0;

    if (negativo(worthCrudo)) {
        avisos.push(`valor del bono NEGATIVO (${worthCrudo}) corregido a ${worth.valor}`);
    }
    else if (worth.corregido && isEnabled) {
        avisos.push(`valor del bono ${JSON.stringify(worthCrudo)} corregido a ${worth.valor}`);
    }

    if (negativo(acumCrudo)) {
        avisos.push(`acumulación NEGATIVA (${acumCrudo}) corregida a ${acumulacion.valor}`);
    }
    else if (acumulacion.corregido && isEnabled) {
        avisos.push(`acumulación ${JSON.stringify(acumCrudo)} corregida a ${acumulacion.valor}`);
    }

    return {
        avisos,
        bonusSystem: {
            isEnabled,
            defaultRule: {
                // Con lista de establecimientos, el resto NO bonifica: la lista
                // decía dónde bonificaba, no dónde se apartaba de la regla.
                bonifies: !esListaDeLocales,
                bonusWorth: worth.valor,
                accumulationRequired: acumulacion.valor,
                pointValue: {
                    day: nuevoParcial.defaultRule?.valueBonusForTheStaffOnDuty?.day ?? 0.20,
                    // El campo viejo estaba escrito "nigth".
                    night: nuevoParcial.defaultRule?.valueBonusForTheStaffOnDuty?.nigth ?? 0.30,
                },
                thresholdParams: null,
            },
            franchiseExceptions: [],
            localExceptions,
            regulationCode: nuevoParcial.defaultRule?.reglamentoCode ?? '',
        },
    };
};


/** ¿Este documento ya está migrado? */
export const isAlreadyMigrated = (doc) =>
    Boolean(doc?.bonusSystem) && !doc?.rulesForBonus && !doc?.bonusCalculationRules;
