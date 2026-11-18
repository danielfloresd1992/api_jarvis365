import ClaimModel from './biometricClaim.model.js';
import { BiometricError } from './biometric.lib.js';
import { isFingerprintEventId, isKioskId } from './biometricStream.lib.js';

// ══════════════════════════════════════════════════════════════════════
// RECLAMAR UNA HUELLA ANTES DE MARCARLA
// ══════════════════════════════════════════════════════════════════════
// Ver biometricClaim.model.js. Solo se pueden reclamar huellas que este proceso
// avisó hace poco (`known`, lo sabe la escucha): así nadie puede «reservar»
// huellas futuras para que no se marquen.
//
// El kiosco solo deja de marcar con un «no» claro (`granted: false`): ante
// cualquier otra respuesta (esta API sin reclamos, 410, sin red) marca como
// siempre. El reclamo puede evitar un marcaje doble, nunca perder uno.

// claimFingerprint = «¿este kiosco registra esta huella?». El primero que la pide
// se la queda; el mismo kiosco puede volver a pedirla (si su marcaje falló).
export async function claimFingerprint({ eventId, kioskId, known }) {
    if (!isFingerprintEventId(eventId) || !isKioskId(kioskId)) throw new BiometricError('bad_request', 'Reclamo de huella inválido.');
    if (!known) throw new BiometricError('gone', 'Esa huella no la avisó este servidor, o ya pasó demasiado tiempo.');

    const terminal = eventId.split(':')[0];
    try {
        await ClaimModel.create({ _id: eventId, kioskId, terminal });
        return { granted: true };
    } catch (error) {
        if (error?.code !== 11000) throw error;
        // Ya la reclamó alguien: el mismo kiosco puede seguir; otro, no.
        const existing = await ClaimModel.findById(eventId).lean();
        return { granted: existing?.kioskId === kioskId };
    }
}
