import { ratesOf, PAY_PERIODS_PER_MONTH, type TabuladorFigures, type TabuladorRates } from '../tabulador/tabulador.lib.js';
import { CUT_KINDS, type CutKind } from './nomina.model.js';

// ══════════════════════════════════════════════════════════════════════
// LO QUE SE LE PAGA A UNA FILA, CORTE POR CORTE
// ══════════════════════════════════════════════════════════════════════
// Funciones puras y no metodos del modelo, por la misma razon que `ratesOf`:
// las rutas leen con `.lean()` y un lean no trae virtuales ni metodos, asi que
// el mismo calculo sirve para un documento, para un objeto plano y para una
// prueba sin levantar Mongoose.
//
//
// LOS CUATRO CORTES REPARTEN EL TOTAL SALARIO
//
// En el tabulador, TOTAL SALARIO = paquete base + margen "0" + bono
// complementario. Aqui cada corte paga su parte:
//
//   quincena1   paquete base / pagos del mes
//   quincena2   paquete base / pagos del mes
//   bono        el bono complementario del cargo, entero
//   margen0     el margen "0" del cargo, entero
//
// Sumados, sin novedades ni descuentos, dan el total salario. Esa igualdad es
// LA comprobacion de que el reparto esta bien, y hay una prueba que la fija:
// si alguna vez deja de cumplirse, el error esta aqui y no en la hoja.
//
//
// LAS NOVEDADES SOLO EXISTEN EN LAS QUINCENAS
//
// Domingos, dias adicionales y horas extras son dias trabajados, y se trabajan
// dentro de una quincena. `margen0` y `bono` son cifras del cargo que se pagan
// una vez al mes: lo unico que se les teclea es el descuento. Por eso sus tres
// conteos salen siempre en cero, y no porque nadie los haya llenado.
//
//
// LAS TARIFAS NO SE RECALCULAN AQUI
//
// Salen de `ratesOf`, la formula del tabulador, aplicada al SELLO que el mes
// guarda de cada persona. Asi el mes usa las cifras del dia en que se creo
// pero la misma formula que la pantalla del tabulador, y el dia que haya que
// corregir la formula se corrige en un solo sitio. Por eso el sello copia las
// cifras tecleadas del cargo y no las tarifas ya resueltas.
//
//
// LAS TRES CORRESPONDENCIAS CON LA HOJA
//
//   domingos y feriados = TABULADOR columna C (FERIADO DOMINGO) por Nº
//   dia adicional       = TABULADOR columna E (DIA LABORADO PAQ. COMPLETO) por Nº
//   horas extras        = TABULADOR columna H (HORA EXTRA) por Nº
//
//
// EL TOTAL PUEDE QUEDAR NEGATIVO Y NO SE RECORTA
//
// En la hoja real hay once personas cuyas deducciones superan lo devengado.
// Llevarlas a cero seria perdonar una deuda que la hoja no perdona, y ademas
// esconderia el caso justo donde hay que mirar. El negativo sale tal cual y
// que lo resuelva quien liquida.


/** Lo que hace falta leer del sello de un cargo para pagar una fila. */
export interface NominaPositionFigures extends TabuladorFigures {
    /** HORA EXTRA en dolares: la unica tarifa que se teclea y no se deriva. */
    overtimeHourRate: number;
}


/**
 * Las partidas y el total, EN DOLARES.
 *
 * `NominaAmounts` es lo que se firma al cerrar; `NominaAmountsWithBs` es lo
 * que sale por la API, con la conversion del momento pegada encima.
 */
export interface NominaAmounts {
    /**
     * Lo que el cargo aporta a este corte: la parte del paquete base en las
     * quincenas, el margen "0" en `margen0` y el bono en `bono`. Un solo campo
     * y no tres porque los tres son lo mismo —lo que el tabulador pone antes
     * de novedades y descuentos— y separarlos obligaria a mirar el tipo del
     * corte para saber cual de los tres leer.
     */
    fromPosition: number;
    sundays: number;
    additionalDays: number;
    overtimeHours: number;
    amountUsd: number;
}


