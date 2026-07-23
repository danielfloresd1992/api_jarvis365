import { model, Schema } from 'mongoose';

/**
 * Horario de monitoreo por establecimiento (colección `schedules`).
 *
 * Un rango (MonitoringRange) representa una franja de vigilancia de un día:
 *   - `dayMonitoring`  día de la semana (convención Date.getDay(): 0=Dom … 6=Sáb)
 *   - `hours.start/end` "HH:mm" (o "HH:mm:ss") en la hora de referencia (Cuba)
 *   - `type`           tipo de monitoreo de ESE rango: 'analytical' | 'perimeter'
 *
 * Un mismo día puede tener varios rangos, incluso solapados y de distinto tipo
 * (p. ej. 12:00–23:00 analítico + 23:00–07:00 perimetral). Un rango cuyo `end`
 * es menor o igual que `start` se interpreta como CORRIDO: cruza la medianoche y
 * termina en la madrugada del día siguiente (p. ej. 19:00→07:00). Esa lógica
 * vive en la capa de negocio, no en el esquema.
 *
 * Zona horaria USA (Doral): cuando `usesUsTimezone` es true, el establecimiento
 * usa el horario alternativo `dayMonitoringWinter` durante el cambio de invierno
 * en lugar de `dayMonitoring`. La conmutación (qué horario aplica ahora) la
 * resuelve la capa de negocio; el esquema solo almacena ambos horarios.
 */

const MonitoringRange = new Schema({
    // Día de la semana (0=Dom, 1=Lun … 6=Sáb). El nombre se conserva por
    // compatibilidad con el front (ScheduleBox filtra por day.dayMonitoring).
    dayMonitoring: {
        type: Number,
        require: true
    },

    hours: {
        start: {
            type: String,
            require: true
        },
        end: {
            type: String,
            require: true
        }
    },

    // Tipo de monitoreo de este rango. Por defecto 'analytical' para no romper
    // los rangos existentes, que se guardaron sin este campo.
    type: {
        type: String,
        enum: {
            values: ['analytical', 'perimeter'],
            message: "'{VALUE}' no es válido. Valores permitidos: 'analytical', 'perimeter'"
        },
        default: 'analytical'
    },

    idLocal: {
        type: String
    },

    // Identificador del rango (lo usa el front para eliminarlo).
    key: {
        type: String
    }
}, { _id: false });


const Schedules = new Schema({
    idLocal: {
        type: String,
        require: true,
        unique: true
    },

    // Horario de monitoreo normal (hora de Cuba).
    dayMonitoring: {
        type: [MonitoringRange],
        default: []
    },

    // ── Ajuste de zona horaria USA (invierno) ─────────────────────────────────
    // true → este establecimiento está en una zona horaria de USA (Doral) que
    // aplica cambio de invierno; el sistema usará `dayMonitoringWinter` cuando el
    // cambio esté activo. Lo gestiona un panel de control (solo admin).
    usesUsTimezone: {
        type: Boolean,
        default: false
    },

    // Horario alternativo, usado solo cuando `usesUsTimezone` está activo y el
    // cambio de invierno está en vigor. Misma forma que `dayMonitoring`.
    dayMonitoringWinter: {
        type: [MonitoringRange],
        default: []
    }
});


export { MonitoringRange };
export default model('Schedules', Schedules);