import mongoose from 'mongoose';
import TerminalModel from './biometricTerminal.model.js';
import { BiometricError } from './biometric.lib.js';
import {
    PRINCIPAL_CODE, MIN_SECRET_LENGTH, isTerminalCode, codeFromName, terminalCodeOf, isUsableSecret,
    encryptSecret, decryptSecret, envTerminal, deviceOf, publicTerminal, checkSummary, checkRecord,
} from './biometricTerminal.lib.js';
import { createTerminalSchema, updateTerminalSchema, testTerminalSchema } from './biometricTerminal.schema.js';
import { checkDevice } from './biometric.service.js';

// ══════════════════════════════════════════════════════════════════════
// TERMINALES — lo que toca la base
// ══════════════════════════════════════════════════════════════════════
// Guardarlos y comprobarlos desde Client365 (Gestión de terminal), y resolver
// a qué terminal hablarle: en cada petición (resolveTerminal) y en la escucha
// (activeTerminals). Las reglas están en biometricTerminal.lib.js.
//
// El principal del .env NO se copia solo a la base: un administrador lo pasa a
// la base con «Administrar desde aquí» (importEnvTerminal). Hasta entonces se
// sigue leyendo del .env, como siempre.



const secretOf = () => process.env.BIOMETRIC_SECRET;

function requireSecret() {
    const secret = secretOf();
    if (!isUsableSecret(secret)) {
        throw new BiometricError('not_configured', `Falta BIOMETRIC_SECRET en el .env de la API (${MIN_SECRET_LENGTH} caracteres o más): sin ella no se pueden guardar ni leer las contraseñas de los terminales.`);
    }
    return secret;
}

// La contraseña guardada de un terminal, descifrada.
function passwordOf(doc) {
    const secret = requireSecret();
    try {
        return decryptSecret(doc.passwordEnc, secret);
    } catch {
        throw new BiometricError('not_configured', `No se pudo leer la contraseña guardada del terminal «${doc.name}»: ¿cambió BIOMETRIC_SECRET? Vuelve a escribirla en Gestión de terminal.`);
    }
}

async function validate(schema, body) {
    try {
        return await schema.validate(body ?? {}, { abortEarly: false, stripUnknown: true });
    } catch (error) {
        if (error?.name === 'ValidationError') throw new BiometricError('bad_request', error.errors.join(' · '));
        throw error;
    }
}

function ensureId(id) {
    if (!mongoose.isValidObjectId(id)) throw new BiometricError('bad_request', 'El terminal no es válido.');
}

const defaultPortOf = (protocol) => (protocol === 'https' ? 443 : 80);

const fromEnv = (env) => ({ code: env.code, name: env.name, office: '', source: 'env', id: null, device: deviceOf(env, env.password) });



// ─── A qué terminal hablarle ─────────────────────────────────────────────

// resolveTerminal = «el terminal con este código, listo para hablarle». Sin
// código, el principal: así los kioscos y llamadas de antes siguen igual.
export async function resolveTerminal(codeInput) {
    const code = terminalCodeOf(codeInput);
    if (!isTerminalCode(code)) throw new BiometricError('bad_request', `«${code}» no es un código de terminal válido.`);

    let doc;
    try {
        doc = await TerminalModel.findOne({ code }).select('+passwordEnc').lean();
    } catch (error) {
        // Sin base, el principal del .env sigue funcionando.
        const env = code === PRINCIPAL_CODE ? envTerminal(process.env) : null;
        if (env) return fromEnv(env);
        throw error;
    }

    if (doc) {
        if (doc.enabled === false) throw new BiometricError('not_configured', `El terminal «${doc.name}» está desactivado en Gestión de terminal.`);
        return { code, name: doc.name, office: doc.office ?? '', source: 'db', id: String(doc._id), device: deviceOf(doc, passwordOf(doc)) };
    }
    if (code === PRINCIPAL_CODE) {
        const env = envTerminal(process.env);
        if (env) return fromEnv(env);
        throw new BiometricError('not_configured', 'No hay terminal principal: agrégalo en Client365 → Gestión de terminal, o completa BIOMETRIC_HOST, BIOMETRIC_USER y BIOMETRIC_PASSWORD en el .env de la API.');
    }
    throw new BiometricError('not_found', `No hay ningún terminal con el código «${code}».`);
}

