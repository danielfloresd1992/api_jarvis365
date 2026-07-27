import { Schema, model } from 'mongoose';

/**
 * Estado persistente del watcher de monitoreo (un documento por establecimiento).
 *
 * Es la memoria durable del bucle, POR TIPO de monitoreo: `activeTypes` guarda
 * qué tipos ('analytical' | 'perimeter') estaban dentro de su ventana en el
 * último tick. Así el watcher distingue, por ejemplo, que a las 23:00 termina
 * el analítico y comienza el perimetral, y anuncia ambas transiciones.
 *
 * Tras un reinicio del servidor, el watcher se siembra desde esta colección y
 * puede emitir las transiciones reales ocurridas durante el downtime. Solo se
 * escribe en las transiciones (y en el primer avistamiento de un local), así
 * que el costo por tick es cero en régimen estable.
 */
const MonitoringState = new Schema({
    idLocal: {
        type: String,
        required: true,
        unique: true
    },

    // Último nombre conocido del local (permite anunciar el FIN de un local
    // que acaba de desactivarse y ya no aparece en la consulta de activos).
    name: {
        type: String,
        default: null
    },

    // Tipos de monitoreo dentro de su ventana en el último tick.
    activeTypes: {
        type: [String],
        default: []
    },

    // Derivado de activeTypes (¿hay algún monitoreo en curso?). Se mantiene
    // por comodidad para consultas/paneles.
    active: {
        type: Boolean,
        default: false
    },

    // ¿La última evaluación usó el horario de invierno (USA)?
    usingWinter: {
        type: Boolean,
        default: false
    },

    lastStartAt: { type: Date, default: null },
    lastEndAt:   { type: Date, default: null },

    // Corte de silencio (cada hora): resultado del último corte para el local.
    // Un local en monitoreo analítico que NO envió ninguna novedad validada al
    // grupo (givenToTheGroup) en la última hora se lista como "sin reportar".
    //   · at         → cuándo se corrió el último corte para el local
    //   · lastSentAt → último envío al grupo del día (para "sin actualización
    //                  hace X" en el front). null si no envió nada hoy.
    //   · flagged    → true si el último corte lo listó como "sin reportar"
    // (count queda por compatibilidad; el criterio ya no usa baseline.)
    noveltyCheck: {
        count: { type: Number, default: 0 },
        at:    { type: Date, default: null },
        lastSentAt: { type: Date, default: null },
        flagged: { type: Boolean, default: false }
    }
}, { timestamps: true });


export default model('MonitoringState', MonitoringState);