export type NominaAmountsWithBs = NominaAmounts & { amountBs: number };


/**
 * Lo que hace falta leer de una fila. Los conteos van opcionales porque una
 * prueba arma la fila a mano con lo que le importa; en la base el modelo los
 * pone en cero.
 */
export interface NominaRowFigures {
    sundays?: number;
    additionalDays?: number;
    overtimeHours?: number;
    zeroMarginDeduction?: number;
    otherDeductions?: number;
    /** Los montos del cierre. Si estan, mandan ellos: ver `withAmounts`. */
    settled?: NominaAmounts | null;
}


/** Los totales de un corte, para no sumarlos en el front columna por columna. */
export interface NominaTotals {
    /** Lo que suma en dolares. Las filas negativas restan, a proposito. */
    amountUsd: number;
    /** El mismo total a la tasa vigente. */
    amountBs: number;
    /** Cuanta gente entra. */
    people: number;
}


/** El tramo que cubre un corte. Se DERIVA, no se guarda. */
export interface CutDates {
    /** 'AAAA-MM-DD'. Sin hora, que es como lo lee y lo muestra el front. */
    from: string;
    to: string;
}


/**
 * Los cuatro cortes con el nombre con el que se muestran.
 *
 * Vive aqui y no en el front para que el orden y las etiquetas sean del
 * servidor: los cuatro son la estructura del mes, no una decision de pantalla.
 */
export const CUT_LABELS: Record<CutKind, string> = {
    quincena1: '1ª quincena',
    quincena2: '2ª quincena',
    margen0: 'Margen "0"',
    bono: 'Bono complementario',
};


/** Los meses en español, para armar el titulo. Con el nombre y no con el
 *  numero porque el titulo se lee en pantalla: "Agosto 2026", no "2026-08". */
export const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;


/**
 * Como se llama un mes de nomina.
 *
 * Lo arma el SERVIDOR y no lo manda el cliente: un titulo tecleado aparte
 * podria decir "Agosto" en un documento cuyo `month` es 9, y a partir de ahi
 * la lista y el dato dirian cosas distintas sin que nada fallara.
 */
export const titleOf = (year: number, month: number): string =>
    `${MONTH_NAMES[month - 1]} ${year}`;


/**
 * El ultimo dia del mes, del calendario y no de una tabla: el dia 0 del mes
 * siguiente.
 *
 * En UTC porque las fechas de la API viajan sin hora, y en un huso negativo un
 * `new Date(anio, mes, 0)` local puede caer en el dia anterior.
 */
export const lastDayOf = (year: number, month: number): number =>
    new Date(Date.UTC(year, month, 0)).getUTCDate();


/** 'AAAA-MM-DD' armado con aritmetica de texto, sin pasar por Date. */
const asDate = (year: number, month: number, day: number): string =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;


/**
 * El tramo de un corte.
 *
 * `margen0` y `bono` cubren el mes entero porque no son un tramo trabajado:
 * son cifras del cargo que se pagan una vez al mes. Darles del 1 al fin dice
 * eso, y dejarlas sin fechas obligaria a que cada pantalla decidiera que poner
 * en ese hueco.
 */
export function datesOfCut(year: number, month: number, kind: CutKind): CutDates {
    const last = lastDayOf(year, month);

    if (kind === 'quincena1') return { from: asDate(year, month, 1), to: asDate(year, month, 15) };
    if (kind === 'quincena2') return { from: asDate(year, month, 16), to: asDate(year, month, last) };

    return { from: asDate(year, month, 1), to: asDate(year, month, last) };
}


/**
 * LO QUE EL CARGO APORTA A UN CORTE, antes de novedades y descuentos.
 *
 * Es el reparto del total salario, y por eso esta en una sola funcion: si
 * alguna vez hay que cambiar como se reparte, se cambia aqui y las cuatro
 * cuentas siguen sumando lo mismo.
 */
