import * as yup from 'yup';

/**
 * Lo que acepta el PUT del valor global del sistema de bonificación.
 *
 * Tiene UN campo y es obligatorio. Antes eran dos —el valor del bono y la tasa
 * de cambio— y los dos eran opcionales, porque lo habitual era mandar solo la
 * tasa. La tasa se mudó a su propio recurso (`apiServises/exchangeRate/`), así
 * que ya no queda nada que "no tocar": un PUT sin `pointValue` no es un cambio
 * parcial, es una petición sin contenido, y conviene rechazarla acá antes de que
 * llegue a la base.
 *
 * Por eso tampoco lleva `.default()`, y no porque sea inofensivo: yup aplica el
 * default ANTES de comprobar `required`, así que un default dejaría pasar el
 * cuerpo vacío y escribiría ese número encima del valor configurado. Es
 * exactamente el "no cambies nada" que acá ya no existe.
 */
const bonusSettingsSchema = yup.object({

    // Cuánto vale UN bono, en dólares.
    //
    // `min` y no `moreThan`: cero es un valor legítimo acá —una alerta que
    // bonifica pero todavía no tiene precio asignado—, y a diferencia de la tasa
    // de cambio no arrastra a ningún otro cálculo del sistema.
    // Y tiene que ser FINITO. `"1e999"` —que un <input type=number> da por
    // bueno— castea a Infinity, y ni `typeError` ni `min` lo atajan: Mongoose lo
    // castea sin chistar y BSON lo guarda. A partir de ahí el valor configurado
    // está perdido y nadie ve un error: `getBonusSettings` descarta lo no finito
    // y sella cada novedad con el valor por defecto, mientras el GET responde
    // `pointValue: null` porque JSON no sabe escribir Infinity. Se atajaba en la
    // lib mientras ésta filtraba por `Number.isFinite`; ahora entra por acá, que
    // es donde se comprueba todo lo que se va a guardar.
    pointValue: yup.number()
        .typeError('El valor del bono debe ser un número')
        .test(
            'finito',
            'El valor del bono debe ser un número finito',
            // Ausente y NaN se dejan pasar: de esos dos ya hablan `required` y
            // `typeError`, y con `abortEarly: false` repetirlos acá devolvería
            // dos mensajes para un mismo error.
            (valor) => valor == null || Number.isNaN(valor) || Number.isFinite(valor),
        )
        .min(0, 'El valor del bono no puede ser negativo')
        .required('Hay que enviar el valor del bono'),
})
    // Acompañado de `stripUnknown: true` al validar: una clave de más se
    // descarta en vez de llegar a la base. Es lo que hace que un `exchangeRate`
    // colado en este cuerpo —de un front viejo, por ejemplo— no escriba nada.
    .noUnknown();


/** Lo que llega ya validado. Se deriva del esquema, asi que el tipo no puede
 *  quedar desincronizado de la validacion: cambiar uno cambia el otro. */
export type BonusSettingsInput = yup.InferType<typeof bonusSettingsSchema>;


export default bonusSettingsSchema;
