import { validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { kioskGuardDecision } from './biometricAccess.lib.js';
import { terminalCodeOf } from './biometricTerminal.lib.js';

// ══════════════════════════════════════════════════════════════════════
// EL GUARDIÁN DE LA CONFIGURACIÓN DEL KIOSCO
// ══════════════════════════════════════════════════════════════════════
// Deja pasar a:
//   - un administrador con su sesión de siempre (correo y contraseña): lo
//     decide validateAdminUser, igual que antes;
//   - o quien entró con su huella, solo para EL TERMINAL donde la puso y hasta
//     que la sesión con huella venza.
// La decisión está en kioskGuardDecision (biometricAccess.lib.js), con sus pruebas.
//
// La sesión con huella no lleva `name` ni `admin`: el resto de los guardianes
// del sistema (validateAdminUser, validateAdminSessionOnly, validateSession…)
// la rechazan por sí solos.

export function validateKioskAdmin(req, res, next) {
    const decision = kioskGuardDecision({ session: req.session, terminal: terminalCodeOf(req.query?.terminal), now: new Date() });
    if (decision.delegate) return validateAdminUser(req, res, next);
    if (decision.ok) return next();
    if (decision.clearAccess) delete req.session.biometricAccess;
    return res.status(decision.status).json({
        status: decision.status,
        error: decision.status === 401 ? 'Unauthorized' : 'Forbidden',
        message: decision.message,
    });
}
