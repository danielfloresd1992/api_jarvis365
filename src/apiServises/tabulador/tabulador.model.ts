import { Schema, model, Types } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// TABULADOR: UN CARGO Y LO QUE PAGA
// ══════════════════════════════════════════════════════════════════════
// Es la hoja TABULADOR del modelo en Excel, fila por fila. Cada documento es
// un CARGO, y de el salen todas las tarifas que usan las otras hojas: el dia
// laborado, el feriado, la hora, la puntualidad. Nada de eso se guarda aqui:
// se calcula con `ratesOf` (tabulador.lib.ts) a partir de cuatro numeros,
// igual que en la hoja, para que cambiar el paquete de un cargo mueva todas
// sus tarifas de una vez y no quede ninguna copia vieja.
//
//
// LO QUE SE GUARDA Y LO QUE SE DERIVA
//
// La hoja tiene quince columnas y solo cuatro son datos: el paquete base, el
// paquete completo, el bono complementario y la hora extra. Las otras diez
// son formulas sobre esas. Guardar las formulas resueltas seria el mismo dato
// dos veces, y el dia que no coincidan nadie sabria cual manda.
//
// La hora extra NO se deriva: en la hoja va tecleada por cargo y no guarda
// proporcion con la hora normal (un verificador cobra 3,60 la hora extra y
// 1,04 la normal; un subgerente 2,60 y 2,08). Es un dato de negocio.
//
//
// EL DINERO ES EN DOLARES
//
// Todo el tabulador esta en dolares; el paso a bolivares lo hace la nomina
// con la tasa del momento (la hoja "MARGEN 0" multiplica por 800). Aqui no
// hay moneda ni tasa: son globales, no del cargo.
//
//
// POR QUE NO HAY VIRTUALES NI VALIDADOR CRUZADO EN EL ESQUEMA
//
// Las rutas leen con `.lean()`, y un documento lean no trae virtuales: las
// tarifas se pegan en la ruta con `withRates`. Y la regla "el completo nunca
// por debajo de la base" vive en el esquema de yup, que ve el cuerpo entero
// tanto al crear como al editar; un `validate` de Mongoose no la ve en un
// `findByIdAndUpdate`, donde `this` es la consulta y no el documento.


export interface TabuladorPositionDoc {
    /** El nombre del cargo tal como esta en la hoja: "OPERADOR EXPERTO NOCTURNO". Unico. */
    name: string;

    /** Orden en pantalla. La columna Nº de la hoja no es unica, asi que no sirve de clave. */
    order: number;

    /** PAQUETE MENSUAL BASE, en dolares. Lo que se paga si o si. */
    monthlyBasePackage: number;

    /** PAQUETE COMPLETO, en dolares. Base mas el margen "0". Nunca menor que la base. */
    fullPackage: number;

    /** BONO COMPLEMEN, en dolares. Se suma al total; no entra en ninguna tarifa diaria. */
    complementaryBonus: number;

    /** HORA EXTRA, en dolares. Tecleada por cargo: no se deriva de la hora normal. */
    overtimeHourRate: number;

    /**
     * MARGEN "0" tecleado a mano, cuando difiere de la formula (completo - base).
     * En la hoja pasa una sola vez (RRHH: 130 en vez de 100). `null` = usar la
     * formula, que es lo normal. Existe para no perder ese caso al migrar, no
     * para usarlo de costumbre.
     */
    zeroMarginOverride: number | null;

    /** Un cargo en uso no se borra: se desactiva. Los trabajadores lo siguen viendo. */
    active: boolean;

    createdBy?: Types.ObjectId | null;
    updatedBy?: Types.ObjectId | null;

    createdAt: Date;
    updatedAt: Date;
}


const TabuladorPosition = new Schema<TabuladorPositionDoc>({

    // Se guarda en MAYUSCULAS y sin espacios sobrantes: la hoja trae cuatro
    // nombres con espacio al final y asi "COORDINADOR " y "COORDINADOR" serian
    // dos cargos distintos a la vista iguales. Con `unique`, el indice hace el
    // resto: un repetido sale como error 11000, que asyncHandler traduce a 409.
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
    },

    order: { type: Number, default: 100 },

    // ── Los cuatro numeros de la hoja ─────────────────────────────────
    monthlyBasePackage: { type: Number, required: true, min: 0 },

    fullPackage: { type: Number, required: true, min: 0 },

    complementaryBonus: { type: Number, default: 0, min: 0 },

    overtimeHourRate: { type: Number, required: true, min: 0 },

    zeroMarginOverride: { type: Number, default: null, min: 0 },

    // ── Baja ──────────────────────────────────────────────────────────
    active: { type: Boolean, default: true },

    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        default: null,
        immutable: true,
    },

    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        default: null,
    },

}, { timestamps: true });


// El selector pide los activos por orden; este indice cubre esa consulta.
TabuladorPosition.index({ active: 1, order: 1, name: 1 });


export default model<TabuladorPositionDoc>('TabuladorPosition', TabuladorPosition);