export function positionAmount(
    kind: CutKind,
    position: NominaPositionFigures,
    rates: TabuladorRates,
    payPeriodsPerMonth: number,
): number {
    switch (kind) {
        // El paquete base repartido en los pagos del mes, que es lo que hace
        // la hoja al partir la quincena.
        case 'quincena1':
        case 'quincena2':
            return position.monthlyBasePackage / payPeriodsPerMonth;

        // MARGEN "0" = paquete completo - paquete base, salvo que el cargo lo
        // traiga tecleado a mano. Sale de `ratesOf` y no de la resta hecha
        // aqui, para que ese caso a mano no se pierda por el camino.
        case 'margen0':
            return rates.zeroMargin;

        case 'bono':
            return position.complementaryBonus;
    }
}


/** Una fila que no cobra: sin cargo no hay tarifa de donde sacar nada. */
const EN_CERO = (): NominaAmounts => ({
    fromPosition: 0,
    sundays: 0,
    additionalDays: 0,
    overtimeHours: 0,
    amountUsd: 0,
});


/**
 * La conversion, en un solo sitio.
 *
 * Se exporta porque tambien la necesita el PUT de una fila, que responde los
 * montos de una sola persona sin pasar por `withAmounts`. Repetir la
 * multiplicacion alla dejaria dos lugares donde el bolivar nace, y el dia que
 * haya que redondearlo se corregiria uno solo.
 */
export const withBs = (amounts: NominaAmounts, exchangeRate: number): NominaAmountsWithBs => ({
    ...amounts,
    amountBs: amounts.amountUsd * exchangeRate,
});


/**
 * Lo que se le paga a una fila, segun el tipo de corte y el sello de su
 * persona.
 *
 * Sin cargo devuelve todo en cero, incluidos los descuentos: una persona sin
 * cargo no tiene de que deducir, y cobrarle un descuento sobre un sueldo que
 * el sistema no sabe calcular seria inventar una deuda.
 */
export function rowAmounts(
    kind: CutKind,
    row: NominaRowFigures,
    position: NominaPositionFigures | null | undefined,
    payPeriodsPerMonth?: number,
): NominaAmounts {
    if (!position) return EN_CERO();

    const rates = ratesOf(position);

    // Un mes sin el campo, armado a mano o guardado antes de que existiera,
    // dividiria entre undefined y dejaria la fila entera en NaN. El respaldo no
    // inventa una politica de pago: repone la que ya usa el tabulador.
    const pagosDelMes = payPeriodsPerMonth ?? PAY_PERIODS_PER_MONTH;

    const fromPosition = positionAmount(kind, position, rates, pagosDelMes);
    const otherDeductions = row.otherDeductions ?? 0;

    // MARGEN "0" Y BONO NO LLEVAN CONTEOS. Lo unico que se les teclea es el
    // descuento, que es justo lo que tiene la hoja MARGEN 0 Y BONIFICACION: el
    // monto, un descuento y el resultado. Si llegaran conteos —yup no los deja
    // pasar— ignorarlos aqui es lo correcto: pagarian dias trabajados en un
    // corte que no cubre dias.
    if (kind === 'margen0' || kind === 'bono') {
        return {
            fromPosition,
            sundays: 0,
            additionalDays: 0,
            overtimeHours: 0,
            amountUsd: fromPosition - otherDeductions,
        };
    }

    const sundays = rates.holidayRate * (row.sundays ?? 0);
    const additionalDays = rates.fullDayRate * (row.additionalDays ?? 0);
    const overtimeHours = position.overtimeHourRate * (row.overtimeHours ?? 0);

    return {
        fromPosition,
        sundays,
        additionalDays,
        overtimeHours,
        amountUsd: fromPosition + sundays + additionalDays + overtimeHours
            - (row.zeroMarginDeduction ?? 0)
            - otherDeductions,
    };
}


const sumar = (rows: Array<{ amounts: NominaAmountsWithBs }>): NominaTotals =>
    rows.reduce((suma, row) => ({
        amountUsd: suma.amountUsd + row.amounts.amountUsd,
        amountBs: suma.amountBs + row.amounts.amountBs,
        people: suma.people + 1,
    }), { amountUsd: 0, amountBs: 0, people: 0 });


