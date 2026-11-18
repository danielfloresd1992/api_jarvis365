import { Schema, model } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// LOS TERMINALES BIOMÉTRICOS QUE LEE LA API
// ══════════════════════════════════════════════════════════════════════
// Uno por equipo, en cualquier oficina: la API les habla por su dirección
// pública. Se administran desde Client365 (Gestión de terminal). Las reglas
// están en biometricTerminal.lib.js y lo que toca la base en
// biometricTerminal.service.js.
//
// `code` es lo que dice cada kiosco de bioJarvis para saber cuál es su terminal
// (VITE_BIOMETRIC_TERMINAL). Por eso no cambia después de creado: cambiarlo
// dejaría a ese kiosco hablándole a un terminal que ya no existe.
//
// LA CONTRASEÑA NO ESTÁ EN CLARO. `passwordEnc` es AES-256-GCM con la clave de
// BIOMETRIC_SECRET, y lleva `select: false`, como la firma de las llaves de API:
// hay que pedirla a propósito con `.select('+passwordEnc')`, y nunca sale en una
// respuesta.


const TerminalSchema = new Schema({

    code: { type: String, required: true, unique: true, trim: true, lowercase: true, immutable: true },

    name: { type: String, required: true, trim: true, maxlength: 60 },

    // Dónde está: «Oficina Centro», «Sede Norte». Solo para reconocerlo.
    office: { type: String, trim: true, maxlength: 80, default: '' },

    protocol: { type: String, enum: ['http', 'https'], default: 'http' },
    host: { type: String, required: true, trim: true, maxlength: 253 },
    port: { type: Number, min: 1, max: 65535, default: 80 },

    username: { type: String, required: true, trim: true, maxlength: 64 },
    passwordEnc: { type: String, required: true, select: false },

    // Apagado = la API no lo lee ni deja usarlo, sin perder sus datos.
    enabled: { type: Boolean, default: true },

    // Lo que dijo el propio equipo en la última comprobación.
    device: {
        name: { type: String, default: null },
        model: { type: String, default: null },
        serialNumber: { type: String, default: null },
        firmwareVersion: { type: String, default: null },
        firmwareBuild: { type: String, default: null },
    },

    lastCheck: {
        at: { type: Date, default: null },
        ok: { type: Boolean, default: null },
        message: { type: String, default: null },
        driftSeconds: { type: Number, default: null },
        users: { type: Number, default: null },
        fingerprints: { type: Number, default: null },
        capacity: { type: Number, default: null },
    },

    // `ref: 'user'` en minúscula: así está registrado el modelo de usuario.
    createdBy: { type: Schema.Types.ObjectId, ref: 'user', default: null, immutable: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'user', default: null },

}, { timestamps: true });


export default model('biometricTerminal', TerminalSchema);
