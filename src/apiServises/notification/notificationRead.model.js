import mongoose from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// LECTURA DE NOTIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Colección aparte, no un arreglo dentro de la notificación.
//
// Una notificación global la reciben todos los usuarios activos. Guardar los
// lectores dentro del documento obligaría a reescribirlo cada vez que alguien
// abre la campana — decenas de escrituras sobre el MISMO documento, con la
// contención que eso implica — y el arreglo crecería sin techo.
//
// Acá cada lectura es un documento pequeño e independiente. Escribir la lectura
// de un usuario no toca la de nadie más.

const NotificationReadSchema = new mongoose.Schema({

    notification: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'notification',
        required: true,
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },

    readAt: { type: Date, default: Date.now },

}, { timestamps: true });


// Una sola lectura por usuario y notificación. El índice único convierte
// "marcar como leída" en una operación idempotente: si se llama dos veces, el
// upsert no duplica.
NotificationReadSchema.index({ notification: 1, user: 1 }, { unique: true });

// Para resolver "qué leyó este usuario" de un solo golpe al pintar la campana.
NotificationReadSchema.index({ user: 1, notification: 1 });


const NotificationReadModel = mongoose.model('notificationRead', NotificationReadSchema);
export default NotificationReadModel;
