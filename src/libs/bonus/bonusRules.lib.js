// ══════════════════════════════════════════════════════════════════════
// RESOLVER LA BONIFICACIÓN DE UNA ALERTA EN UN ESTABLECIMIENTO
// ══════════════════════════════════════════════════════════════════════
// El sistema de bonificación de una alerta (`Menu.bonusSystem`) se lee en tres
// capas, de la más general a la más específica:
//
//     defaultRule          lo que pasa en CUALQUIER establecimiento
//     franchiseExceptions  excepciones por marca
//     localExceptions      excepciones de un establecimiento concreto
//
// Gana la más específica, y SOLO en los campos que declara: una excepción que
// cambia la acumulación no tiene que repetir el valor del bono.
//
//
// POR QUÉ CAPAS Y NO UNA LISTA DE ESTABLECIMIENTOS
//
// El reglamento dice "SOLO FRANCISCAS" diecinueve veces, no tres nombres. Con
// una lista de ids, el día que abre una Francisca nueva la alerta deja de
// bonificar ahí y nadie se entera: no falla nada, simplemente no se cuenta.
//
// Con capas, un establecimiento nuevo entra por `defaultRule` sin que nadie lo
// agregue, y la lista de excepciones dice en qué se APARTA de la regla general
// —que es la información que de verdad hay que mantener.

/** De qué capa salió la regla que terminó aplicando. */
export const BONUS_SOURCE = {
    DISABLED: 'disabled',     // el sistema está apagado para esta alerta
    DEFAULT: 'default',       // la regla general
    FRANCHISE: 'franchise',   // una excepción por marca
    LOCAL: 'local',           // una excepción de este establecimiento
};

/** Turnos con valor de punto propio. El reglamento paga más el nocturno. */
export const WORK_SHIFT = {
    DAY: 'day',
    NIGHT: 'night',
};


/**
 * Id de un campo que puede venir como ObjectId, como string o poblado.
 * Se compara siempre en texto: mezclar tipos es la forma silenciosa de que una
 * excepción perfectamente cargada no encuentre nunca su establecimiento.
 */
const idComoTexto = (valor) => {
    if (!valor) return '';
    if (typeof valor === 'string') return valor;
    if (valor._id) return String(valor._id);
    return String(valor);
};


/**
 * La franquicia de un establecimiento.
 *
 * Se mira `franchiseReference.franchise`, que es la referencia vigente. El
 * campo `franchise` suelto del modelo está marcado como deprecado y guarda
 * texto, no una referencia.
 */
export const franchiseIdOfLocal = (local) =>
    idComoTexto(local?.franchiseReference?.franchise);


/**
 * Resuelve qué bonificación aplica a esta alerta en este establecimiento.
 *
 * NUNCA devuelve null. Cuando no bonifica lo dice con `appliesBonus: false` y
 * explica por qué en `appliedFrom`: hace falta poder distinguir "el sistema
 * está apagado" de "este establecimiento está excluido a propósito".
 *
 * @param {object} menu      documento de Menu (o solo su bonusSystem)
 * @param {object} local     documento de Local
 * @param {string} workShift 'day' | 'night' — turno del operador que reporta
 */
export const resolveBonusForLocal = (menu, local, workShift = WORK_SHIFT.DAY) => {
    const sistema = menu?.bonusSystem;

    if (!sistema?.isEnabled) {
        return { appliesBonus: false, appliedFrom: BONUS_SOURCE.DISABLED };
    }

    const localId = idComoTexto(local?._id ?? local);
    const franchiseId = franchiseIdOfLocal(local);

    const excepcionDeLocal = (sistema.localExceptions || [])
        .find(regla => idComoTexto(regla.local) === localId && localId);

    const excepcionDeMarca = (sistema.franchiseExceptions || [])
        .find(regla => idComoTexto(regla.franchise) === franchiseId && franchiseId);

    /**
     * Un campo, buscándolo de la capa más específica a la más general.
     *
     * Va con `??` y no con `||`: un valor de bono en 0 y un `bonifies` en false
     * son valores legítimos, no ausencias. Con `||` los dos se caerían a la
     * capa de arriba y la excepción no serviría para nada.
     */
    const campo = (nombre) =>
        excepcionDeLocal?.[nombre]
        ?? excepcionDeMarca?.[nombre]
        ?? sistema.defaultRule?.[nombre];

    const capaQueGana =
        excepcionDeLocal ? BONUS_SOURCE.LOCAL
            : excepcionDeMarca ? BONUS_SOURCE.FRANCHISE
                : BONUS_SOURCE.DEFAULT;

    if (campo('bonifies') !== true) {
        return { appliesBonus: false, appliedFrom: capaQueGana };
    }

    const valores = sistema.defaultRule?.pointValue || {};
    const pointValue = workShift === WORK_SHIFT.NIGHT
        ? (valores.night ?? 0.30)
        : (valores.day ?? 0.20);

    return {
        appliesBonus: true,
        appliedFrom: capaQueGana,
        bonusWorth: campo('bonusWorth') ?? 1,
        // Mínimo 1: es divisor en el cálculo del corte. Un 0 daría infinito y
        // un negativo, bonos negativos.
        accumulationRequired: Math.max(1, campo('accumulationRequired') ?? 1),
        thresholdParams: campo('thresholdParams') ?? null,
        pointValue,
        workShift,
        regulationCode: sistema.regulationCode || '',
    };
};


