import mongoose from 'mongoose';
import UserModel from '../user/user.model.js';
import { BiometricError } from './biometric.lib.js';
import {
    listDeviceUsers, findDeviceUser, listFingerprints, readFingerprints, saveFingerprint, removeDeviceUser,
} from './biometric.service.js';
import { enrollEmployee, enrollFingerprint } from './biometricEnroll.service.js';
import { activeTerminals, resolveTerminal } from './biometricTerminal.service.js';
import { withTerminal, patchInventory } from './biometricSync.service.js';
import { forgetDeviceNames } from './biometricListener.js';
import { linkMismatch, sameDeviceName, copyOutcome } from './biometricSync.lib.js';
import { compactUser, fullNameOf, isValidEmployeeNo, nameMatch } from './biometricLink.lib.js';
import { nextEmployeeNo, suggestedDeviceName, freeFingerSlot } from './biometricEnroll.lib.js';

// ══════════════════════════════════════════════════════════════════════
// QUITAR Y AGREGAR PERSONAS EN UN TERMINAL, A MANO (Client365)
// ══════════════════════════════════════════════════════════════════════
// Desde «Datos» de un terminal (Gestión de terminal), un administrador:
//   - quita a una persona de ESE terminal, con sus huellas;
//   - agrega a un usuario de Jarvis: con su número si ya tiene uno (es el mismo
//     en todos los terminales) o con uno nuevo, y queda vinculado;
//   - le pone huellas: copiándolas de otro terminal donde está la misma persona
//     con ese número, o registrándolas en el lector.
//
// Cada paso usa el equipo cuando está libre (withTerminal, la misma fila que la
// sincronización) y corrige lo leído de ese terminal (patchInventory) sin
// releerlo entero. Quitar a alguien no toca su vínculo en Jarvis: el número
// sigue siendo suyo y puede estar en otros terminales.

const USER_FIELDS = 'name surName dni inabilited biometric';

const userAt = (list, employeeNo) => list.find((u) => String(u.employeeNo) === employeeNo) ?? null;

// Todas las palabras del nombre del terminal (al menos dos) están en el de Jarvis.
const isFullNameOf = (deviceName, user) => {
    const match = nameMatch(deviceName, fullNameOf(user));
    return match.total >= 2 && match.matched === match.total;
};

// Los otros terminales activos, con cómo hablarles (sin los que no se pueden usar).
async function otherTerminals(code) {
    return (await activeTerminals()).filter((t) => t.code !== code && t.device);
}

// Vuelve a leer a una persona y corrige lo leído (tras algo que pudo quedar a medias).
async function rereadPerson(terminal, employeeNo) {
    try {
        const person = await withTerminal(terminal.code, () => findDeviceUser(terminal.device, employeeNo));
        const fingerprints = person ? await withTerminal(terminal.code, () => listFingerprints(terminal.device, employeeNo)) : [];
        patchInventory(terminal.code, employeeNo, (old) => (person ? { ...(old ?? { menuAccess: false, enabled: true }), employeeNo, name: person.name, fingerprints } : null));
    } catch {
        // la próxima lectura completa lo pone al día
    }
}



// ─── Quitar ──────────────────────────────────────────────────────────────

// removePerson = «quitar al nº `employeeNo` de este terminal, con sus huellas».
// `expectedName` es el nombre que vio el administrador: si el número ahora es de
// otra persona (alguien lo cambió en el equipo), no se quita a nadie.
export async function removePerson({ code, employeeNo, expectedName = null, adminId = null }) {
    if (!isValidEmployeeNo(employeeNo)) throw new BiometricError('bad_request', 'El número de empleado no es válido.');
    const terminal = await resolveTerminal(code);
    let outcome;
    try {
        outcome = await withTerminal(terminal.code, async () => {
            const person = await findDeviceUser(terminal.device, employeeNo);
            if (!person) throw new BiometricError('not_found', `«${terminal.name}» ya no tiene el nº ${employeeNo}.`);
            if (typeof expectedName === 'string' && person.name !== expectedName) {
                throw new BiometricError('conflict', `El nº ${employeeNo} ahora es de ${person.name || 'otra persona'}, no de ${expectedName || 'quien se veía'}: vuelve a leer el terminal.`);
            }
            return { name: person.name, ...(await removeDeviceUser(terminal.device, employeeNo)) };
        });
    } catch (error) {
        if (error?.kind === 'not_found') patchInventory(terminal.code, employeeNo, () => null);
        else await rereadPerson(terminal, employeeNo);
        throw error;
    }
    patchInventory(terminal.code, employeeNo, () => null);
    forgetDeviceNames([terminal.code]);
    console.log(`[biometric] «${terminal.code}»: se quitó a ${outcome.name || 'sin nombre'} (nº ${employeeNo}, ${outcome.fingerprints} huellas)${adminId ? ` por ${adminId}` : ''}`);
    return { employeeNo, name: outcome.name, fingerprints: outcome.fingerprints };
}



