import { Schema, model, Types } from 'mongoose';

// Solo por el efecto de REGISTRAR los modelos a los que apuntan los `ref` de
// mas abajo. Mongoose los busca por nombre al poblar, asi que un script que
// importe solo este archivo y haga un populate moriria con MissingSchemaError
// apuntando a un modelo que si existe, nada mas que nadie lo cargo.
import '../user/user.model.js';
import '../tabulador/tabulador.model.js';

// ══════════════════════════════════════════════════════════════════════
// LA NOMINA: UN MES, CUATRO CORTES
// ══════════════════════════════════════════════════════════════════════
// Un documento es un MES, y adentro lleva los CUATRO cortes con los que se
// paga ese mes:
//
//   quincena1   del 1 al 15    reparte el paquete base
//   quincena2   del 16 al fin  reparte la otra mitad del paquete base
//   bono        el mes entero  paga el BONO COMPLEMENTARIO del cargo
//   margen0     el mes entero  paga el MARGEN "0" del cargo
//
// NO ES UNA DECISION DE PRESENTACION, ES LA ARITMETICA DEL TABULADOR. Alli
// TOTAL SALARIO = paquete base + margen "0" + bono complementario. Las dos
// quincenas reparten el primer sumando y los otros dos cortes pagan los otros
// dos. Los cuatro juntos, sin novedades ni descuentos, tienen que dar el total
// salario del cargo; si no dan, algo esta mal, y hay una prueba que lo fija.
//
// Es tambien como esta en el Excel del que sale todo esto: NOMINA 15, NOMINA
// 30 y una tercera hoja, MARGEN 0 Y BONIFICACION, con sus propias columnas.
//
//
// POR QUE EL MES Y NO CUATRO DOCUMENTOS SUELTOS
//
// Porque el SELLO del tabulador es del mes. Lo que gana una persona en agosto
// se decide una vez, y los cuatro cortes reparten ese mismo numero: si cada
// corte guardara su copia, subir un paquete a mitad de mes dejaria dos
// quincenas selladas con cifras distintas y el total del mes ya no cuadraria
// contra el tabulador. Por eso `people` vive al nivel del mes, una entrada por
// persona, y los cortes solo guardan lo que se les teclea.
//
//
// CADA CORTE SE CIERRA POR SU CUENTA
//
// Se pagan en fechas distintas —la primera quincena el 15, el bono cuando
// toque— asi que cada uno se firma cuando se paga. Cerrar la primera quincena
// no toca a las otras tres. El mes esta cerrado cuando lo estan los cuatro, y
// eso se DEDUCE, no se guarda: un campo aparte podria decir que si mientras un
// corte sigue abierto.
//
//
// LA TASA NO SE SELLA, Y ES A PROPOSITO
//
// Ningun corte guarda la tasa de cambio. El dolar es la moneda de registro —el
// tabulador esta en dolares y en dolares se decide lo que cobra cada uno— y el
// bolivar es una conversion de presentacion que cambia todos los dias. La tasa
// es una variable global del sistema (apiServises/exchangeRate) y los
// bolivares se derivan al LEER, con la vigente en ese momento.
//
// Guardar una copia aqui daria dos fuentes para el mismo numero y, el dia que
// discrepen, nadie sabria cual mando. "A que tasa se pago el corte de enero"
// se responde cruzando su `closedAt` contra el historial de ese recurso, que
// es donde queda el rastro dia por dia.
//
//
// LO QUE SE GUARDA Y LO QUE SE DERIVA
//
// Mientras un corte esta ABIERTO no se guarda ningun monto: salen al vuelo de
// `rowAmounts` (nomina.lib.ts) cada vez que se lee, asi corregir tres domingos
// no obliga a recalcular nada a mano. Al CERRARLO se escriben en `settled` LOS
// DOLARES, y ahi si son dato: un corte pagado tiene que responder por el
// numero exacto que se pago, aunque despues cambien las constantes de la
// formula. Los bolivares no entran ahi ni al cerrar.
//
// Tampoco se guardan las FECHAS de cada corte. Salen de `year`, `month` y el
// tipo de corte, y el ultimo dia lo pone el calendario (ver `datesOfCut` en
// nomina.lib.ts). Guardarlas seria un segundo sitio donde pueden quedar mal, y
// un corte que dice ser la primera quincena y guarda del 1 al 20 no tiene
// arreglo automatico.
//
// Como en el tabulador, no hay virtuales: las rutas leen con `.lean()` y un
// lean no trae virtuales, asi que los montos se pegan en la ruta con
// `withAmounts`.


