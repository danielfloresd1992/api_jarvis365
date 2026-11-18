// ══════════════════════════════════════════════════════════════════════
// QUIÉN TIENE UNA VERIFICACIÓN — lo que no toca la base
// ══════════════════════════════════════════════════════════════════════
// Una verificación (la 1 o la 2 de un turno) la trabaja UNA persona a la vez.
// Al abrir el panel, quien entra la toma; si ya es suya, la reanuda (cerró el
// navegador, o vuelve desde otro equipo); si es de otra, solo mira. Quien la
// tiene avisa cada poco de que sigue ahí (lastSeenAt): si lleva IDLE_MS sin
// avisar, otra persona la puede TOMAR, y queda dicho quién la tomó. Cerrar el
// navegador no la suelta: así se puede reanudar.
//
// Las decisiones viven aquí, puras, para probarlas sin Mongo
// (test/verificationSession.test.ts). El bloqueo de verdad lo hacen los
// endpoints que escriben en la verificación (guardDecision).



// IDLE_MS = «cuánto sin dar señales para que se pueda tomar»: 15 minutos
export const IDLE_MS = 15 * 60 * 1000;

// SESSION_EVENT = «el aviso en vivo de las sesiones»: a todos, con lo que cambió
export const SESSION_EVENT = 'verification-session';

// SESSION_ACTIONS = «lo que se avisa»: que alguien la tomó, la reanudó, se la quitaron, la soltó o se cerró
export const SESSION_ACTIONS = ['claim', 'resume', 'take', 'release', 'close'];


// isMine = «la sesión es de esa persona»
export const isMine = (session, userId) => Boolean(session && userId && String(session.user?._id ?? session.user) === String(userId));

// isIdle = «la sesión lleva más de IDLE_MS sin señales»
export const isIdle = (session, now = new Date()) => !session?.lastSeenAt || now.getTime() - new Date(session.lastSeenAt).getTime() > IDLE_MS;


// acquireOutcome = «qué pasa cuando alguien abre una verificación»
//   held   la sesión activa de esa verificación (o null)
//   own    la sesión activa de esa persona, sea de la verificación que sea (o null)
// Devuelve { outcome }:
//   'resume'     ya era suya: la sigue
//   'busy'       es de otra persona (con `idle`: si ya se puede tomar)
//   'elsewhere'  esa persona tiene otra a medias: una a la vez
//   'acquire'    está libre: es suya
export function acquireOutcome({ held, own, userId, now = new Date() }) {
    if (held && isMine(held, userId)) return { outcome: 'resume' };
    if (held) return { outcome: 'busy', idle: isIdle(held, now) };
    if (own) return { outcome: 'elsewhere' };
    return { outcome: 'acquire' };
}


// takeProblem = «por qué no se puede tomar esa sesión», o null. Se toma una de otra persona que lleva un rato sin
// señales; un administrador, cualquiera.
export function takeProblem(session, { userId, isAdmin = false, now = new Date() }) {
    if (!session || session.status !== 'active') return 'Esa verificación ya no la tiene nadie: ábrela otra vez';
    if (isMine(session, userId)) return 'Esa verificación ya es tuya';
    if (!isAdmin && !isIdle(session, now)) return `Sigue activa: se puede tomar cuando lleve ${IDLE_MS / 60000} minutos sin actividad`;
    return null;
}

// releaseProblem = «por qué no se puede soltar esa sesión», o null: la suelta quien la tiene, o un administrador
export function releaseProblem(session, { userId, isAdmin = false }) {
    if (!session || session.status !== 'active') return 'Esa verificación ya no está tomada';
    if (!isMine(session, userId) && !isAdmin) return 'Solo quien la tiene, o un administrador, la puede soltar';
    return null;
}


// guardDecision = «si esa persona puede escribir en la verificación», según la sesión activa de esa verificación:
// null si puede; si no, { code, message } para responder 423. Sin sesión tampoco se escribe: hay que abrirla.
export function guardDecision(held, userId) {
    if (!held) return { code: 'unclaimed', message: 'Abre la verificación para trabajar en ella: nadie la tiene ahora' };
    if (!isMine(held, userId)) return { code: 'busy', message: `Esta verificación la está haciendo ${personName(held.user)}: solo puedes mirarla` };
    return null;
}


// personName = «el nombre de una persona poblada»
export function personName(person) {
    return [person?.name, person?.surName].filter(Boolean).join(' ') || 'otra persona';
}


// present = «una sesión como la recibe el panel»: con su día (AAAA-MM-DD, para armar el enlace de reanudar), si es
// de quien pregunta y si ya se puede tomar
export const present = (session, userId, now = new Date()) => (session ? {
    ...session,
    day: new Date(session.operationalDate).toISOString().slice(0, 10),
    mine: isMine(session, userId),
    idle: isIdle(session, now),
} : null);


// PEOPLE = «lo que viaja poblado con una sesión»: quién la tiene, quién la terminó y el local
export const PEOPLE = [
    { path: 'user', select: 'name surName img' },
    { path: 'endedBy', select: 'name surName' },
    { path: 'establishment', select: 'name' },
];
