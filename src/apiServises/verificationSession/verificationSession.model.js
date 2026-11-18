import { Schema, model } from 'mongoose';
import { SHIFTS } from '../rotation/rotation.schema.js';
import { PASSES } from '../shiftVerification/shiftVerification.schema.js';
import { SESSION_STATUSES } from './verificationSession.schema.js';



// ══════════════════════════════════════════════════════════════════════
// QUIÉN ESTÁ HACIENDO UNA VERIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Una sesión por cada vez que alguien trabaja una verificación (la 1 o la 2 de
// un turno de un local). Mientras está ACTIVA, esa verificación es suya: los
// demás solo miran. Si cierra el navegador sigue activa, para que la reanude;
// si lleva un rato sin señales (lastSeenAt), otra persona la puede tomar.
//
// Las terminadas se quedan: son el historial de quién trabajó cada turno y
// cuánto tardó. Los dos índices únicos de abajo, solo sobre las ACTIVAS, hacen
// que nunca haya dos personas en la misma verificación ni una persona con dos
// a medias, aunque abran en el mismo segundo.



const VerificationSession = new Schema({

    // QUÉ: la verificación y cuál de las dos; el local, el día y el turno van copiados para pedirlas por día
    verification:    { type: Schema.Types.ObjectId, ref: 'ShiftVerification', required: true, immutable: true },
    pass:            { type: Number, enum: PASSES, required: true, immutable: true },
    establishment:   { type: Schema.Types.ObjectId, ref: 'Local', required: true, immutable: true },
    operationalDate: { type: Date, required: true, immutable: true },
    shift:           { type: String, enum: SHIFTS, required: true, immutable: true },

    // QUIÉN: sale de la sesión, nunca del body. OJO: el modelo de usuario se registra como 'user' (minúscula).
    user: { type: Schema.Types.ObjectId, ref: 'user', required: true, immutable: true },

    // CÓMO VA (SESSION_STATUSES) y CUÁNDO: empezó, dio señales por última vez, terminó y quién la terminó
    status:     { type: String, enum: SESSION_STATUSES, default: 'active' },
    startedAt:  { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    endedAt:    { type: Date, default: null },
    endedBy:    { type: Schema.Types.ObjectId, ref: 'user', default: null },

}, { timestamps: true });


// Una verificación, una persona; una persona, una verificación a medias
VerificationSession.index({ verification: 1, pass: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
VerificationSession.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });

// La lista de /verifications pide las activas de un día
VerificationSession.index({ operationalDate: 1, status: 1 });



export default model('VerificationSession', VerificationSession);