/**
 * Los cuatro cortes de un mes, EN EL ORDEN EN QUE SE MUESTRAN.
 *
 * Es el orden del documento con el que trabaja el cliente: primera quincena,
 * segunda quincena, bono complementario y margen «0». Vive aqui y no en el
 * front porque la respuesta ya sale ordenada y las columnas de la pantalla se
 * pintan recorriendola: si cada lado tuviera su orden, el encabezado y las
 * celdas podrian desalinearse sin que nada fallara.
 */
export const CUT_KINDS = ['quincena1', 'quincena2', 'bono', 'margen0'] as const;

export type CutKind = (typeof CUT_KINDS)[number];


/**
 * El sello del cargo: las cifras TECLEADAS del tabulador, no las tarifas ya
 * resueltas.
 *
 * Se copian las de entrada y no las nueve calculadas porque `ratesOf` es la
 * formula y vive en un solo sitio: el dia que haya que corregirla se corrige
 * alli, y el mes viejo sigue usando SUS cifras con la formula buena. Guardar
 * las tarifas resueltas congelaria tambien los errores de la formula.
 *
 * Va con `{ _id: false }`, como los subesquemas de user.model.js: un sello no
 * se direcciona por si mismo, se llega a el por la persona que lo contiene.
 */
export interface NominaPositionSeal {
    /** De que cargo se copio. Referencia para rastrear, no para leer cifras. */
    tabuladorPosition: Types.ObjectId | null;

    /** Como se llamaba el cargo ese mes. */
    name: string;

    monthlyBasePackage: number;

    fullPackage: number;

    complementaryBonus: number;

    /** HORA EXTRA en dolares: la unica tarifa que se teclea y no se deriva. */
    overtimeHourRate: number;

    /** El margen "0" a mano, cuando no es la resta. Casi siempre null. */
    zeroMarginOverride: number | null;

    /** En BOLIVARES, a diferencia de todo lo demas. */
    baseSalaryBs: number;
}


/**
 * UNA PERSONA DENTRO DEL MES, con su sello.
 *
 * Lleva copiados el nombre, la cedula y el departamento ademas del id: si
 * manana le corrigen el apellido a alguien o cambia de area, agosto tiene que
 * seguir diciendo lo que dijo en agosto. Es el mismo criterio del sello de
 * bonos y el reverso del tabulador, que solo sabe lo de HOY.
 */
export interface NominaPersonDoc {
    user: Types.ObjectId;
    name: string;
    surName: string;
    dni: string | null;
    department: string | null;

    /** `null` cuando esa persona entro al mes sin cargo: cobra cero. */
    position: NominaPositionSeal | null;
}


/** Los montos en DOLARES que se firman al cerrar un corte. Sin bolivares. */
export interface NominaSettled {
    /**
     * Lo que el cargo aporta a ESTE corte: la parte del paquete base en las
     * quincenas, el margen "0" en `margen0` y el bono complementario en
     * `bono`.
     *
     * Un solo campo y no tres porque los tres son lo mismo —lo que el
     * tabulador pone antes de novedades y descuentos— y separarlos obligaria a
     * mirar el tipo del corte para saber cual de los tres leer.
     */
    fromPosition: number;

    /** Las tres partidas que solo existen en las quincenas. */
    sundays: number;
    additionalDays: number;
    overtimeHours: number;

    /** Puede ser NEGATIVO: los descuentos restan y no se recorta a cero. */
    amountUsd: number;
}


/**
 * LO QUE SE TECLEA DE UNA PERSONA EN UN CORTE.
 *
 * Los cinco campos viven en un solo esquema aunque cada tipo de corte use los
 * suyos: en `margen0` y en `bono` solo se teclea el descuento y los tres
 * conteos se quedan en cero. Un esquema por tipo obligaria a discriminadores
 * de Mongoose sobre un array anidado —`cuts[].rows[]`— para ahorrar tres ceros
 * por fila, y lo que sobra ya lo rechaza yup, que es donde se comprueba lo que
 * entra.
 */
export interface NominaCutRowDoc {
    user: Types.ObjectId;

    /** Solo en las quincenas: cuantos domingos y feriados trabajo. */
    sundays: number;
    /** Solo en las quincenas: cuantos dias adicionales. */
    additionalDays: number;
    /** Solo en las quincenas: cuantas horas extras. */
    overtimeHours: number;

    /**
     * Solo en las quincenas: el descuento de lo adelantado por margen "0".
     * Es la columna DES REST MARGEN 0 de la hoja, y NO es el corte `margen0`,
     * que es donde ese mismo dinero se PAGA.
     */
    zeroMarginDeduction: number;

    /** En los cuatro: la columna DESCUENTO / OTROS DESCUENTOS de la hoja. */
    otherDeductions: number;

    /** Los dolares del cierre. Si esta, manda el: ver `withAmounts`. */
    settled: NominaSettled | null;
}


