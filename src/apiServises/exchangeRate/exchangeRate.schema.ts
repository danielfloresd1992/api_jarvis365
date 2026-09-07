import * as yup from 'yup';

/**
 * Lo que acepta el PUT de la tasa de cambio.
 *
 * Un solo campo obligatorio, y por eso el cuerpo no admite cambios parciales
 * como el de los valores del bono: acá no hay nada que "dejar como estaba".
 * Quien manda un PUT está declarando la tasa de hoy, entera.
 */
const exchangeRateSchema = yup.object({

    // Bolívares por dólar.
    //
    // `moreThan(0)` y no `min(0)`: un campo vacío que JSON convierte en 0
    // pasaría el mínimo sin una sola queja y dejaría en cero TODA la columna de
    // bolívares del sistema —la nómina y los bonos, cada corte abierto y cada
    // corte cerrado que se lea después—, porque los bolívares ya no se sellan
    // en ninguna parte: se derivan de este número cada vez.
    //
    // "Sin configurar" es que el documento no exista, no un cero guardado. Y
    // ese cero, además, se ve igual que una tasa legítima que todavía nadie
    // cargó, así que ni siquiera delata al que lo escribió.
    value: yup.number()
        .typeError('La tasa debe ser un número')
        .moreThan(0, 'La tasa tiene que ser mayor que cero')
        .required('Hace falta la tasa'),

    // De dónde salió el número: "manual", "ve.dolarapi.com", el BCV.
    //
    // Se muestra al lado de la cifra, así que se corta en 60: es una etiqueta
    // para leer de un vistazo, no un campo de notas. Opcional de verdad —
    // `null` por defecto—, porque una tasa cargada a mano sin explicación sigue
    // siendo la tasa buena.
    source: yup.string()
        .trim()
        .max(60, 'La procedencia de la tasa no puede pasar de 60 caracteres')
        .nullable()
        .default(null),
})
    // Acompañado de `stripUnknown: true` al validar: una clave de más se
    // descarta en vez de llegar a la base. Deja afuera `history`, `updatedBy` y
    // los timestamps, que los escribe el servidor — el historial sobre todo:
    // es la prueba de a qué tasa se pagó cada corte, y quien lo pudiera
    // reescribir desde un cuerpo podría reescribir esa respuesta.
    .noUnknown();


/** Lo que llega ya validado. Se deriva del esquema, así que el tipo no puede
 *  quedar desincronizado de la validación: cambiar uno cambia el otro. */
export type ExchangeRateInput = yup.InferType<typeof exchangeRateSchema>;


export default exchangeRateSchema;
