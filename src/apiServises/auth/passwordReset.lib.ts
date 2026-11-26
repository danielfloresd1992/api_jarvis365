import { createHash, randomBytes } from 'crypto';

// ══════════════════════════════════════════════════════════════════════
// RESTABLECER LA CONTRASEÑA POR CORREO: LAS REGLAS
// ══════════════════════════════════════════════════════════════════════
// Todo lo que decide el restablecimiento y se puede decidir sin Mongo ni
// Express: fabricar el token, reconocerlo, armar el enlace, a qué portal va y
// qué dicen los dos correos. Es puro a propósito, igual que `apiKey.lib`, para
// probarlo entero con `npm test`.
//
//
// EL FLUJO
//
//   1. La persona escribe su correo en el portal → POST /auth/password/forgot.
//      La API contesta SIEMPRE lo mismo, exista la cuenta o no: si contestara
//      distinto, el formulario serviría para averiguar qué correos tienen
//      cuenta.
//   2. Si la cuenta existe, se le manda un enlace con un token de un solo uso
//      que caduca a los RESET_MINUTES.
//   3. El portal abre el enlace, pregunta si el token sigue vivo
//      (/reset/check) y pide la contraseña nueva (/reset). Al cambiarla se
//      cierran las sesiones abiertas de esa cuenta y se avisa por correo.
//
//
// EL TOKEN NO SE GUARDA
//
// En la base va su SHA-256, no el token. Quien lea la colección no puede
// armar un enlace válido. No hace falta la lentitud de bcrypt: el token son
// 32 bytes de azar, no algo que una persona eligió, y contra eso no sirve un
// diccionario.


// RESET_MINUTES = «cuánto vale un enlace desde que se pide»
export const RESET_MINUTES = 30;

// RESEND_COOLDOWN_SECONDS = «cuánto hay que esperar para que la misma cuenta reciba otro enlace». Frena que alguien
// llene el buzón de otra persona pidiendo enlaces sin parar; el límite por IP de la ruta frena el resto.
export const RESEND_COOLDOWN_SECONDS = 60;

// RESET_PATH = «la pantalla del portal que recibe el enlace»
export const RESET_PATH = '/acceso/restablecer';


/**
 * Un token nuevo y la huella que se guarda de él.
 *
 * `randomBytes` es el generador criptográfico del sistema, no `Math.random`.
 * En base64url salen 43 caracteres sin `+`, `/` ni `=`, así que viajan en una
 * URL sin escapar nada.
 */
export const createResetToken = (): { token: string; tokenHash: string } => {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: hashResetToken(token) };
};


/** La huella de un token: lo que se guarda y por lo que se busca. */
export const hashResetToken = (token: string): string => createHash('sha256').update(String(token)).digest('hex');


/**
 * ¿Tiene la forma de un token de este sistema?
 *
 * Descarta lo que no generó `createResetToken` sin ir a la base. Recibe texto
 * de fuera, así que no lanza: lo que no encaja es un enlace que no vale.
 */
export const isResetTokenShape = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);


// EMAIL_SHAPE = «la forma mínima de un correo: algo, arroba, algo, punto, algo»
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El correo como se compara: sin espacios y en minúsculas. */
export const normalizeEmail = (value: unknown): string => String(value ?? '').trim().toLowerCase();


/**
 * El correo con el nombre tapado: «d•••@restaurante.com».
 *
 * Es lo que la pantalla del enlace enseña para que la persona sepa de qué
 * cuenta es, sin que el enlace reenviado a otro destape la dirección entera.
 */
export const maskEmail = (email: string): string => {
    const [local, domain] = String(email ?? '').split('@');
    if (!local || !domain) return '•••';
    return `${local[0]}•••@${domain}`;
};


// ── A qué portal va el enlace ──────────────────────────────────────────
// El enlace NUNCA sale del cuerpo de la petición: si saliera, cualquiera podría
// pedir un restablecimiento para otra persona con el enlace apuntando a su propia
// página, y el correo legítimo de Jarvis365 serviría para robarle el token. El
// cuerpo solo dice a qué portal va, de esta lista; la dirección sale del entorno.

// RESET_APPS = «los portales que reciben enlaces: la variable de entorno con su dirección, y la de desarrollo»
export const RESET_APPS = {
    insights: { env: 'INSIGHTS_URL', devUrl: 'http://localhost:5174' },
} as const;

export type ResetApp = keyof typeof RESET_APPS;

export const RESET_APP_NAMES = Object.keys(RESET_APPS) as ResetApp[];


/**
 * La dirección del portal, o `null` si no está configurada.
 *
 * En desarrollo cae a la del servidor local; en producción no hay respaldo, a
 * propósito: un enlace a localhost en un correo real no le sirve a nadie, y es
 * mejor que la ruta conteste que no está configurada.
 */
