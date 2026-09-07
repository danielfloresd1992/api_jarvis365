import { Schema, model, Types } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// EL VALOR GLOBAL DEL SISTEMA DE BONIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Cuánto dinero vale UN bono. Un número para todo el sistema, no por alerta ni
// por establecimiento: el reglamento lo fija de forma general.
//
//
// ACÁ VIVÍA TAMBIÉN LA TASA DE CAMBIO, Y SE MUDÓ
//
// Este documento tuvo dos variables globales. La tasa bolívar/dólar se fue a su
// propio recurso —`apiServises/exchangeRate/`— por tres razones que ninguna
// forma de acomodar este modelo resolvía:
//
//   Cambia todos los días, y el valor del bono casi nunca. Compartiendo
//   documento, este historial —que existe para explicar por qué una semana el
//   bono valió 0,20— quedaba enterrado bajo decenas de entradas que no hablan
//   del bono.
//
//   La usan dos módulos, el bono y la nómina. Mientras vivió acá, la nómina
//   tenía que leer la configuración del BONO para convertir un sueldo a
//   bolívares, o guardarse su propia copia — que fue lo que terminó pasando.
//
//   Y las reglas son OPUESTAS. El valor del bono se CONGELA al sellar una
//   novedad —ver `resolveBonus.lib.ts`— porque es lo que se pactó pagar; la
//   tasa no se congela nunca, se aplica la vigente al momento de leer. Dos
//   campos vecinos en un mismo documento invitan a tratarlos igual, y tratarlos
//   igual es exactamente el error.
//
// Acá no queda ni una copia de respaldo: quien necesite la tasa la pide al
// recurso nuevo.
//
//
// POR QUÉ ES GLOBAL Y NO VIVE EN LA ALERTA
//
// Antes cada alerta guardaba su propio precio. Eso obligaba a editar decenas de
// alertas para cambiar un número que en el reglamento es uno solo, y bastaba con
// olvidarse de una para que pagara distinto sin que nadie lo notara.
//
// Lo que SÍ varía por alerta es la CANTIDAD de bonos que otorga, y eso vive en
// `BonusRule`. Acá vive el precio de esa unidad.
//
//
// SE GUARDA UNO SOLO Y SE CONSERVA EL HISTORIAL
//
// Hay un único documento vigente. Cada cambio empuja el valor anterior a
// `history`, con quién lo hizo y cuándo: al revisar un corte viejo hay que poder
// responder "¿por qué esa semana el bono valió 0,20?".
//
// El valor NO se recalcula hacia atrás. Al sellar, cada novedad se queda con el
// que regía en ese momento —ver `resolveBonus.lib.ts`—, así que cambiarlo no
// toca nada de lo ya sellado. El reglamento cambia; lo ya pagado no.


/**
 * Quién hizo un cambio.
 *
 * Se guarda el nombre ADEMÁS del id, y no solo el id: leer una auditoría de hace
 * seis meses no debería depender de un populate, ni romperse si ese usuario se
 * dio de baja.
 */
export interface BonusActor {
    nameUser?: string;

    // `string` además de ObjectId porque así llega desde la sesión
    // (`req.session.userId`) y Mongoose lo castea al guardar. Declarar solo
    // ObjectId dejaba el tipo mintiendo sobre lo que de verdad se le pasa.
    _id?: Types.ObjectId | string | null;
}


/** Un valor que estuvo vigente, con quién lo dejó así. */
export interface BonusSettingsChange {
    pointValue?: number;
    changedAt?: Date;
    changedBy?: BonusActor | null;
}


export interface BonusSettingsDoc {
    /** Cuánto vale un bono, en dólares. */
    pointValue: number;

    history: BonusSettingsChange[];
    updatedBy?: BonusActor | null;

    createdAt: Date;
    updatedAt: Date;
}


const BonusSettings = new Schema<BonusSettingsDoc>({

    /*
     * Cuánto vale un bono, en dólares. Del reglamento: "El valor del punto por
     * bono será 0,20".
     *
     * Admite decimales porque la cantidad de bonos de una alerta también los
     * admite (1,5 en nocturno), y el total es cantidad × valor.
     *
     * En dólares y no en bolívares porque es lo que el reglamento fija: el
     * bolívar es una conversión de presentación, y se calcula al leer con la
     * tasa vigente.
     */
    pointValue: {
        type: Number,
        required: true,
        default: 0.20,
        min: 0,
    },

    /*
     * Los valores anteriores, del más viejo al más reciente.
     *
     * No es decoración: un corte se audita semanas después, y sin esto no hay
     * forma de reconstruir por qué se pagó lo que se pagó cuando alguien
     * pregunta.
     */
    history: [{
        pointValue: { type: Number },
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


export default model<BonusSettingsDoc>('BonusSettings', BonusSettings);
