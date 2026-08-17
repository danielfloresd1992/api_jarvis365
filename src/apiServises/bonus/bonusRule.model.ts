import { Schema, model, Types } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// REGLA DE BONIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Cuánto bonifica una alerta, dónde bonifica y cuántas hacen falta.
//
// Una alerta (`Menu`) apunta a UNA regla con `Menu.bonusRule`. Muchas alertas
// pueden apuntar a la misma: el reglamento repite las mismas condiciones una y
// otra vez —"1x1", "3x1 en perimetrales"—, así que la regla se define una vez y
// se reutiliza.
//
// La reutilización sale de la dirección de la referencia y de nada más. Acá NO se
// guarda la lista de alertas que la usan: sería el mismo dato dos veces, y el día
// que las dos copias no coincidan no habría forma de saber cuál manda. Para saber
// quién usa una regla, se pregunta: Menu.find({ bonusRule: id }).
//
//
// LO QUE ESTA REGLA NO DECIDE
//
// El DINERO. Un bono vale lo mismo para todas las alertas —ver
// bonusSettings.model.ts—; acá solo se decide cuántos bonos otorga cada una.
// Tener el precio por alerta obligaría a editar decenas de documentos para
// cambiar un número que el reglamento fija una sola vez.
//
// El TOTAL. Una alerta suelta no tiene un total: el total se cuenta al corte,
// sumando lo que aportó cada novedad aprobada.


/**
 * Cuántos bonos otorga, según el turno del OPERADOR que reportó.
 *
 * Admite decimales: el reglamento tiene casos de 1 en diurno y 1,5 en nocturno. Y
 * no hay un multiplicador único entre los dos —una alerta pasa de 1 a 1,5 y otra
 * de 4 a 5—, así que son dos valores independientes y no uno derivado del otro.
 */
export interface BonusAwarded {
    day: number;
    night: number;
}


/**
 * Los dos números que el reglamento escribe juntos: "3x1" son tres alertas por un
 * bono.
 *
 * Se guardan con NOMBRE y no como un par ordenado a propósito. El reglamento usa
 * la misma notación para cosas distintas —"0.25x4" son cuatro alertas por un
 * bono, pero "1x5" es una alerta que vale cinco—, y con dos números sueltos tarde
 * o temprano alguien carga uno pensando lo otro.
 */
export interface BonusAward {
    /**
     * Cuántas alertas hacen falta para que haya bono.
     *
     * Mínimo 1 porque es DIVISOR al contar: un 0 daría infinito y un negativo,
     * bonos negativos.
     *
     * No cambia entre diurno y nocturno: lo que varía por turno es cuánto se
     * paga, no cuántas veces tiene que ocurrir.
     */
    alertsRequired: number;
    bonusAwarded: BonusAwarded;
}


/** 'all' en todos lados · 'only' solo en los listados · 'except' en todos menos. */
export type BonusScopeMode = 'all' | 'only' | 'except';


export interface BonusScope {
    mode: BonusScopeMode;
    franchises: Types.ObjectId[];
    locals: Types.ObjectId[];
}


/** La misma alerta con otro valor en un lugar puntual. */
export interface BonusOverride extends BonusAward {
    franchise?: Types.ObjectId | null;
    local?: Types.ObjectId | null;
    note?: string;
}


export interface BonusRuleDoc extends BonusAward {
    name: string;
    description?: string;

    /** El ítem del reglamento: "1.1", "R2.6", "E4.3". */
    regulationCode?: string;

    scope: BonusScope;
    overrides: BonusOverride[];

    active: boolean;

    createdBy?: Types.ObjectId | null;
    updatedBy?: Types.ObjectId | null;

    createdAt: Date;
    updatedAt: Date;
}


// ── Cuánto otorga ─────────────────────────────────────────────────────
// La misma forma en la regla general y en cada excepción, definida una sola vez.
const cuantoOtorga = () => ({
    alertsRequired: { type: Number, default: 1, min: 1 },
    bonusAwarded: {
        day: { type: Number, default: 1, min: 0 },
        night: { type: Number, default: 1, min: 0 },
    },
});


const BonusRule = new Schema<BonusRuleDoc>({

    // Con qué se la reconoce al reutilizarla. Sin esto, elegir entre quince
    // reglas en un selector es adivinar.
    name: {
        type: String,
        required: true,
        trim: true,
    },

    description: { type: String, default: '', trim: true },

    // Permite cotejar la configuración contra el PDF sin traducir nada.
    regulationCode: { type: String, default: '', trim: true },


    // ── Cuánto otorga, en general ─────────────────────────────────────
    ...cuantoOtorga(),


    // ══════════════════════════════════════════════════════════════════
    // DÓNDE APLICA
    // ══════════════════════════════════════════════════════════════════
    // Casi todo el reglamento lleva alcance: "SOLO FRANCISCAS", "SOLO
    // NACIONALES", "Todos los Mister excepto Fort Lauderdale". Es la dimensión
    // más frecuente, no un caso de borde.
    scope: {
        // Hacen falta los dos sentidos y no solo la inclusión: "todos los Mister
        // excepto Fort Lauderdale" con `only` obliga a enumerar cada Mister y a
        // mantener esa lista; con `except` son dos datos y el local que abra
        // mañana entra solo.
        mode: {
            type: String,
            enum: ['all', 'only', 'except'],
            default: 'all',
        },

        // Por MARCA. Es como está escrito casi todo el reglamento, y es lo que
        // hace que una Francisca nueva quede cubierta sin que nadie la agregue.
        franchises: [{ type: Schema.Types.ObjectId, ref: 'Franchise' }],

        // Por establecimiento concreto: "FRANCISCA MIAMI", "SOLO LLANO GRANDE".
        locals: [{ type: Schema.Types.ObjectId, ref: 'Local' }],
    },


    // ══════════════════════════════════════════════════════════════════
    // EXCEPCIONES
    // ══════════════════════════════════════════════════════════════════
    // Bonifica en todos lados con 1, pero en un establecimiento vale 5.
    //
    // Se declara la marca o el establecimiento, no las dos. Gana la más
    // específica: si hay una excepción para el local, la de su franquicia no se
    // mira.
    overrides: [{
        franchise: { type: Schema.Types.ObjectId, ref: 'Franchise', default: null },
        local: { type: Schema.Types.ObjectId, ref: 'Local', default: null },

        ...cuantoOtorga(),

        // Por qué acá es distinto. No es adorno: en seis meses nadie recuerda si
        // fue una decisión o un error de carga.
        note: { type: String, default: '', trim: true },

        _id: false,
    }],


    // ── Baja ──────────────────────────────────────────────────────────
    // Una regla en uso NO se borra: se desactiva. Borrarla dejaría a todas sus
    // alertas apuntando a un documento que no existe, y saldrían de los cortes
    // sin dar ningún error — que es la peor forma de dejar de pagar.
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


// El selector las pide activas y por nombre; este índice cubre esa consulta.
BonusRule.index({ active: 1, name: 1 });


export default model<BonusRuleDoc>('BonusRule', BonusRule);