/**
 * ¿Esta alerta bonifica en algún lado?
 *
 * Sirve para la lista de alertas, que necesita el dato sin tener un
 * establecimiento delante.
 */
export const bonusIsActive = (menu) => Boolean(menu?.bonusSystem?.isEnabled);


/**
 * Cuántas excepciones tiene cargadas. Es lo que distingue "bonifica igual en
 * todos lados" de "hay que mirar caso por caso".
 */
export const countBonusExceptions = (menu) => ({
    franchises: menu?.bonusSystem?.franchiseExceptions?.length || 0,
    locals: menu?.bonusSystem?.localExceptions?.length || 0,
});


/** Número dentro de un rango, o el valor por defecto si no es un número. */
const numeroEntre = (valor, minimo, porDefecto) => {
    const n = Number(valor);
    if (!Number.isFinite(n)) return porDefecto;
    return Math.max(minimo, n);
};


/**
 * Deja un `bonusSystem` que llega del cliente con la forma exacta del modelo.
 *
 * La usan el alta y la edición para construir lo MISMO. Antes cada una armaba
 * su objeto por su cuenta y terminaron guardando cosas distintas: el sistema
 * viejo tenía catorce acumulaciones negativas y dos valores de bono negativos,
 * que ninguna validación frenó.
 *
 * Devuelve `undefined` cuando no viene nada, para que un guardado que no toca
 * la bonificación no la pise con valores por defecto.
 */
export const normalizeBonusSystem = (entrada) => {
    if (!entrada || typeof entrada !== 'object') return undefined;

    const regla = entrada.defaultRule || {};
    const valores = regla.pointValue || {};

    const excepcion = (fuente, claveDeReferencia) => ({
        [claveDeReferencia]: fuente[claveDeReferencia],
        // null explícito = hereda. No se normaliza a un número porque la
        // ausencia es información: dice "en esto no me aparto".
        bonifies: typeof fuente.bonifies === 'boolean' ? fuente.bonifies : null,
        bonusWorth: fuente.bonusWorth === null || fuente.bonusWorth === undefined
            ? null : numeroEntre(fuente.bonusWorth, 0, null),
        accumulationRequired: fuente.accumulationRequired === null || fuente.accumulationRequired === undefined
            ? null : numeroEntre(fuente.accumulationRequired, 1, null),
        thresholdParams: fuente.thresholdParams ?? null,
        note: String(fuente.note || '').trim(),
    });

    return {
        isEnabled: entrada.isEnabled === true,

        defaultRule: {
            bonifies: regla.bonifies !== false,
            bonusWorth: numeroEntre(regla.bonusWorth, 0, 1),
            // Mínimo 1: es divisor en el corte.
            accumulationRequired: numeroEntre(regla.accumulationRequired, 1, 1),
            pointValue: {
                day: numeroEntre(valores.day, 0, 0.20),
                night: numeroEntre(valores.night, 0, 0.30),
            },
            thresholdParams: regla.thresholdParams ?? null,
        },

        franchiseExceptions: (Array.isArray(entrada.franchiseExceptions) ? entrada.franchiseExceptions : [])
            .filter(r => r?.franchise)
            .map(r => excepcion(r, 'franchise')),

        localExceptions: (Array.isArray(entrada.localExceptions) ? entrada.localExceptions : [])
            .filter(r => r?.local)
            .map(r => excepcion(r, 'local')),

        regulationCode: String(entrada.regulationCode || '').trim(),
    };
};
