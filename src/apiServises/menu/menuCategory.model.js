import { Schema, model } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// CATEGORÍA DE ALERTA
// ══════════════════════════════════════════════════════════════════════
// El catálogo de categorías con las que se agrupan las alertas (los documentos
// de `Menu`).
//
// ANTES ESTO NO EXISTÍA
//
// Las categorías estaban escritas a mano en el cliente —y por duplicado, en
// `category.js` y `category.json`—, así que agregar una exigía tocar código y
// volver a publicar. Y como `Menu.category` es texto libre, un error de tipeo
// creaba una categoría fantasma que nadie notaba hasta ver la lista partida.
//
//
// `value` ES LA CLAVE Y NO SE PUEDE CAMBIAR
//
// `Menu.category` guarda esta cadena —'client', 'delay'—, no una referencia.
// Se mantuvo así a propósito: convertirlo en referencia obligaría a migrar
// todas las alertas ya creadas, y el sistema se actualiza a mano.
//
// La consecuencia es que `value` es INMUTABLE. Cambiarlo dejaría a todas las
// alertas de esa categoría apuntando a una clave que ya no existe, y
// desaparecerían de la lista sin dar ningún error. La etiqueta que se lee (`es`
// / `en`) sí se puede editar cuantas veces haga falta: para eso está separada.
//
//
// POR QUÉ VIVE EN EL RECURSO `menu`
//
// Porque una categoría no significa nada por su cuenta: existe para agrupar
// alertas, y una alerta es un `Menu`. Ponerla en su propio módulo obligaría a
// que menu dependiera de él para algo que es parte de su propia definición.

const MenuCategory = new Schema({

    // La clave que guarda `Menu.category`.
    //
    // OJO: no se normaliza a minúsculas. Las categorías que ya existen usan
    // camelCase —'localIncident'— y las alertas guardadas las tienen escritas
    // así. Forzar minúsculas convertiría 'localIncident' en 'localincident' y
    // esas alertas dejarían de encontrar su categoría.
    //
    // Las nuevas sí se crean en minúsculas con guiones (ver `aClave` en el
    // controlador); la diferencia es solo herencia de lo que ya estaba.
    value: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        immutable: true,   // ver la nota de arriba: cambiarla huérfana alertas
    },

    // Lo que se lee. Editable: es la única parte que puede corregirse.
    es: { type: String, required: true, trim: true },
    en: { type: String, required: true, trim: true },

    // ── Apariencia ────────────────────────────────────────────────────
    // Vivía en el cliente (`categoryMeta.js`) con las claves escritas a mano.
    // Acá viaja con la categoría, así que una nueva se ve bien desde el primer
    // momento sin publicar nada.
    //
    // El ícono va como NOMBRE, no como componente: un componente de React no
    // se puede guardar en la base. El cliente traduce el nombre a su ícono y
    // cae a uno genérico si no lo conoce.
    icon: { type: String, default: 'bell', trim: true },
    color: { type: String, default: '#374151', trim: true },   // texto e ícono
    bg: { type: String, default: '#f3f4f6', trim: true },       // fondo del círculo

    /** Orden en el selector y en los filtros. A igual orden, alfabético. */
    order: { type: Number, default: 100 },

    // ── Baja ──────────────────────────────────────────────────────────
    // Una categoría en uso NO se borra: se desactiva. Deja de ofrecerse al
    // crear alertas nuevas, pero las que ya la tienen se siguen viendo bien.
    // Borrarla de verdad solo se permite cuando no la usa ninguna alerta.
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
MenuCategory.index({ active: 1, order: 1, es: 1 });


export default model('MenuCategory', MenuCategory);