// ─── Agregar ─────────────────────────────────────────────────────────────

// getAddOptions = «a quién se puede agregar a este terminal»: los usuarios de
// Jarvis, cada uno con su estado aquí, y el próximo número libre (mirando todos
// los terminales y todos los vínculos: un número nuevo no es de nadie).
//   status: 'free'  se puede agregar (con su número, o con uno nuevo)
//           'here'  ya está en este terminal
//           'taken' su número aquí lo tiene otra persona (`takenBy`)
//   alsoHereAs: el número con el que parece estar ya aquí, con su nombre completo
//           (la misma persona dos veces: su huella está en ese número y el
//           terminal no la acepta en otro).
export async function getAddOptions(code) {
    const terminal = await resolveTerminal(code);
    const others = await otherTerminals(terminal.code);
    const [onThis, users, onOthers] = await Promise.all([
        withTerminal(terminal.code, () => listDeviceUsers(terminal.device)),
        UserModel.find({}, USER_FIELDS).sort({ name: 1, surName: 1 }).lean(),
        Promise.all(others.map((t) => withTerminal(t.code, () => listDeviceUsers(t.device)).then((r) => r.users, () => null))),
    ]);
    const used = [
        ...onThis.users.map((u) => u.employeeNo),
        ...onOthers.flatMap((list) => list ?? []).map((u) => u.employeeNo),
        ...users.map((u) => u.biometric?.employeeNo).filter(Boolean),
    ];
    return {
        users: users.map((user) => {
            const own = user.biometric?.employeeNo ?? null;
            const here = own ? userAt(onThis.users, own) : null;
            const status = !here ? 'free' : linkMismatch(here.name, user) ? 'taken' : 'here';
            const twin = status === 'here' ? null : onThis.users.find((u) => String(u.employeeNo) !== own && isFullNameOf(u.name, user));
            return {
                ...compactUser(user),
                deviceName: suggestedDeviceName(user),
                status,
                takenBy: status === 'taken' ? (here.name || 'otra persona') : null,
                alsoHereAs: twin ? String(twin.employeeNo) : null,
            };
        }),
        nextEmployeeNo: nextEmployeeNo(used),
        unread: others.filter((_, i) => onOthers[i] === null).map((t) => t.name),
    };
}

// addPerson = «agregar a este terminal al usuario `userId` de Jarvis». Con su
// número si ya tiene; si no, con `employeeNo`, que no puede usar otra persona en
// otro terminal (allí puede haber alguien sin vincular con ese número). Queda
// vinculado. Devuelve también de qué terminales se pueden copiar sus huellas.
export async function addPerson({ code, userId, employeeNo, name, adminId = null }) {
    if (!mongoose.isValidObjectId(userId)) throw new BiometricError('bad_request', 'Falta el usuario a agregar.');
    const terminal = await resolveTerminal(code);
    const user = await UserModel.findById(userId, USER_FIELDS).lean();
    if (!user) throw new BiometricError('not_found', 'El usuario no existe.');
    const number = user.biometric?.employeeNo ?? employeeNo;
    const others = await otherTerminals(terminal.code);

    if (!user.biometric?.employeeNo && isValidEmployeeNo(number)) {
        for (const other of others) {
            const there = await withTerminal(other.code, () => findDeviceUser(other.device, number)).catch(() => null);
            if (there && linkMismatch(there.name, user)) {
                throw new BiometricError('conflict', `El nº ${number} ya lo usa ${there.name || 'otra persona'} en «${other.name}». Usa otro número.`);
            }
        }
    }

    const result = await withTerminal(terminal.code, () => enrollEmployee({ device: terminal.device, userId, employeeNo: number, name, adminId }));
    patchInventory(terminal.code, result.employeeNo, () => ({ employeeNo: result.employeeNo, name: result.name, fingerprints: [], menuAccess: false, enabled: true }));
    forgetDeviceNames([terminal.code]);
    console.log(`[biometric] «${terminal.code}»: se agregó a ${fullNameOf(user)} como nº ${result.employeeNo}${adminId ? ` por ${adminId}` : ''}`);
    return { ...result, sources: await sourcesOf(others, result.employeeNo, result.name, user) };
}



// ─── Huellas ─────────────────────────────────────────────────────────────

// sourcesOf = «en qué otros terminales está esta persona, con este número y con
// huellas»: de ahí se pueden copiar. La misma persona: el mismo nombre en los
// dos terminales, o el de allí coincide con su usuario de Jarvis.
async function sourcesOf(others, employeeNo, name, user = null) {
    const found = await Promise.all(others.map((t) => withTerminal(t.code, async () => {
        const there = await findDeviceUser(t.device, employeeNo);
        if (!there) return null;
        if (!sameDeviceName(there.name, name) && !(user && !linkMismatch(there.name, user))) return null;
        const ids = await listFingerprints(t.device, employeeNo);
        return ids.length ? { code: t.code, name: t.name, personName: there.name, fingerprints: ids.length } : null;
    }).catch(() => null)));
    return found.filter(Boolean);
}

