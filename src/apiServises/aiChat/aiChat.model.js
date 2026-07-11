import { Schema, model } from 'mongoose';

/*
  Conversaciones del chat con la IA (LM Studio), PRIVADAS por usuario.
  A diferencia del recurso `chat` (muro/feed compartido de la empresa), aquí
  cada documento pertenece a un único usuario (`owner`) y nunca se cruza con
  el de otros: todas las consultas del controller filtran por owner.

  IMPORTANTE: los adjuntos y las imágenes se guardan SOLO como URL (servidas
  por el recurso `multimedia`). Nunca se guarda base64 aquí; el frontend
  descarga la URL y la reconvierte cuando la necesita para la inferencia.
*/

// Adjunto de un mensaje: metadatos + URL (nunca el binario ni base64).
const AttachmentSchema = new Schema({
    name: { type: String },
    size: { type: Number },
    kind: { type: String },      // 'image' | 'pdf' | 'word' | 'sheet' | 'text' | 'zip' | 'archive' | 'video' | 'audio' | 'other'
    mimeType: { type: String },
    url: { type: String }        // URL persistente (recurso multimedia)
}, { _id: false });


// Un turno de la conversación (usuario, asistente o sistema).
const MessageSchema = new Schema({
    role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true
    },
    // Texto que recibe el modelo (puede incluir el texto extraído de adjuntos).
    content: { type: String, default: '' },
    // Texto que ve el usuario, si difiere de `content` (p. ej. sin el texto extraído).
    displayContent: { type: String },
    // Adjuntos como URL (imágenes, PDF, documentos...).
    attachments: { type: [AttachmentSchema], default: undefined },
    // Imágenes como URL (para visión; el front las reconvierte a base64).
    images: { type: [String], default: undefined },
    date: { type: Date, default: Date.now }
}, { _id: true });


const AiChatSchema = new Schema({
    // Dueño de la conversación: siempre el usuario de la sesión, nunca del body.
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true,
        index: true
    },
    title: {
        type: String,
        default: 'Nueva conversación',
        trim: true
    },
    messages: {
        type: [MessageSchema],
        default: []
    }
}, { timestamps: true }); // createdAt / updatedAt automáticos


export default model('AiChat', AiChatSchema);
