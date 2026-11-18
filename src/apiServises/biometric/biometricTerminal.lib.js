import crypto from 'node:crypto';

// ══════════════════════════════════════════════════════════════════════
// TERMINALES BIOMÉTRICOS — reglas puras
// ══════════════════════════════════════════════════════════════════════
// La API habla con VARIOS terminales, uno por oficina, cada uno en su dirección
// pública (IP o dominio). Aquí está lo que se decide sin red ni base: el código
// de cada terminal, si una dirección sirve, el cifrado de su contraseña y la
// forma en que un terminal sale hacia el navegador.
//
// COMPATIBILIDAD. El terminal de BIOMETRIC_HOST / BIOMETRIC_USER /
// BIOMETRIC_PASSWORD del .env es el «principal». Mientras nadie lo administre
// desde Client365 se sigue leyendo del .env, y todo kiosco que no dice cuál es
// su terminal es del principal: lo que ya funcionaba sigue igual.
//
// LA CONTRASEÑA DE CADA TERMINAL va cifrada (AES-256-GCM) con una clave que
// sale de BIOMETRIC_SECRET, en el .env. A diferencia de las llaves de API, no
// basta una firma: la API necesita la contraseña de verdad para hablarle al
// equipo. GCM, además de cifrar, detecta si alguien la alteró en la base.



// El código del terminal del .env, y el de todo kiosco que no dice el suyo.
export const PRINCIPAL_CODE = 'principal';

export const CODE_MAX_LENGTH = 30;

// BIOMETRIC_SECRET tiene que ser largo: de él sale la clave que cifra las contraseñas.
export const MIN_SECRET_LENGTH = 32;

const CODE_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

const DEFAULT_PORT = { http: 80, https: 443 };



// ─── Código y dirección ──────────────────────────────────────────────────

// isTerminalCode = «un código de terminal aceptable»: minúsculas, números y
// guiones, de 1 a 30, sin guion al principio ni al final ("oficina-centro")
export const isTerminalCode = (text) => typeof text === 'string' && CODE_RE.test(text);

// codeFromName = «un código a partir del nombre»: "Oficina Centro" → "oficina-centro"
export function codeFromName(name) {
    return String(name ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, CODE_MAX_LENGTH)
        .replace(/-+$/g, '');
}

// terminalCodeOf = «el terminal que se pide», con el principal si no se dice ninguno
export function terminalCodeOf(value) {
    const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return code === '' ? PRINCIPAL_CODE : code;
}

// isValidHost = «una IP o un dominio» (sin protocolo, puerto ni ruta)
export function isValidHost(text) {
    if (typeof text !== 'string' || text.trim() !== text || text === '') return false;
    if (/^[\d.]+$/.test(text)) return IPV4_RE.test(text);   // solo números y puntos: tiene que ser una IPv4
    return HOSTNAME_RE.test(text);
}

// addressOf = «la dirección para mostrar»: "http://72.68.60.160", "https://bio.empresa.com:8443"
export function addressOf({ protocol = 'http', host, port }) {
    const shownPort = port && port !== DEFAULT_PORT[protocol] ? `:${port}` : '';
    return `${protocol}://${host}${shownPort}`;
}



// ─── Contraseña cifrada ──────────────────────────────────────────────────

// isUsableSecret = «BIOMETRIC_SECRET sirve para cifrar»
export const isUsableSecret = (secret) => typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH;

const keyOf = (secret) => crypto.createHash('sha256').update(String(secret)).digest();

// encryptSecret = «la contraseña cifrada», como "v1:<iv>:<etiqueta>:<datos>" en base64
export function encryptSecret(plain, secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(secret), iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

// decryptSecret = «la contraseña de vuelta». Lanza si el texto está alterado o
// si se cifró con otra clave (BIOMETRIC_SECRET cambió).
export function decryptSecret(blob, secret) {
    const [version, iv, tag, data] = String(blob ?? '').split(':');
    if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Contraseña cifrada con un formato desconocido.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}



// ─── Los terminales ──────────────────────────────────────────────────────

// envTerminal = «el terminal principal del .env», o null si falta algún dato
export function envTerminal(env) {
    const { BIOMETRIC_HOST: host, BIOMETRIC_USER: username, BIOMETRIC_PASSWORD: password } = env ?? {};
    if (!host || !username || !password) return null;
    const [hostname, port] = String(host).split(':');
    return {
        source: 'env',
        code: PRINCIPAL_CODE,
        name: 'Terminal principal',
        office: '',
        protocol: 'http',
        host: hostname,
        port: Number(port) || DEFAULT_PORT.http,
        username,
        password,
        enabled: true,
    };
}

// deviceOf = «cómo hablarle a un terminal»: lo que usa biometric.service.js
export function deviceOf(terminal, password) {
    const protocol = terminal.protocol === 'https' ? 'https' : 'http';
    return {
        protocol,
        hostname: terminal.host,
        port: Number(terminal.port) || DEFAULT_PORT[protocol],
        username: terminal.username,
        password,
    };
}

// publicTerminal = «un terminal como sale hacia el navegador». La contraseña no
// sale NUNCA, ni cifrada: para cambiarla se escribe una nueva.
export function publicTerminal(terminal) {
    const protocol = terminal.protocol === 'https' ? 'https' : 'http';
    return {
        id: terminal._id ? String(terminal._id) : null,
        source: terminal.source ?? 'db',
        code: terminal.code,
        name: terminal.name,
        office: terminal.office ?? '',
        protocol,
        host: terminal.host,
        port: Number(terminal.port) || DEFAULT_PORT[protocol],
        address: addressOf({ protocol, host: terminal.host, port: Number(terminal.port) || DEFAULT_PORT[protocol] }),
        username: terminal.username ?? '',
        enabled: terminal.enabled !== false,
        device: terminal.device ?? null,
        lastCheck: terminal.lastCheck ?? null,
        createdAt: terminal.createdAt ?? null,
        updatedAt: terminal.updatedAt ?? null,
    };
}

// checkSummary = «lo que se le muestra al administrador de una comprobación»
export function checkSummary(result) {
    if (!result.ok) return { ok: false, message: result.message };
    return {
        ok: true,
        message: null,
        device: result.device,
        clock: result.clock ? {
            deviceLocalTime: result.clock.deviceLocalTime,
            businessLocalTime: result.clock.businessLocalTime,
            driftSeconds: result.clock.driftSeconds,
            zoneMatches: result.clock.zoneMatches,
            needsSync: result.clock.needsSync,
        } : null,
        users: result.users ?? null,
        fingerprints: result.fingerprints ?? null,
        capacity: result.capacity ?? null,
    };
}

// checkRecord = «lo que se guarda de una comprobación», haya salido bien o no
export function checkRecord(result, now) {
    if (result.ok) {
        return {
            at: now,
            ok: true,
            message: null,
            driftSeconds: result.clock?.driftSeconds ?? null,
            users: result.users ?? null,
            fingerprints: result.fingerprints ?? null,
            capacity: result.capacity ?? null,
        };
    }
    return { at: now, ok: false, message: result.message, driftSeconds: null, users: null, fingerprints: null, capacity: null };
}
