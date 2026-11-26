import { Schema, model, Types } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// LOS ENLACES PARA RESTABLECER LA CONTRASEÑA
// ══════════════════════════════════════════════════════════════════════
// Una fila por enlace pedido. El token NO está aquí: se guarda su SHA-256
// (`tokenHash`), y es por lo que se busca cuando el portal lo presenta. Las
// reglas viven en `passwordReset.lib.ts`.
//
// Un enlace vale si `usedAt` es null y `expiresAt` no ha pasado. Al usarlo se
// marca `usedAt` en la misma operación que lo busca (findOneAndUpdate), para
// que dos envíos a la vez no lo puedan usar los dos.
//
// Mongo borra cada fila un día después de caducar (índice TTL). Ese día de
// margen deja ver quién pidió qué si alguien pregunta por un correo raro.


export interface PasswordResetDoc {
    /** De quién es la cuenta. */
    user: Types.ObjectId;

    /** El SHA-256 del token. Nunca sale en una respuesta. */
    tokenHash: string;

    /** Hasta cuándo vale. */
    expiresAt: Date;

    /** Cuándo se usó. Null = sigue sin usar. */
    usedAt: Date | null;

    /** Desde dónde se pidió y desde dónde se usó, para rendir cuentas. */
    requestedIp: string;
    requestedAgent: string;
    usedIp: string;

    createdAt: Date;
    updatedAt: Date;
}


const PasswordReset = new Schema<PasswordResetDoc>({

    // `ref: 'user'` en minúscula: así está registrado el modelo de usuario.
    user: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true,
        immutable: true,
    },

    tokenHash: {
        type: String,
        required: true,
        immutable: true,
        select: false,
    },

    expiresAt: {
        type: Date,
        required: true,
    },

    usedAt: {
        type: Date,
        default: null,
    },

    requestedIp: { type: String, default: '' },
    requestedAgent: { type: String, default: '', maxlength: 300 },
    usedIp: { type: String, default: '' },

}, { timestamps: true });


// La búsqueda del enlace que llega del portal.
PasswordReset.index({ tokenHash: 1 }, { unique: true });

// Los enlaces vivos de una persona: para la espera entre envíos y para anular
// los anteriores al pedir uno nuevo.
PasswordReset.index({ user: 1, usedAt: 1, createdAt: -1 });

// La limpieza: Mongo borra la fila un día después de `expiresAt`.
PasswordReset.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });


export default model<PasswordResetDoc>('PasswordReset', PasswordReset);