// getFingerprintSources = «de dónde se le pueden copiar huellas a esta persona del terminal»
export async function getFingerprintSources({ code, employeeNo }) {
    if (!isValidEmployeeNo(employeeNo)) throw new BiometricError('bad_request', 'El número de empleado no es válido.');
    const terminal = await resolveTerminal(code);
    const here = await withTerminal(terminal.code, () => findDeviceUser(terminal.device, employeeNo));
    if (!here) throw new BiometricError('not_found', `«${terminal.name}» no tiene el nº ${employeeNo}.`);
    const user = await UserModel.findOne({ 'biometric.employeeNo': employeeNo }, USER_FIELDS).lean();
    const linked = user && !linkMismatch(here.name, user) ? user : null;
    return { employeeNo, name: here.name, sources: await sourcesOf(await otherTerminals(terminal.code), employeeNo, here.name, linked) };
}

// copyFingerprints = «copiar a esta persona las huellas que tiene en el terminal
// `from`», con el mismo número. Solo si allí es la misma persona.
export async function copyFingerprints({ code, employeeNo, from }) {
    if (!isValidEmployeeNo(employeeNo)) throw new BiometricError('bad_request', 'El número de empleado no es válido.');
    if (!from || from === code) throw new BiometricError('bad_request', 'Elige otro terminal de donde copiar las huellas.');
    const [target, source] = await Promise.all([resolveTerminal(code), resolveTerminal(from)]);

    const here = await withTerminal(target.code, () => findDeviceUser(target.device, employeeNo));
    if (!here) throw new BiometricError('not_found', `«${target.name}» no tiene el nº ${employeeNo}.`);
    const { there, templates } = await withTerminal(source.code, async () => {
        const person = await findDeviceUser(source.device, employeeNo);
        return { there: person, templates: person ? await readFingerprints(source.device, employeeNo) : [] };
    });
    if (!there) throw new BiometricError('not_found', `«${source.name}» no tiene el nº ${employeeNo}.`);
    if (!sameDeviceName(there.name, here.name)) {
        const user = await UserModel.findOne({ 'biometric.employeeNo': employeeNo }, USER_FIELDS).lean();
        if (!user || linkMismatch(there.name, user) || linkMismatch(here.name, user)) {
            throw new BiometricError('conflict', `En «${source.name}» el nº ${employeeNo} es de ${there.name || 'otra persona'}, no de ${here.name || 'esta persona'}: sus huellas no se copian.`);
        }
    }
    if (templates.length === 0) throw new BiometricError('bad_request', `En «${source.name}» ${there.name || `el nº ${employeeNo}`} no tiene huellas.`);

    const outcome = await withTerminal(target.code, async () => {
        const used = new Set(await listFingerprints(target.device, employeeNo));
        let copied = 0;
        const notes = [];
        for (const template of templates) {
            const slot = used.has(template.id) ? freeFingerSlot([...used]) : template.id;
            if (slot === null) {
                notes.push(`Huella ${template.id}: ya no quedan posiciones libres.`);
                continue;
            }
            try {
                await saveFingerprint(target.device, { employeeNo, fingerPrintID: slot, fingerData: template.fingerData });
                used.add(slot);
                copied++;
            } catch (error) {
                if (error?.saveStatus == null) throw error;
                notes.push(`Huella ${template.id}: ${copyOutcome(error).message}`);
            }
        }
        return { copied, notes, fingerprints: await listFingerprints(target.device, employeeNo) };
    }).catch(async (error) => {
        await rereadPerson(target, employeeNo);
        throw error;
    });

    patchInventory(target.code, employeeNo, (p) => p && { ...p, fingerprints: outcome.fingerprints });
    forgetDeviceNames([target.code]);
    console.log(`[biometric] «${target.code}»: nº ${employeeNo} recibió ${outcome.copied} de ${templates.length} huellas de «${source.code}»`);
    return { employeeNo, name: here.name, from: { code: source.code, name: source.name }, total: templates.length, ...outcome };
}

// registerFingerprint = «encender el lector de este terminal y guardar la huella
// que ponga esta persona» (hasta un minuto). No ocupa la fila del equipo mientras
// espera el dedo: lo demás no se queda un minuto parado.
export async function registerFingerprint({ code, employeeNo }) {
    const terminal = await resolveTerminal(code);
    const result = await enrollFingerprint(terminal, employeeNo);
    patchInventory(terminal.code, employeeNo, (p) => p && { ...p, fingerprints: result.fingerprints });
    return result;
}
