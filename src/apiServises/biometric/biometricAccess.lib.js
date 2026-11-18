import crypto from 'node:crypto';
import { fullNameOf } from './biometricLink.lib.js';

// ══════════════════════════════════════════════════════════════════════
// ENTRAR A LA CONFIGURACIÓN DEL KIOSCO CON LA HUELLA — reglas puras
// ══════════════════════════════════════════════════════════════════════
// Un administrador puede abrir la configuración de bioJarvis poniendo el dedo
// en el terminal, sin correo ni contraseña. Es una comodidad, y por eso tiene
// tres candados que la contraseña no necesita:
//
//   1. SOLO EN TABLETS AUTORIZADAS. Un administrador, entrando con su
//      contraseña, activa la huella en ESA tablet: la API le da una llave que
//      queda guardada en la tablet (nunca en el código, que cualquiera puede
//      leer). Sin esa llave no se puede ni pedir un acceso con huella. Si no
//      fuera así, desde cualquier lugar de internet alguien podría pedir
//      accesos sin parar y esperar a que un administrador marque su asistencia.
//
//   2. LA HUELLA TIENE QUE PONERSE DESPUÉS DE PEDIR EL ACCESO, en esa misma
//      ventana corta (CHALLENGE_SECONDS) y en ESE terminal. Una huella vieja, o
//      de otro terminal, no sirve.
//
//   3. LA SESIÓN QUE DA ES CHICA. No es la de administrador de Jarvis: solo
//      abre la configuración biométrica DEL TERMINAL donde se puso el dedo, y
//      vence sola (SESSION_MINUTES). Quien entra con huella no puede tocar
//      nada más del sistema, ni la Gestión de terminal de Client365, ni
//      autorizar otras tablets.
//
// El terminal es quien reconoce la huella (es su trabajo y lo hace bien): la API
// solo lee en su registro QUIÉN puso el dedo y decide si es un administrador.


// Cuánto espera un pedido de acceso a que alguien ponga el dedo.
export const CHALLENGE_SECONDS = 30;

// Cuánto dura la sesión con huella, aunque se use (la del kiosco además se
// cierra sola tras 2 minutos sin uso y al salir de la configuración).
export const SESSION_MINUTES = 30;

// Margen por si el reloj del terminal y el del servidor no coinciden al segundo.
const CLOCK_MARGIN_MS = 1_500;



// ─── La llave de cada tablet ─────────────────────────────────────────────

// newKioskToken = «una llave nueva para una tablet» (32 bytes al azar)
export const newKioskToken = () => crypto.randomBytes(32).toString('base64url');

// hashKioskToken = «lo que se guarda de la llave»: su firma, nunca la llave
export const hashKioskToken = (token, secret) => crypto.createHmac('sha256', String(secret)).update(String(token)).digest('hex');

// isKioskTokenShape = «parece una llave nuestra» (para no consultar la base con basura)
export const isKioskTokenShape = (token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);



// ─── Quién puede entrar ──────────────────────────────────────────────────

// canLogIn = «puede entrar con su huella»: administrador del sistema y no deshabilitado
export const canLogIn = (user) => Boolean(user) && user.admin === true && user.inabilited !== true;

// loginRejection = «por qué esa huella no abre la configuración»
export function loginRejection(user, decision) {
    if (decision === 'rejected') return 'El terminal no reconoció esa huella. Vuelve a intentarlo.';
    if (!user) return 'Esa huella no está vinculada a ningún usuario del sistema.';
    if (user.inabilited === true) return `${fullNameOf(user)} está deshabilitado en el sistema.`;
    return `${fullNameOf(user)} no es administrador: no puede abrir la configuración.`;
}



// ─── El pedido de acceso ─────────────────────────────────────────────────

// newChallenge = «un pedido de acceso con huella en el terminal `terminal`».
// `afterSerial` es la última serie que la escucha ya había leído de ese terminal:
// solo cuenta una huella posterior.
export function newChallenge({ terminal, tokenId, afterSerial, now }) {
    return {
        id: crypto.randomBytes(24).toString('base64url'),
        terminal,
        tokenId,
        afterSerial: Number.isInteger(afterSerial) ? afterSerial : null,
        createdAt: now.getTime(),
        expiresAt: now.getTime() + CHALLENGE_SECONDS * 1000,
        status: 'waiting',          // waiting | approved | rejected
        user: null,
        message: null,
    };
}

export const challengeExpired = (challenge, now) => now.getTime() > challenge.expiresAt;

// challengeAccepts = «esta huella llegó a tiempo para este pedido»: después de
// pedirlo (por serie y por hora) y antes de que venza
export function challengeAccepts(challenge, { serialNo, eventAtMs }, now) {
    if (challenge.status !== 'waiting' || challengeExpired(challenge, now)) return false;
    if (challenge.afterSerial !== null && !(serialNo > challenge.afterSerial)) return false;
    return Number.isFinite(eventAtMs) && eventAtMs >= challenge.createdAt - CLOCK_MARGIN_MS;
}



// ─── La sesión con huella ────────────────────────────────────────────────

// sessionAccess = «lo que queda en la sesión»: quién, en qué terminal y hasta cuándo.
// No lleva `name` ni `admin`: los guardianes del resto del sistema la rechazan.
export function sessionAccess({ user, terminal, now }) {
    return {
        userId: String(user._id),
        name: user.name ?? '',
        surName: user.surName ?? '',
        terminal,
        at: now.getTime(),
        expiresAt: now.getTime() + SESSION_MINUTES * 60_000,
    };
}

// accessCheck = «¿esta sesión con huella sirve para este terminal, ahora?»
export function accessCheck(access, terminal, now) {
    if (!access) return { ok: false, status: 401, message: 'No autenticado: debe iniciar sesión.' };
    if (now.getTime() > access.expiresAt) return { ok: false, status: 401, message: 'La sesión con huella venció: vuelve a entrar.' };
    if (access.terminal !== terminal) return { ok: false, status: 403, message: 'Entraste con la huella en otro terminal: esta sesión solo sirve allí.' };
    return { ok: true };
}

// kioskGuardDecision = «qué hace el guardián de la configuración del kiosco»:
//   { delegate: true }  sin sesión con huella, o con la de siempre: decide validateAdminUser
//   { ok: true }        sesión con huella vigente para este terminal
//   { ok: false, … }    sesión con huella vencida (401, y se borra) o de otro terminal (403)
export function kioskGuardDecision({ session, terminal, now }) {
    const access = session?.biometricAccess;
    if (!access || session?.name) return { delegate: true };
    const check = accessCheck(access, terminal, now);
    if (check.ok) return { ok: true };
    return { ok: false, status: check.status, message: check.message, clearAccess: check.status === 401 };
}

// loggedInUser = «lo que el kiosco recibe al entrar con la huella» (la misma
// forma básica que /auth/login, con `via` para saber cómo entró)
export function loggedInUser(access) {
    return { _id: access.userId, name: access.name, surName: access.surName, admin: true, via: 'huella', terminal: access.terminal };
}