// activeTerminals = «los terminales que la escucha tiene que leer»: los activos
// de la base, y el principal del .env si la base no tiene uno. Uno cuya
// contraseña no se puede leer va igual, con su `error`, para que se vea.
export async function activeTerminals() {
    const docs = await TerminalModel.find({}).select('+passwordEnc').lean();
    const list = [];
    for (const doc of docs) {
        if (doc.enabled === false) continue;
        try {
            list.push({ code: doc.code, name: doc.name, device: deviceOf(doc, passwordOf(doc)) });
        } catch (error) {
            list.push({ code: doc.code, name: doc.name, device: null, error: error.message });
        }
    }
    if (!docs.some((d) => d.code === PRINCIPAL_CODE)) {
        const env = envTerminal(process.env);
        if (env) list.unshift(fromEnv(env));
    }
    return list;
}

// envTerminals = «lo que se puede leer sin base»: el principal del .env, si está
export function envTerminals() {
    const env = envTerminal(process.env);
    return env ? [fromEnv(env)] : [];
}



// ─── Administrarlos ──────────────────────────────────────────────────────

// listTerminals = «todos los terminales», sin contraseñas. El principal del .env
// aparece mientras no se lo administre desde aquí.
export async function listTerminals() {
    const docs = await TerminalModel.find({}).sort({ createdAt: 1 }).lean();
    const terminals = docs.map(publicTerminal);
    const env = envTerminal(process.env);
    if (env && !docs.some((d) => d.code === PRINCIPAL_CODE)) terminals.unshift(publicTerminal(env));
    return { terminals, secretConfigured: isUsableSecret(secretOf()) };
}

// createTerminal = «agregar un terminal». El código sale del nombre si no se da.
export async function createTerminal(body, adminId) {
    const data = await validate(createTerminalSchema, body);
    const code = data.code || codeFromName(data.name);
    if (!isTerminalCode(code)) throw new BiometricError('bad_request', 'No se pudo armar un código con ese nombre: escribe uno (minúsculas, números y guiones).');
    const secret = requireSecret();
    try {
        const doc = await TerminalModel.create({
            code,
            name: data.name,
            office: data.office,
            protocol: data.protocol,
            host: data.host,
            port: data.port ?? defaultPortOf(data.protocol),
            username: data.username,
            passwordEnc: encryptSecret(data.password, secret),
            enabled: data.enabled,
            createdBy: adminId ?? null,
            updatedBy: adminId ?? null,
        });
        return publicTerminal(doc.toObject());
    } catch (error) {
        if (error?.code === 11000) throw new BiometricError('conflict', `Ya hay un terminal con el código «${code}». Elige otro.`);
        throw error;
    }
}

// importEnvTerminal = «administrar el principal desde aquí»: se copia el del
// .env a la base, con su contraseña cifrada. Desde entonces manda la base.
export async function importEnvTerminal(adminId) {
    const env = envTerminal(process.env);
    if (!env) throw new BiometricError('not_found', 'El .env de la API no tiene un terminal principal completo (BIOMETRIC_HOST, BIOMETRIC_USER y BIOMETRIC_PASSWORD).');
    const secret = requireSecret();
    if (await TerminalModel.exists({ code: PRINCIPAL_CODE })) throw new BiometricError('conflict', 'El terminal principal ya se administra desde aquí.');
    const doc = await TerminalModel.create({
        code: PRINCIPAL_CODE,
        name: env.name,
        office: '',
        protocol: env.protocol,
        host: env.host,
        port: env.port,
        username: env.username,
        passwordEnc: encryptSecret(env.password, secret),
        enabled: true,
        createdBy: adminId ?? null,
        updatedBy: adminId ?? null,
    });
    return publicTerminal(doc.toObject());
}

