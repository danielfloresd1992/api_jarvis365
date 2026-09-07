import { Schema, model, Types } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// LA TASA DE CAMBIO: UNA VARIABLE GLOBAL DEL SISTEMA
// ══════════════════════════════════════════════════════════════════════
// Cuántos bolívares vale un dólar. Un solo número para todo el sistema: lo leen
// la nómina y los bonos, y ninguno de los dos guarda su propia copia.
//
//
// POR QUÉ NO VIVE DENTRO DE CADA CORTE DE NÓMINA
//
// Antes cada corte se creaba con su tasa adentro. La tasa cambia todos los
// días, así que esa copia envejecía sola: el corte que se armó el lunes seguía
// mostrando bolívares del lunes el resto de la quincena, y la única manera de
// arreglarlo era editar el corte. Multiplicado por los cortes abiertos a la
// vez, es un número que hay que ir a corregir a mano en varios sitios — lo
// mismo que ya había pasado con el precio del bono antes de volverse global.
//
// El dólar es la moneda de registro: el tabulador está en dólares y en dólares
// se paga. El bolívar es una conversión de presentación. Por eso lo que se
// congela al cerrar un corte son SOLO los montos en dólares; los bolívares se
// derivan siempre de la tasa vigente al momento de leer.
//
//
// ENTONCES, ¿CÓMO SE AUDITA UN CORTE VIEJO?
//
// Cruzando su `closedAt` contra el historial de acá. Guardar una copia dentro
// del corte respondería la misma pregunta, sí, pero al precio de congelar
// también los bolívares de los cortes ABIERTOS, que es justo lo que se quiere
// evitar. El historial responde igual y no le cuesta nada al que está abierto.


/**
 * Quién hizo un cambio.
 *
 * Se guarda el nombre ADEMÁS del id, y no solo el id: leer una auditoría de
 * hace seis meses no debería depender de un populate, ni romperse si ese
 * usuario se dio de baja. Es el mismo actor de `bonusSettings.model.ts`, pero
 * declarado aparte porque este recurso no depende de aquel: el día que el bono
 * deje de existir, la tasa se sigue leyendo igual.
 */
export interface ExchangeRateActor {
    nameUser?: string;

    // `string` además de ObjectId porque así llega desde la sesión
    // (`req.session.userId`) y Mongoose lo castea al guardar.
    _id?: Types.ObjectId | string | null;
}


/**
 * Una tasa que estuvo vigente, con quién la dejó así.
 *
 * `changedAt` es CUÁNDO DEJÓ DE REGIR, no cuándo empezó: la entrada se escribe
 * en el momento en que otra tasa la reemplaza. Leerlo al revés corre la
 * auditoría un cambio entero, así que la lectura es: este valor rigió hasta
 * `changedAt`.
 */
export interface ExchangeRateChange {
    value: number;
    source?: string | null;
    changedAt: Date;
    changedBy?: ExchangeRateActor | null;
}


export interface ExchangeRateDoc {
    /** Bolívares por dólar. */
    value: number;

    /** De dónde salió el número. */
    source?: string | null;

    history: ExchangeRateChange[];
    updatedBy?: ExchangeRateActor | null;

    createdAt: Date;
    updatedAt: Date;
}


const ExchangeRate = new Schema<ExchangeRateDoc>({

    /*
     * BOLÍVARES POR DÓLAR.
     *
     * Sin `default`, a diferencia del resto de los campos del sistema: un
     * defecto convertiría un `create` al que se le olvidó el valor en una tasa
     * de cero guardada, y una tasa de cero deja TODA la columna de bolívares
     * del sistema en cero sin una sola queja. Que falte es un error de quien
     * escribe, y `required` lo dice a tiempo.
     *
     * "Sin configurar" se representa con la AUSENCIA del documento, no con un
     * cero adentro; el `min` de acá es la última red, y la de verdad —mayor que
     * cero— está en exchangeRate.schema.ts, que es por donde entra todo lo que
     * viene del cliente.
     */
    value: {
        type: Number,
        required: true,
        min: 0,
    },

    /*
     * De dónde salió el número: "manual", "ve.dolarapi.com", el BCV.
     *
     * Es para decirlo en pantalla junto a la fecha, que es lo que permite
     * confiar en la cifra sin ir a preguntar. Opcional porque una tasa cargada
     * a mano sin explicación sigue siendo una tasa válida.
     */
    source: {
        type: String,
        trim: true,
        default: null,
    },

    /*
     * Las tasas anteriores, de la más vieja a la más reciente.
     *
     * No es decoración ni comodidad: es LO ÚNICO que permite responder a qué
     * tasa se pagó un corte cerrado, porque el corte ya no guarda una copia.
     * Si esto se vacía, esa pregunta deja de tener respuesta.
     */
    history: [{
        value: { type: Number, required: true },
        source: { type: String, default: null },
        changedAt: { type: Date, default: Date.now },
        changedBy: {
            nameUser: { type: String },
            _id: { type: Schema.Types.ObjectId, ref: 'user' },
        },
        _id: false,
    }],

    updatedBy: {
        nameUser: { type: String },
        _id: { type: Schema.Types.ObjectId, ref: 'user' },
    },

}, { timestamps: true });


export default model<ExchangeRateDoc>('ExchangeRate', ExchangeRate);