/** Lo minimo que `withAmounts` necesita de una persona del mes. */
interface PersonFigures {
    user: unknown;
    position?: NominaPositionFigures | null;
}

/** Lo minimo que necesita de un corte. */
interface CutFigures {
    kind: CutKind;
    status?: string;
    rows?: Array<NominaRowFigures & { user?: unknown }>;
}


/**
 * El mes con los montos de cada fila, los totales de cada corte y el total del
 * mes, listo para responder.
 *
 * Una fila con `settled` NO recalcula sus DOLARES: ese es todo el punto del
 * cierre. Lo pagado responde por si mismo aunque hoy la formula o el tabulador
 * digan otra cosa; si se recalculara, un corte de enero cambiaria de monto
 * cada vez que alguien lo abre.
 *
 * LOS BOLIVARES SI SE REHACEN SIEMPRE, venga el dolar de `settled` o del
 * calculo. Un corte cerrado dice los mismos dolares y otros bolivares cada
 * dia, porque eso es lo que hace el bolivar: el dolar es lo que se pacto y lo
 * unico que se firma. Guardar tambien la conversion habria congelado una foto
 * de la tasa dentro de cada fila, y la pregunta "a que tasa se pago enero" se
 * responde con el historial del recurso de la tasa, no con ciento y pico de
 * copias del mismo numero.
 *
 * La tasa entra por parametro y no se lee aqui adentro: esto es una funcion
 * pura que corre en las pruebas sin Mongoose, y ademas la ruta de la lista
 * pide la tasa una sola vez para todos los meses.
 */
export function withAmounts<
    T extends {
        year: number;
        month: number;
        payPeriodsPerMonth?: number;
        people?: PersonFigures[];
        cuts?: CutFigures[];
    },
>(month: T, exchangeRate: number) {
    // El sello se busca por persona y los cuatro cortes lo comparten: ese es
    // el motivo de que `people` viva al nivel del mes.
    const sello = new Map<string, NominaPositionFigures | null>(
        (month.people ?? []).map(p => [String(p.user), p.position ?? null]),
    );

    // SIEMPRE LOS CUATRO Y EN SU ORDEN, aunque el documento los traiga
    // desordenados o le falte alguno: la pantalla los apila, y un corte que
    // aparece y desaparece segun como se guardo seria imposible de leer.
    const guardados = new Map((month.cuts ?? []).map(c => [c.kind, c]));

    const cuts = CUT_KINDS.map(kind => {
        const corte = guardados.get(kind);

        const rows = (corte?.rows ?? []).map(row => ({
            ...row,
            amounts: withBs(
                row.settled ?? rowAmounts(kind, row, sello.get(String(row.user)), month.payPeriodsPerMonth),
                exchangeRate,
            ),
        }));

        return {
            ...corte,
            kind,
            label: CUT_LABELS[kind],
            ...datesOfCut(month.year, month.month, kind),
            status: corte?.status ?? 'abierto',
            rows,
            totals: sumar(rows),
        };
    });

    // El total del mes es la SUMA de los cuatro y no una cuenta aparte: dos
    // formulas para el mismo numero pueden discrepar, y el dia que discrepen la
    // primera sospecha caeria sobre las cifras y no sobre la suma.
    const totals: NominaTotals = {
        amountUsd: cuts.reduce((s, c) => s + c.totals.amountUsd, 0),
        amountBs: cuts.reduce((s, c) => s + c.totals.amountBs, 0),
        people: (month.people ?? []).length,
    };

    // `currentExchangeRate` y no `exchangeRate`: el corte tuvo un campo con ese
    // nombre y se borro. Reusarlo aqui haria que un dato de lectura se leyera
    // como uno guardado, que es exactamente la confusion que el cambio vino a
    // quitar; con este nombre queda dicho que es la tasa de AHORA.
    return {
        ...month,
        cuts,
        totals,
        // El mes esta cerrado cuando lo estan los cuatro. Se deduce y no se
        // guarda: un campo aparte podria decir que si con un corte abierto.
        status: cuts.every(c => c.status === 'cerrado') ? 'cerrado' : 'abierto',
        currentExchangeRate: exchangeRate,
    };
}
