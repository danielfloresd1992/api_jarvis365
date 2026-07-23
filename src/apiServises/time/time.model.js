import { Schema , model } from 'mongoose';

/**
 * Documento singleton con los flags globales de tiempo de la operación.
 *
 *  - isDaylightSavingTime: horario de verano de Cuba (aplica el ±1h en toda la app).
 *  - usWinterActive:       cambio de invierno para los establecimientos de USA
 *                          (Doral). Cuando está activo, los locales marcados con
 *                          `usesUsTimezone` usan su horario alternativo de invierno.
 *                          Es un interruptor global: uno para toda la red USA.
 */
const IsDaylightSavingTimeBoolean =  model('isDaylightSavingTime', Schema({
    isDaylightSavingTime: {
        type: Boolean,
        require: true,
        default: false
    },
    usWinterActive: {
        type: Boolean,
        default: false
    },
    editBy: {
        name: String,
    }
}));


export { IsDaylightSavingTimeBoolean };