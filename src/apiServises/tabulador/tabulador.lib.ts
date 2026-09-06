// ══════════════════════════════════════════════════════════════════════
// LAS TARIFAS DE UN CARGO
// ══════════════════════════════════════════════════════════════════════
// Las nueve columnas que la hoja TABULADOR calcula a partir de cuatro
// numeros, mas la quincena del salario base, que sale de otra hoja pero se
// deriva igual. Viven aqui, en una funcion pura, y no como virtuales del
// modelo, por una razon concreta: las rutas leen con `.lean()` —como todo el
// modulo de bonos— y un documento lean NO trae virtuales. Con la funcion, el
// mismo calculo sirve para un documento, para un objeto plano y para una
// prueba sin levantar Mongoose.
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

/** El salario base se paga en dos veces al mes: son las dos quincenas de la hoja NOMINA 30-SM. */
export const PAY_PERIODS_PER_MONTH = 2;

/**
 * Salario minimo vigente, en BOLIVARES. No es una constante de negocio sino un
 * respaldo: el salario base es del cargo y se guarda con el, pero los cargos
 * cargados antes de que el campo existiera no lo traen.
 */
export const DEFAULT_BASE_SALARY_BS = 130;


/** Lo que hace falta leer de un cargo para calcular sus tarifas. */
export interface TabuladorFigures {
    monthlyBasePackage: number;
    fullPackage: number;
    complementaryBonus: number;
    zeroMarginOverride?: number | null;
    /** En BOLIVARES, no en dolares como el resto. Opcional: ver DEFAULT_BASE_SALARY_BS. */
    baseSalaryBs?: number;
}


/**
 * Lo calculado, con el nombre del encabezado de la hoja traducido: las nueve
 * columnas en dolares de la hoja TABULADOR y, al final, la quincena en
 * bolivares, que es la unica que no sale de esa hoja.
 */
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
    /**
     * QUINCENA DEL SALARIO BASE, en BOLIVARES. Unica tarifa que no viene de una
     * celda de la hoja TABULADOR: sale de la columna "MONTO EN BOLIVARES" de la
     * hoja NOMINA 30-SM, que reparte el salario base del cargo en los dos pagos
     * del mes.
     */
    halfMonthBaseSalaryBs: number;
}


/**
 * Las tarifas de un cargo. Misma formula que la hoja, celda por celda.
 *
 * `zeroMarginOverride` existe por una sola fila de la hoja (RRHH, 130 en vez
 * de 100). Con `null` —lo normal— el margen sale de la resta.
 *
 * La decima cifra, la quincena del salario base, no es de esta hoja ni esta en
 * dolares: es el salario base del cargo partido entre los dos pagos del mes.
 */
export function ratesOf(p: TabuladorFigures): TabuladorRates {
    const fullDayRate = p.fullPackage / DAYS_PER_MONTH;
    const extraDayRate = fullDayRate * EXTRA_DAY_FACTOR;
    const zeroMargin = p.zeroMarginOverride ?? (p.fullPackage - p.monthlyBasePackage);

    // Los cargos que ya estan en Mongo se guardaron sin el campo, y dividir
    // undefined da NaN: la respuesta entera saldria envenenada por un dato que
    // hoy es el mismo para todos. El respaldo no inventa un salario, repone el
    // minimo vigente hasta que el cargo se guarde de nuevo.
    const baseSalaryBs = p.baseSalaryBs ?? DEFAULT_BASE_SALARY_BS;

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
        halfMonthBaseSalaryBs: baseSalaryBs / PAY_PERIODS_PER_MONTH,
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
