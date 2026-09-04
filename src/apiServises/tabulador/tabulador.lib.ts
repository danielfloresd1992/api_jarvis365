// ══════════════════════════════════════════════════════════════════════
// LAS TARIFAS DE UN CARGO
// ══════════════════════════════════════════════════════════════════════
// Las nueve columnas que la hoja TABULADOR calcula a partir de cuatro
// numeros. Viven aqui, en una funcion pura, y no como virtuales del modelo,
// por una razon concreta: las rutas leen con `.lean()` —como todo el modulo
// de bonos— y un documento lean NO trae virtuales. Con la funcion, el mismo
// calculo sirve para un documento, para un objeto plano y para una prueba
// sin levantar Mongoose.
//
// Cuando exista el calculo de nomina, es esta funcion la que tiene que usar:
// asi el tabulador que se ve en pantalla y el que paga son el mismo numero.


/** Cuantos dias tiene el mes a efectos de tarifa. Es el 30 de la hoja. */
export const DAYS_PER_MONTH = 30;

/** Horas de una jornada. HORA = dia laborado / 8. */
export const HOURS_PER_DAY = 8;

/** DIA EXTRA = dia laborado x 1,5. */
export const EXTRA_DAY_FACTOR = 1.5;

/** FERIADO DOMINGO = dia laborado / 2. */
export const HOLIDAY_FACTOR = 0.5;

/** PUNTUALIDAD = 30 % del dia laborado (lunes a viernes) o del dia extra (fin de semana). */
export const PUNCTUALITY_FACTOR = 0.3;


/** Lo que hace falta leer de un cargo para calcular sus tarifas. */
export interface TabuladorFigures {
    monthlyBasePackage: number;
    fullPackage: number;
    complementaryBonus: number;
    zeroMarginOverride?: number | null;
}


/** Las nueve columnas calculadas, con el nombre del encabezado de la hoja traducido. */
export interface TabuladorRates {
    /** DIA LABORADO PAQUETE COMPLETO = M / 30 */
    fullDayRate: number;
    /** DIA LABORADO PAQUETE BASE = K / 30 */
    baseDayRate: number;
    /** FERIADO DOMINGO = E / 2 */
    holidayRate: number;
    /** DIA EXTRA = E x 1,5 */
    extraDayRate: number;
    /** HORA = E / 8 */
    hourRate: number;
    /** PUNTUALIDAD LUNES A VIERNES = E x 0,3 */
    weekdayPunctuality: number;
    /** PUNTUALIDAD FIN DE SEMANA = D x 0,3 */
    weekendPunctuality: number;
    /** MARGEN "0" = M - K, salvo que este tecleado a mano */
    zeroMargin: number;
    /** TOTAL SALARIO = K + L + N */
    totalSalary: number;
}


/**
 * Las tarifas de un cargo. Misma formula que la hoja, celda por celda.
 *
 * `zeroMarginOverride` existe por una sola fila de la hoja (RRHH, 130 en vez
 * de 100). Con `null` —lo normal— el margen sale de la resta.
 */
export function ratesOf(p: TabuladorFigures): TabuladorRates {
    const fullDayRate = p.fullPackage / DAYS_PER_MONTH;
    const extraDayRate = fullDayRate * EXTRA_DAY_FACTOR;
    const zeroMargin = p.zeroMarginOverride ?? (p.fullPackage - p.monthlyBasePackage);

    return {
        fullDayRate,
        baseDayRate: p.monthlyBasePackage / DAYS_PER_MONTH,
        holidayRate: fullDayRate * HOLIDAY_FACTOR,
        extraDayRate,
        hourRate: fullDayRate / HOURS_PER_DAY,
        weekdayPunctuality: fullDayRate * PUNCTUALITY_FACTOR,
        weekendPunctuality: extraDayRate * PUNCTUALITY_FACTOR,
        zeroMargin,
        totalSalary: p.monthlyBasePackage + zeroMargin + p.complementaryBonus,
    };
}


/**
 * Un cargo con sus tarifas pegadas, listo para responder. Es lo que devuelven
 * todas las rutas: el front lee las tarifas como columnas y no tiene por que
 * saber la formula.
 */
export function withRates<T extends TabuladorFigures>(p: T): T & TabuladorRates {
    return { ...p, ...ratesOf(p) };
}
