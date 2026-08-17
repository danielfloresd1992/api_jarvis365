import { Schema, model, Types } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// CATEGORÍA DE BONIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// El catálogo con el que se agrupan las REGLAS para los cortes de bono.
//
//
// ANTES COLGABA DE LA ALERTA, Y AHORA DE LA REGLA
//
// La categoría vivía en `Menu.bonusCategory`: cada alerta declaraba con qué
// criterio se agrupaba. Se mudó a `BonusRule.bonusCategory` porque las dos
// cosas decían lo mismo desde distinto lado — la regla ya define un criterio de
// bonificación, y que quince alertas de una misma regla pudieran declarar
// quince categorías distintas era una contradicción que nada impedía.
//
// Con la categoría en la regla, el criterio es uno solo por definición.
//
//
// POR QUÉ ES UN CATÁLOGO APARTE Y NO LA CATEGORÍA DE SIEMPRE
//
// `Menu.category` ('delay', 'food', 'employee') NO se administra: es una lista
// fija. Fuera de este repositorio hay dos sistemas que la leen con nombres
// escritos a mano y que se despliegan por separado —reportes365 agrupa las
// páginas del reporte por esa cadena, y Jarvis-express365 la tiene en sus
// JSON—, así que una categoría nueva allá sería una que ninguno de los dos
// entiende. El síntoma no sería un error: la alerta no aparecería donde
// corresponde y nadie lo relacionaría con haber creado una categoría.
//
// La bonificación no tiene ese problema: se calcula acá adentro y no la consume
// ningún sistema externo.
//
//
// `value` ES LA CLAVE Y NO SE PUEDE CAMBIAR
//
// `BonusRule.bonusCategory` guarda esta cadena, no una referencia. La
// consecuencia es que `value` es INMUTABLE: cambiarlo dejaría a todas las
// reglas de esa categoría apuntando a una clave que ya no existe, y saldrían de
// los cortes sin dar ningún error. La etiqueta que se lee (`es` / `en`) sí se
// puede corregir cuantas veces haga falta: para eso está separada.


export interface BonusCategoryDoc {
    /** La clave que guarda `BonusRule.bonusCategory`. Inmutable. */
    value: string;

    es: string;
    en: string;

    /** Nombre del ícono, no el componente: React no se guarda en la base. */
    icon: string;
    color: string;
    bg: string;

    order: number;
    active: boolean;

    createdBy?: Types.ObjectId | string | null;
    updatedBy?: Types.ObjectId | string | null;

    createdAt: Date;
    updatedAt: Date;
}


const BonusCategory = new Schema<BonusCategoryDoc>({

    // Todas nacen de la pantalla de bonos, así que todas se crean en minúsculas
    // con guiones (ver `aClave` en las rutas). No hay claves heredadas en
    // camelCase que respetar.
    value: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        immutable: true,   // ver la nota de arriba: cambiarla huérfana reglas
    },

    // Lo que se lee. Editable: es la única parte que puede corregirse.
    es: { type: String, required: true, trim: true },
    en: { type: String, required: true, trim: true },

    // ── Apariencia ────────────────────────────────────────────────────
    // El ícono va como NOMBRE, no como componente: un componente de React no se
    // puede guardar en la base. El cliente traduce el nombre a su ícono y cae a
    // uno genérico si no lo conoce.
    icon: { type: String, default: 'star', trim: true },
    color: { type: String, default: '#8a5a2b', trim: true },   // texto e ícono
    bg: { type: String, default: '#fdf6e7', trim: true },      // fondo del círculo

    /** Orden en el selector y en los filtros. A igual orden, alfabético. */
    order: { type: Number, default: 100 },

    // ── Baja ──────────────────────────────────────────────────────────
    // Una categoría en uso NO se borra: se desactiva. Deja de ofrecerse al crear
    // reglas nuevas, pero las que ya la tienen se siguen viendo bien. Borrarla
    // de verdad solo se permite cuando no la usa ninguna regla.
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


// El selector las pide ordenadas y activas; este índice cubre esa consulta.
BonusCategory.index({ active: 1, order: 1, es: 1 });


export default model<BonusCategoryDoc>('BonusCategory', BonusCategory);
