import { Schema, model } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// EL VALOR DEL BONO
// ══════════════════════════════════════════════════════════════════════
// Cuánto dinero vale UN bono. Es un solo número para todo el sistema, no por
// alerta ni por establecimiento: el reglamento lo fija de forma general.
//
//
// POR QUÉ ES GLOBAL Y NO VIVE EN LA ALERTA
//
// Antes cada alerta guardaba su propio `pointValue`. Eso obligaba a editar
// decenas de alertas para cambiar un número que en el reglamento es uno solo,
// y bastaba con olvidarse de una para que pagara distinto sin que nadie lo
// notara.
//
// Lo que SÍ varía por alerta es la CANTIDAD de bonos que otorga, y eso vive en
// `Menu.bonusSystem`. Acá vive el precio de esa unidad.
//
//
// SE GUARDA UNO SOLO Y SE CONSERVA EL HISTORIAL
//
// Hay un único documento vigente. Cada cambio empuja el valor anterior a
// `history`, con quién lo hizo y cuándo: al revisar un corte viejo hay que
// poder responder "¿por qué esa semana el bono valió 0,20?".
//
// El valor NO se recalcula hacia atrás. Al sellar, cada novedad se queda con el
// que regía en ese momento (ver libs/bonus/bonusSeal.lib.js), así que cambiarlo
// no toca nada de lo ya sellado. Es el mismo criterio que el resto del sello: el
// reglamento cambia, lo ya pagado no.

const BonusSettings = new Schema({

    /*
     * Cuánto vale un bono, en dólares. Del reglamento: "El valor del punto por
     * bono será 0,20".
     *
     * Admite decimales porque la cantidad de bonos de una alerta también los
     * admite (1,5 en nocturno), y el total es cantidad × valor.
     */
    pointValue: {
        type: Number,
        required: true,
        default: 0.20,
        min: 0,
    },

    /*
     * LA TASA DE CAMBIO DEL DÓLAR, según el Banco Central de Venezuela.
     *
     * El bono se define en dólares, pero se paga en bolívares. La tasa es la
     * segunda variable global del sistema y cambia mucho más seguido que el
     * valor del bono, así que se carga aparte.
     *
     * Va acá y no en un servicio que la consulte sola a propósito: lo que se
     * paga tiene que ser el número que alguien fijó y quedó registrado, no el
     * que devolviera una API el día que se corrió el cálculo. Si mañana se
     * automatiza la consulta al BCV, el valor seguirá aterrizando en este
     * campo y el resto del sistema no se entera.
     */
    exchangeRate: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },

    /*
     * Los valores anteriores, del más reciente al más viejo.
     *
     * Se guardan LOS DOS en cada cambio, aunque solo se haya tocado uno: al
     * revisar un corte hace falta saber con qué par de números se calculó, y
     * reconstruirlo cruzando dos historiales separados es la clase de cuenta
     * que sale mal.
     *
     * No es decoración: un corte se audita semanas después, y sin esto no hay
     * forma de reconstruir por qué se pagó lo que se pagó cuando alguien
     * pregunta.
     */
    history: [{
        pointValue: { type: Number },
        exchangeRate: { type: Number },
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


export default model('BonusSettings', BonusSettings);
