import { model, Schema } from 'mongoose';
import { ObjectId } from 'mongodb';


export default model('Chat', new Schema({

    message: {
        // Opcional: un mensaje puede no tener texto si comparte una alerta (sharedAlert)
        type: String,
        default: ''
    },


    submittedByUser: {
        name: {
            type: String,
            require: true
        },
        userId: {
            type: ObjectId,
            require: true
        }

    },


    submittedUser : {
        type: ObjectId,
        ref: 'User'
    },

    establishment: {
        name: {
            type: String,
        },
        establishmentId: {
            type: ObjectId,
        }
    },

    // Respuesta a un mensaje específico. Se guarda un snapshot (texto + autor)
    // para renderizar la cita aunque el mensaje original no esté cargado.
    replyTo: {
        messageId: { type: ObjectId },
        message: { type: String },
        name: { type: String }
    },

    // Alerta/novedad del muro compartida en el chat: se referencia la novedad
    // y se guarda un snapshot de lo que se muestra (título, menú, aprobación, imagen).
    sharedAlert: {
        noveltyId: { type: ObjectId },
        title: { type: String },
        menu: { type: String },
        validation: { type: String },   // aprobación: 'true' | 'false' | null
        localName: { type: String },
        image: { type: String }
    },

    // Archivos adjuntos del chat (imágenes, video, PDF o documentos; hasta 100 MB c/u)
    media: [{
        url: { type: String },
        kind: { type: String },       // 'image' | 'video' | 'pdf' | 'document'
        mimeType: { type: String },
        name: { type: String },       // nombre original (para mostrar / descargar)
        size: { type: Number }
    }],

    date: { type: Date, default: Date.now }

}));