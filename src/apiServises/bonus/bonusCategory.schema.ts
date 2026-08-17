import * as yup from 'yup';

/**
 * Lo que acepta el ABM de categorías de bonificación.
 *
 * `value` no está: es la clave y la deriva el servidor del nombre en español.
 * Dejar que el cliente la mandara abriría la puerta a dos categorías que se ven
 * iguales con claves distintas, y a cambiarla en un PUT — que dejaría a todas
 * sus reglas apuntando a una clave que no existe.
 */
const bonusCategorySchema = yup.object({

    es: yup.string().trim().required('La categoría necesita un nombre'),

    // Si no viene, el servidor usa el nombre en español: obligar a traducir para
    // poder guardar sería un trámite, y el inglés casi nunca se usa acá.
    en: yup.string().trim().default(''),

    // ── Apariencia ────────────────────────────────────────────────────
    // El ícono va como NOMBRE. El cliente lo traduce a su componente y cae a uno
    // genérico si no lo conoce, así que un nombre desconocido no rompe nada.
    icon: yup.string().trim().default('star'),

    // Los dos son colores CSS en hexadecimal. Se validan con expresión regular
    // porque van directo a un `style` del cliente: cualquier cadena entraría
    // igual, y una mal formada deja el chip sin color sin decir por qué.
    color: yup.string().trim()
        .matches(/^#[0-9a-fA-F]{6}$/, 'El color debe ser hexadecimal, por ejemplo #8a5a2b')
        .default('#8a5a2b'),

    bg: yup.string().trim()
        .matches(/^#[0-9a-fA-F]{6}$/, 'El fondo debe ser hexadecimal, por ejemplo #fdf6e7')
        .default('#fdf6e7'),

    order: yup.number()
        .typeError('El orden debe ser un número')
        .integer('El orden debe ser un número entero')
        .min(0, 'El orden no puede ser negativo')
        .default(100),

    active: yup.boolean().default(true),
})
    .noUnknown();


export type BonusCategoryInput = yup.InferType<typeof bonusCategorySchema>;

export default bonusCategorySchema;