// updateTerminal = «cambiar un terminal». El código no cambia (lo usan los
// kioscos) y la contraseña vacía deja la que estaba.
export async function updateTerminal(id, body, adminId) {
    ensureId(id);
    const data = await validate(updateTerminalSchema, body);
    const doc = await TerminalModel.findById(id).select('+passwordEnc');
    if (!doc) throw new BiometricError('not_found', 'El terminal no existe.');

    const port = data.port ?? defaultPortOf(data.protocol);
    const connectionChanged = doc.host !== data.host || doc.port !== port || doc.protocol !== data.protocol
        || doc.username !== data.username || Boolean(data.password);

    doc.name = data.name;
    doc.office = data.office;
    doc.protocol = data.protocol;
    doc.host = data.host;
    doc.port = port;
    doc.username = data.username;
    if (typeof data.enabled === 'boolean') doc.enabled = data.enabled;
    if (data.password) doc.passwordEnc = encryptSecret(data.password, requireSecret());
    // Otra dirección o credencial: la comprobación anterior ya no dice nada.
    if (connectionChanged) doc.lastCheck = { at: null, ok: null, message: null, driftSeconds: null, users: null, fingerprints: null, capacity: null };
    doc.updatedBy = adminId ?? null;

    await doc.save();
    return publicTerminal(doc.toObject());
}

// deleteTerminal = «quitar un terminal». Si era el principal y el .env tiene
// uno, se vuelve a usar el del .env.
export async function deleteTerminal(id) {
    ensureId(id);
    const doc = await TerminalModel.findByIdAndDelete(id).lean();
    if (!doc) throw new BiometricError('not_found', 'El terminal no existe.');
    return { deleted: publicTerminal(doc), backToEnv: doc.code === PRINCIPAL_CODE && Boolean(envTerminal(process.env)) };
}



// ─── Comprobarlos ────────────────────────────────────────────────────────

// checkTerminal = «¿responde?», por id (guarda el resultado) o, para el
// principal del .env, por su código (no hay dónde guardarlo).
export async function checkTerminal(ref, now = new Date()) {
    if (!mongoose.isValidObjectId(ref)) {
        const terminal = await resolveTerminal(ref);
        if (terminal.source !== 'env') throw new BiometricError('bad_request', 'Ese terminal se comprueba por su id.');
        return { terminal: null, result: checkSummary(await checkDevice(terminal.device, now)), duplicateOf: null };
    }

    const doc = await TerminalModel.findById(ref).select('+passwordEnc').lean();
    if (!doc) throw new BiometricError('not_found', 'El terminal no existe.');
    const result = await checkDevice(deviceOf(doc, passwordOf(doc)), now);

    const update = { lastCheck: checkRecord(result, now) };
    if (result.ok) update.device = { ...result.device };
    const saved = await TerminalModel.findByIdAndUpdate(ref, { $set: update }, { new: true }).lean();

    // El mismo equipo cargado dos veces: dos escuchas leerían lo mismo y el
    // kiosco recibiría cada huella dos veces.
    const serial = result.ok ? result.device?.serialNumber : null;
    const duplicate = serial
        ? await TerminalModel.findOne({ _id: { $ne: doc._id }, 'device.serialNumber': serial }, 'name code').lean()
        : null;

    return {
        terminal: publicTerminal(saved),
        result: checkSummary(result),
        duplicateOf: duplicate ? { name: duplicate.name, code: duplicate.code } : null,
    };
}

// testTerminal = «probar una conexión antes de guardarla». Con `id`, la
// contraseña vacía es la guardada de ese terminal.
export async function testTerminal(body, now = new Date()) {
    const data = await validate(testTerminalSchema, body);
    let password = data.password;
    if (!password && data.id) {
        ensureId(data.id);
        const doc = await TerminalModel.findById(data.id).select('+passwordEnc').lean();
        if (!doc) throw new BiometricError('not_found', 'El terminal no existe.');
        password = passwordOf(doc);
    }
    if (!password) throw new BiometricError('bad_request', 'Falta la contraseña del terminal.');

    const terminal = { protocol: data.protocol, host: data.host, port: data.port ?? defaultPortOf(data.protocol), username: data.username };
    return { result: checkSummary(await checkDevice(deviceOf(terminal, password), now)) };
}
