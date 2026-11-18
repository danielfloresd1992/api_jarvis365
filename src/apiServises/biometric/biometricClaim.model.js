import { Schema, model } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// QUÉ KIOSCO MARCA CADA HUELLA
// ══════════════════════════════════════════════════════════════════════
// Cada huella avisada a los kioscos se marca UNA vez. Antes de tomar la foto y
// marcar, el kiosco la reclama: el primero se la queda y los demás no hacen
// nada. Sin esto, dos kioscos del mismo terminal (una tablet y una PC, o dos
// pestañas) marcarían la misma huella dos veces, y la API la tomaría como
// entrada y salida.
//
// `_id` es la huella misma, «terminal:serie» («principal:47064»): el índice
// único de _id decide quién llegó primero, aunque haya varias APIs con la misma
// base. Se borran solas a los dos días.

const ClaimSchema = new Schema({

    _id: { type: String },

    // Quién se la quedó: un identificador al azar de cada kiosco abierto.
    kioskId: { type: String, required: true },

    terminal: { type: String, required: true },

    createdAt: { type: Date, default: Date.now, expires: 2 * 24 * 60 * 60 },

}, { versionKey: false });


export default model('biometricMarkClaim', ClaimSchema);
