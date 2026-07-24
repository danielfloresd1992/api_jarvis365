import { Schema, model } from 'mongoose';

/**
 * Registro de cortes ya enviados del reporte de novedades (idempotencia).
 *
 * Un documento por corte: `slotKey` = `<día operativo>_<HH>` (o `_final`).
 * El índice único garantiza que un corte no se envíe dos veces aunque el
 * servidor se reinicie o el tick del watcher se dispare de más: el primer
 * proceso que inserta el doc "gana" el corte; los demás reciben duplicate key.
 * Si el envío falla, el doc se elimina para permitir el reintento.
 */
const NoveltyReportLog = new Schema({
    slotKey: {
        type: String,
        required: true,
        unique: true
    },
    sentAt: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['sending', 'sent', 'failed'],
        default: 'sending'
    },
    lastError: {
        type: String,
        default: null
    }
}, { timestamps: true });


export default model('NoveltyReportLog', NoveltyReportLog);