/** Uno de los cuatro cortes del mes. */
export interface NominaCutDoc {
    kind: CutKind;
    status: 'abierto' | 'cerrado';
    closedAt: Date | null;
    closedBy: Types.ObjectId | null;
    rows: NominaCutRowDoc[];
}


export interface NominaMonthDoc {
    /** El ano con sus cuatro cifras. */
    year: number;
    /** El mes, de 1 a 12. Uno y no cero: se teclea y se lee, no se indexa. */
    month: number;

    /** Como se llama en pantalla: "Agosto 2026". */
    title: string;

    /**
     * En cuantos pagos se reparte el paquete base del mes. Se sella porque es
     * una politica de pago y podria cambiar: los cortes de agosto tienen que
     * seguir repartiendo como se repartia en agosto.
     */
    payPeriodsPerMonth: number;

    /** Quien cobra este mes, con su sello. Una entrada por persona. */
    people: NominaPersonDoc[];

    /** Los cuatro, siempre los cuatro y en el orden de `CUT_KINDS`. */
    cuts: NominaCutDoc[];

    createdBy: Types.ObjectId | null;
    updatedBy: Types.ObjectId | null;

    createdAt: Date;
    updatedAt: Date;
}


const NominaPositionSchema = new Schema<NominaPositionSeal>({

    tabuladorPosition: {
        type: Schema.Types.ObjectId,
        ref: 'TabuladorPosition',
        default: null,
    },

    name: { type: String, trim: true },

    // ── Las cifras tecleadas del cargo ────────────────────────────────
    monthlyBasePackage: { type: Number, required: true, min: 0 },

    fullPackage: { type: Number, required: true, min: 0 },

    complementaryBonus: { type: Number, required: true, min: 0 },

    overtimeHourRate: { type: Number, required: true, min: 0 },

    zeroMarginOverride: { type: Number, default: null },

    // ── El salario base, en bolivares ─────────────────────────────────
    baseSalaryBs: { type: Number, required: true, min: 0 },

}, { _id: false });


const NominaPersonSchema = new Schema<NominaPersonDoc>({

    user: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },

    name: { type: String, trim: true },
    surName: { type: String, trim: true },
    dni: { type: String, default: null, trim: true },
    department: { type: String, default: null },

    position: { type: NominaPositionSchema, default: null },

}, { _id: false });


const NominaSettledSchema = new Schema<NominaSettled>({

    fromPosition: { type: Number, required: true },
    sundays: { type: Number, required: true },
    additionalDays: { type: Number, required: true },
    overtimeHours: { type: Number, required: true },

    // Sin `min`: puede quedar negativo cuando los descuentos superan lo
    // devengado. En la hoja real hay once casos asi, y llevarlos a cero seria
    // perdonar una deuda que la hoja no perdona.
    amountUsd: { type: Number, required: true },

}, { _id: false });


const NominaCutRowSchema = new Schema<NominaCutRowDoc>({

    user: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },

    sundays: { type: Number, default: 0, min: 0 },
    additionalDays: { type: Number, default: 0, min: 0 },
    overtimeHours: { type: Number, default: 0, min: 0 },

    zeroMarginDeduction: { type: Number, default: 0, min: 0 },
    otherDeductions: { type: Number, default: 0, min: 0 },

    settled: { type: NominaSettledSchema, default: null },

}, { _id: false });


const NominaCutSchema = new Schema<NominaCutDoc>({

    kind: {
        type: String,
        enum: CUT_KINDS,
        required: true,
    },

    status: {
        type: String,
        enum: ['abierto', 'cerrado'],
        default: 'abierto',
    },

    closedAt: { type: Date, default: null },

    closedBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        default: null,
    },

    rows: { type: [NominaCutRowSchema], default: [] },

}, { _id: false });


const NominaMonth = new Schema<NominaMonthDoc>({

    year: { type: Number, required: true, min: 2000 },

    month: { type: Number, required: true, min: 1, max: 12 },

    title: { type: String, required: true, trim: true },

    payPeriodsPerMonth: { type: Number, default: 2, min: 1 },

    people: { type: [NominaPersonSchema], default: [] },

    cuts: { type: [NominaCutSchema], default: [] },

    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        default: null,
    },

    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        default: null,
    },

}, { timestamps: true });


// UN SOLO DOCUMENTO POR AÑO Y MES, y lo garantiza la base, no la ruta. Dos
// personas abriendo agosto a la vez pasan las dos la comprobacion de "no
// existe" antes de que ninguna escriba, y quedarian dos agostos con la misma
// gente: el que se teclee segundo se pierde sin que nadie lo note. El indice
// unico convierte esa carrera en un error 11000 que la ruta traduce a un 409.
NominaMonth.index({ year: 1, month: 1 }, { unique: true });


export default model<NominaMonthDoc>('NominaMonth', NominaMonth);