export const resetBaseFor = (
    app: ResetApp,
    env: Record<string, string | undefined>,
    isDevelopment: boolean,
): string | null => {
    const portal = RESET_APPS[app];
    if (!portal) return null;
    const configured = String(env[portal.env] ?? '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    return isDevelopment ? portal.devUrl : null;
};


/**
 * El enlace que va en el correo.
 *
 * El token viaja después de `#`, no en la query. El navegador no manda esa parte
 * al servidor ni la pone en el Referer, así que no queda en el log del
 * hosting ni se le escapa a una página externa.
 */
export const resetLink = (base: string, token: string): string =>
    `${String(base).replace(/\/+$/, '')}${RESET_PATH}#token=${token}`;


/**
 * De todas las sesiones guardadas, las que son de esta persona.
 *
 * Acepta las dos formas en que llegan: connect-redis da un arreglo con `id` en
 * cada sesión, y el MemoryStore de respaldo da un objeto indexado por id.
 * `addCredentials` deja el usuario en `userId` y en `dataUser._id`; se miran
 * los dos.
 */
export const sessionIdsOf = (sessions: unknown, userId: string): string[] => {
    if (!sessions || typeof sessions !== 'object') return [];
    const list: Array<{ id?: string } & Record<string, any>> = Array.isArray(sessions)
        ? sessions
        : Object.entries(sessions as Record<string, any>).map(([id, session]) => ({ ...(session ?? {}), id }));

    const wanted = String(userId);
    return list
        .filter(session => session?.id && String(session.userId ?? session.dataUser?._id ?? '') === wanted)
        .map(session => String(session.id));
};


// ── Los correos ────────────────────────────────────────────────────────
// Texto plano y HTML del mismo mensaje: hay clientes que solo enseñan uno de los
// dos. El HTML es de tablas y estilos en línea, que es lo único que respetan
// Outlook y Gmail. Colores de Amazonas: tinta, marfil y el verde del botón con
// la tinta encima.

export type MailContent = { subject: string; text: string; html: string };

/** Escapa lo que va dentro del HTML: el nombre lo escribió una persona. */
export const escapeHtml = (value: unknown): string =>
    String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

const greeting = (name?: string | null) => (name && name.trim() ? `Hola, ${name.trim()}:` : 'Hola:');

/** El marco común de los dos correos: el cuerpo va dentro, sobre marfil. */
const mailFrame = (inner: string): string => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f4f2ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fbf8f0;border:1px solid #ece5d5;border-radius:12px;">
<tr><td style="padding:32px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#2f2a1e;">Jarvis365</td></tr>
<tr><td style="padding:8px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2f2a1e;">${inner}</td></tr>
</table>
<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#564e40;">Amazonas365 · Este correo se envía solo; no hace falta contestarlo.</p>
</td></tr>
</table>
</body></html>`;


/** El correo con el enlace para crear la contraseña nueva. */
export const resetMail = ({ name, email, link, minutes }: { name?: string | null; email: string; link: string; minutes: number }): MailContent => {
    const subject = 'Restablece tu contraseña de Jarvis365';
    const text = [
        greeting(name),
        '',
        `Alguien pidió restablecer la contraseña de tu cuenta de Jarvis365 (${email}).`,
        'Si fuiste tú, crea una nueva con este enlace:',
        '',
        link,
        '',
        `El enlace caduca en ${minutes} minutos y sirve una sola vez.`,
        'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.',
    ].join('\n');

    const html = mailFrame(`
<p style="margin:0 0 16px;">${escapeHtml(greeting(name))}</p>
<p style="margin:0 0 16px;">Alguien pidió restablecer la contraseña de tu cuenta de Jarvis365 (<strong>${escapeHtml(email)}</strong>). Si fuiste tú, crea una nueva con este botón:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>
<td style="border-radius:8px;background:#29c50c;">
<a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#2f2a1e;text-decoration:none;border-radius:8px;">Crear contraseña nueva</a>
</td></tr></table>
<p style="margin:0 0 16px;color:#564e40;">El enlace caduca en ${minutes} minutos y sirve una sola vez.</p>
<p style="margin:0 0 16px;color:#564e40;">Si no fuiste tú, ignora este correo: tu contraseña sigue igual.</p>
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #ece5d5;font-size:12px;color:#564e40;word-break:break-all;">Si el botón no abre, copia esta dirección en el navegador:<br>${escapeHtml(link)}</p>`);

    return { subject, text, html };
};


// WHEN_FORMAT = «la fecha del aviso, en la hora de Caracas, que es la de la operación»
const WHEN_FORMAT = new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' });

/** El aviso de que la contraseña cambió, por si no fue la persona. */
export const passwordChangedMail = ({ name, when }: { name?: string | null; when: Date }): MailContent => {
    const subject = 'Tu contraseña de Jarvis365 cambió';
    const whenText = WHEN_FORMAT.format(when);
    const text = [
        greeting(name),
        '',
        `La contraseña de tu cuenta de Jarvis365 se cambió el ${whenText} (hora de Caracas).`,
        'Por seguridad se cerraron las sesiones que tenías abiertas: entra de nuevo con la contraseña nueva.',
        '',
        'Si no fuiste tú, avisa enseguida a tu contacto de Jarvis365.',
    ].join('\n');

    const html = mailFrame(`
<p style="margin:0 0 16px;">${escapeHtml(greeting(name))}</p>
<p style="margin:0 0 16px;">La contraseña de tu cuenta de Jarvis365 se cambió el <strong>${escapeHtml(whenText)}</strong> (hora de Caracas).</p>
<p style="margin:0 0 16px;color:#564e40;">Por seguridad se cerraron las sesiones que tenías abiertas: entra de nuevo con la contraseña nueva.</p>
<p style="margin:0;">Si no fuiste tú, avisa enseguida a tu contacto de Jarvis365.</p>`);

    return { subject, text, html };
};
