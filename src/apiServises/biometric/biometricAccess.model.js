import { Schema, model } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// LAS TABLETS QUE PUEDEN ABRIR LA CONFIGURACIÓN CON HUELLA
// ══════════════════════════════════════════════════════════════════════
// Una fila por tablet de bioJarvis donde un administrador activó «Entrar con
// huella». La tablet guarda su llave; aquí solo queda la FIRMA de la llave
// (HMAC-SHA256 con BIOMETRIC_SECRET), como con las llaves de API: una copia de
// esta colección no sirve para pedir accesos.
//
// La llave vale solo para el terminal de esa tablet (`terminal`). Las reglas
// están en biometricAccess.lib.js.

const KioskAccessSchema = new Schema({

    terminal: { type: String, required: true, trim: true, lowercase: true },

    // `select: false`: hay que pedirla a propósito, y nunca sale en una respuesta.
    tokenHash: { type: String, required: true, unique: true, select: false },

    // Para reconocerla: «Tablet de Oficina Centro».
    label: { type: String, trim: true, maxlength: 80, default: '' },

    // Quién la activó (con su correo y contraseña).
    createdBy: { type: Schema.Types.ObjectId, ref: 'user', default: null, immutable: true },
    createdByName: { type: String, trim: true, default: '', immutable: true },

    lastUsedAt: { type: Date, default: null },
    usageCount: { type: Number, default: 0, min: 0 },

}, { timestamps: true });


export default model('biometricKioskAccess', KioskAccessSchema);
