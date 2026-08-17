import * as yup from 'yup';

/**
 * Lo que acepta el PUT de los valores globales del sistema de bonificación.
 *
 * Los dos campos son OPCIONALES pero no pueden faltar los dos: un PUT vacío no
 * es "no cambies nada", es una petición sin sentido que conviene rechazar.
 * Mandar solo la tasa es lo habitual —cambia mucho más seguido que el valor del
 * bono— y deja el otro como estaba.
 *
 * `null` se trata igual que ausente: llega así desde el front cuando un campo
 * queda vacío, y significa lo mismo. Por eso ninguno lleva `.default()`: un
 * default convertiría "no lo toques" en "escribilo con este valor", que es
 * justo lo contrario, y dejaría en el historial un cambio del valor del bono
 * cada vez que alguien actualiza la tasa.
 */
const bonusSettingsSchema = yup.object({

    // Cuánto vale UN bono, en dólares.
    pointValue: yup.number()
        .typeError('El valor del bono debe ser un número')
        .min(0, 'El valor del bono no puede ser negativo')
        .nullable(),

    // Bolívares por dólar, según el Banco Central.
    exchangeRate: yup.number()
        .typeError('La tasa de cambio debe ser un número')
        .min(0, 'La tasa de cambio no puede ser negativa')
        .nullable(),
})
    // Acompañado de `stripUnknown: true` al validar: una clave de más se
    // descarta en vez de llegar a la base.
    .noUnknown()

    .test(
        'al-menos-uno',
        'Hay que enviar pointValue, exchangeRate o ambos',
        valor => valor?.pointValue != null || valor?.exchangeRate != null,
    );


/** Lo que llega ya validado. Se deriva del esquema, asi que el tipo no puede
 *  quedar desincronizado de la validacion: cambiar uno cambia el otro. */
export type BonusSettingsInput = yup.InferType<typeof bonusSettingsSchema>;


export default bonusSettingsSchema;
