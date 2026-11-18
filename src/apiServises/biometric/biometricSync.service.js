import UserModel from '../user/user.model.js';
import { oneAtATime } from '../../libs/oneAtATime.js';
import { BiometricError } from './biometric.lib.js';
import {
    listDeviceUsers, listFingerprints, readFingerprints, createDeviceUser, saveFingerprint, deleteDeviceUser,
} from './biometric.service.js';
import { activeTerminals, resolveTerminal, checkTerminal } from './biometricTerminal.service.js';
import { forgetDeviceNames } from './biometricListener.js';
import { buildSyncPlan, planSummary, copyOutcome, linkMismatch } from './biometricSync.lib.js';
import { fullNameOf } from './biometricLink.lib.js';
import { isTerminalCode } from './biometricTerminal.lib.js';

// ══════════════════════════════════════════════════════════════════════
// VER Y SINCRONIZAR LOS DATOS DE LOS TERMINALES
// ══════════════════════════════════════════════════════════════════════
// Lo que tiene cada terminal (personas y posiciones de huella) se lee persona
// por persona: unos 15 s para 45 personas. Por eso leer y sincronizar corren
// aparte de la petición, y Client365 pregunta cada segundo cómo van.
//
// A cada equipo se le habla de a uno (oneAtATime por terminal): dos búsquedas
// de huellas a la vez en el mismo equipo no ganan tiempo y lo exponen a
// mezclar resultados. La escucha (biometricListener.js) sigue aparte: sus
// consultas de eventos no chocan con estas.
//
// Las reglas (qué falta, qué no se puede copiar) están en biometricSync.lib.js.
// Solo agrega: no borra ni cambia a nadie. La única persona que puede borrar es
// una que esta copia acaba de crear y no sirvió (ver copyItem).



// Lo leído de un terminal sirve para la vista durante esto…
const INVENTORY_FRESH_MS = 5 * 60_000;
// …y para sincronizar, solo si es así de reciente (si no, se relee).
const SYNC_FRESH_MS = 60_000;

// Un terminal admite hasta 1000 personas: 10 por página.
const INVENTORY_MAX_PAGES = 110;

// Cuántos avisos de omitidos y errores guarda la sincronización.
const MAX_NOTES = 200;

const inventories = new Map();   // código → lo leído o lo que se está leyendo
const deviceQueues = new Map();  // código → lo que se está haciendo con ese equipo
let job = null;                  // la sincronización en curso, o la última

const withTerminal = (code, work) => oneAtATime(deviceQueues, code, work);
const brief = (terminal) => ({ code: terminal.code, name: terminal.name });



// ─── Lo que tiene cada terminal ──────────────────────────────────────────

async function readPeople(terminal, progress) {
    const { users, truncated } = await listDeviceUsers(terminal.device, { maxPages: INVENTORY_MAX_PAGES });
    if (truncated) throw new BiometricError('bad_response', `No se pudo leer la lista completa de personas de «${terminal.name}».`);
    progress.total = users.length;
    const people = [];
    for (const user of users) {
        const employeeNo = String(user.employeeNo);
        people.push({
            employeeNo,
            name: user.name ?? '',
            fingerprints: await listFingerprints(terminal.device, employeeNo),
            menuAccess: user.menuAccess === true,
            enabled: user.enabled !== false,
        });
        progress.done++;
    }
    return people;
}

// ensureInventory = «lo leído de este terminal»: lo guardado si tiene menos de
// `maxAgeMs`; si no, empieza a leerlo (una sola lectura a la vez por terminal).
function ensureInventory(terminal, { maxAgeMs, force = false }) {
    const current = inventories.get(terminal.code);
    if (current?.status === 'reading') return current;
    if (!force && current?.status === 'ready' && Date.now() - current.readAt < maxAgeMs) return current;

    const state = { status: 'reading', done: 0, total: null, readAt: null, people: null, error: null };
    inventories.set(terminal.code, state);
    state.promise = withTerminal(terminal.code, () => readPeople(terminal, state)).then(
        (people) => Object.assign(state, { status: 'ready', people, readAt: Date.now() }),
        (error) => Object.assign(state, { status: 'failed', error: error?.message ?? String(error) }),
    );
    return state;
}

const readingView = (terminal, state) => ({
    ...brief(terminal),
    status: state.status,
    done: state.done,
    total: state.total,
    error: state.error,
    readAt: state.readAt ? new Date(state.readAt).toISOString() : null,
    people: state.people?.length ?? null,
    fingerprints: state.people ? state.people.reduce((sum, p) => sum + p.fingerprints.length, 0) : null,
});

// Los usuarios de Jarvis vinculados a estos números.
async function linksOf(numbers) {
    if (!numbers.length) return [];
    const users = await UserModel.find({ 'biometric.employeeNo': { $in: numbers } }, 'name surName inabilited biometric.employeeNo').lean();
    return users.map((user) => ({ employeeNo: String(user.biometric.employeeNo), user }));
}

// getTerminalPeople = «qué tiene un terminal»: sus personas, sus huellas y a
// qué usuario de Jarvis está vinculado cada número. Mientras se lee, cuánto va.
export async function getTerminalPeople(code, { refresh = false } = {}) {
    const terminal = await resolveTerminal(code);
    const state = ensureInventory(terminal, { maxAgeMs: INVENTORY_FRESH_MS, force: refresh });
    if (state.status !== 'ready') return readingView(terminal, state);

    const links = new Map((await linksOf(state.people.map((p) => p.employeeNo))).map((l) => [l.employeeNo, l.user]));
    const people = state.people.map((person) => {
        const user = links.get(person.employeeNo) ?? null;
        return {
            ...person,
            user: user ? { id: String(user._id), name: fullNameOf(user), disabled: user.inabilited === true } : null,
            userMismatch: user ? linkMismatch(person.name, user) : false,
        };
    });
    return {
        ...readingView(terminal, state),
        people,
        summary: {
            people: people.length,
            fingerprints: people.reduce((sum, p) => sum + p.fingerprints.length, 0),
            withoutFingerprint: people.filter((p) => p.fingerprints.length === 0).length,
            linked: people.filter((p) => p.user && !p.userMismatch).length,
            mismatched: people.filter((p) => p.userMismatch).length,
        },
    };
}



// ─── El plan ─────────────────────────────────────────────────────────────

// Los terminales a igualar: los pedidos (o todos los activos), al menos dos.
async function selectTerminals(codes) {
    const wanted = Array.isArray(codes) ? [...new Set(codes.filter(isTerminalCode))] : null;
    const active = (await activeTerminals()).map((t) => t.code);
    const chosen = wanted?.length ? wanted : active;
    const missing = chosen.filter((code) => !active.includes(code));
    if (missing.length) throw new BiometricError('bad_request', `No se puede sincronizar «${missing.join('», «')}»: no está activo en Gestión de terminal.`);
    if (chosen.length < 2) throw new BiometricError('bad_request', 'Hacen falta al menos dos terminales activos para sincronizar.');
    // En el orden de la lista: de los primeros se copia antes.
    return Promise.all(active.filter((code) => chosen.includes(code)).map((code) => resolveTerminal(code)));
}

const terminalName = (terminals, code) => terminals.find((t) => t.code === code)?.name ?? code;

// El plan como lo muestra Client365: por terminal de destino, con nombres.
function publicPlan(plan, terminals) {
    const summary = planSummary(plan, terminals);
    return {
        targets: summary.map((target) => ({
            ...target,
            items: plan.copies.filter((c) => c.to === target.code).map((c) => ({
                employeeNo: c.employeeNo,
                name: c.name,
                createPerson: c.createPerson,
                fingerprints: c.fingerprints.length,
                from: [...new Set(c.fingerprints.map((f) => terminalName(terminals, f.from)))],
                menuAccessNotCopied: c.menuAccess,
            })),
        })),
        conflicts: plan.conflicts.map((c) => ({
            ...c,
            entries: c.entries.map((e) => ({ ...e, terminal: terminalName(terminals, e.code) })),
        })),
        duplicates: plan.duplicates.map((d) => ({
            ...d,
            entries: d.entries.map((e) => ({ ...e, terminal: terminalName(terminals, e.code) })),
        })),
        same: plan.same,
        persons: summary.reduce((sum, t) => sum + t.persons, 0),
        fingerprints: summary.reduce((sum, t) => sum + t.fingerprints, 0),
    };
}

async function planFor(terminals) {
    const withPeople = terminals.map((t) => ({ code: t.code, name: t.name, people: inventories.get(t.code).people }));
    const numbers = [...new Set(withPeople.flatMap((t) => t.people.map((p) => p.employeeNo)))];
    return buildSyncPlan({ terminals: withPeople, links: await linksOf(numbers) });
}

// getSyncPlan = «qué se copiaría a cada terminal y qué no se puede copiar».
// Mientras se leen los terminales, cuánto va.
export async function getSyncPlan(codes, { refresh = false } = {}) {
    const terminals = await selectTerminals(codes);
    const states = terminals.map((t) => ensureInventory(t, { maxAgeMs: INVENTORY_FRESH_MS, force: refresh }));
    const reading = terminals.map((t, i) => readingView(t, states[i]));
    const failed = states.find((s) => s.status === 'failed');
    if (failed) return { status: 'failed', error: failed.error, terminals: reading, job: getSyncJob() };
    if (states.some((s) => s.status !== 'ready')) return { status: 'reading', terminals: reading, job: getSyncJob() };
    return { status: 'ready', terminals: reading, plan: publicPlan(await planFor(terminals), terminals), job: getSyncJob() };
}



// ─── Sincronizar ─────────────────────────────────────────────────────────

const publicJob = (j) => ({
    id: j.id,
    status: j.status,               // running | done | failed
    phase: j.phase,                 // reading | copying | finishing
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    terminals: j.terminals,
    progress: { ...j.progress },
    current: j.current,
    results: { ...j.results, skipped: [...j.results.skipped], errors: [...j.results.errors] },
    error: j.error,
});

// getSyncJob = «cómo va (o cómo terminó) la última sincronización»
export function getSyncJob() {
    return job ? publicJob(job) : null;
}

// startSync = «empezar a sincronizar»: corre aparte; devuelve cómo arrancó.
export async function startSync({ codes, adminId = null }) {
    if (job?.status === 'running') throw new BiometricError('conflict', 'Ya hay una sincronización en curso. Espera a que termine.');
    const current = {
        id: `sync-${Date.now().toString(36)}`,
        status: 'running',
        phase: 'reading',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        startedBy: adminId,
        terminals: [],
        progress: { done: 0, total: 0 },
        current: 'Preparando…',
        results: { persons: 0, fingerprints: 0, skipped: [], errors: [] },
        error: null,
    };
    job = current;   // antes de esperar nada: dos clics no arrancan dos
    let terminals;
    try {
        terminals = await selectTerminals(codes);
    } catch (error) {
        finish(current, error);
        throw error;
    }
    current.terminals = terminals.map(brief);
    console.log(`[biometric] sincronización de terminales iniciada (${terminals.map((t) => t.code).join(', ')})${adminId ? ` por ${adminId}` : ''}`);
    runSync(current, terminals).then(() => finish(current), (error) => finish(current, error));
    return publicJob(current);
}

function finish(j, error = null) {
    j.status = error ? 'failed' : 'done';
    j.phase = null;
    j.current = null;
    j.error = error ? (error?.message ?? String(error)) : null;
    j.finishedAt = new Date().toISOString();
    const r = j.results;
    console.log(`[biometric] sincronización ${error ? `con error (${j.error})` : 'terminada'}: ${r.persons} personas y ${r.fingerprints} huellas copiadas, ${r.skipped.length} omitidas, ${r.errors.length} errores`);
}

const note = (list, entry) => { if (list.length < MAX_NOTES) list.push(entry); };

async function runSync(j, terminals) {
    // 1. Leer lo que tiene cada uno (si no se leyó hace un momento).
    for (const terminal of terminals) {
        j.current = `Leyendo «${terminal.name}»…`;
        const state = ensureInventory(terminal, { maxAgeMs: SYNC_FRESH_MS });
        await state.promise;
        if (state.status === 'failed') throw new BiometricError('device_error', `No se pudo leer «${terminal.name}»: ${state.error}`);
    }

    // 2. Copiar lo que falta, terminal por terminal.
    const plan = await planFor(terminals);
    j.phase = 'copying';
    j.progress = { done: 0, total: plan.copies.reduce((sum, c) => sum + (c.createPerson ? 1 : 0) + c.fingerprints.length, 0) };
    const byCode = new Map(terminals.map((t) => [t.code, t]));
    const stopped = new Set();   // terminales que dejaron de responder (o se llenaron)

    for (const copy of plan.copies) {
        const target = byCode.get(copy.to);
        const steps = (copy.createPerson ? 1 : 0) + copy.fingerprints.length;
        if (stopped.has(copy.to)) {
            j.progress.done += steps;
            continue;
        }
        j.current = `${copy.createPerson ? 'Agregando' : 'Completando'} a ${copy.name} (nº ${copy.employeeNo}) en «${target.name}»`;
        await withTerminal(target.code, () => copyItem(j, copy, target, byCode, stopped));
        j.progress.done += steps;
    }

    // 3. Lo leído ya no vale: la próxima vista relee. La escucha relee los nombres.
    j.phase = 'finishing';
    j.current = 'Actualizando los datos de los terminales…';
    for (const terminal of terminals) inventories.delete(terminal.code);
    forgetDeviceNames(terminals.map((t) => t.code));
    for (const terminal of terminals) {
        if (!terminal.id) continue;
        try { await checkTerminal(terminal.id); } catch { /* solo actualiza los números de la lista */ }
    }
}

// copyItem = «agregar (o completar) a una persona en un terminal». Si se la creó
// y ninguna de sus huellas entró porque el terminal ya las tenía con otra
// persona, es alguien que ya está con otro número: se la borra para no dejar
// un duplicado sin huella.
async function copyItem(j, copy, target, byCode, stopped) {
    const where = { terminal: target.name, employeeNo: copy.employeeNo, name: copy.name };
    const fail = (error) => {
        note(j.results.errors, { ...where, message: error?.message ?? String(error) });
        if (error?.kind === 'unreachable') {
            stopped.add(target.code);
            note(j.results.errors, { ...where, message: `«${target.name}» dejó de responder: no se le copió nada más.` });
        }
    };

    if (copy.createPerson) {
        try {
            await createDeviceUser(target.device, { employeeNo: copy.employeeNo, name: copy.name });
        } catch (error) {
            if (error?.kind === 'conflict') {
                note(j.results.skipped, { ...where, message: 'Ya existe en el terminal (se agregó mientras tanto): no se tocó.' });
            } else {
                fail(error);
            }
            return;
        }
        j.results.persons++;
    }

    let copied = 0;
    let duplicated = 0;
    const bySource = new Map();
    for (const f of copy.fingerprints) {
        if (!bySource.has(f.from)) bySource.set(f.from, []);
        bySource.get(f.from).push(f.id);
    }
    for (const [from, ids] of bySource) {
        const source = byCode.get(from);
        let templates;
        try {
            templates = new Map((await withTerminal(source.code, () => readFingerprints(source.device, copy.employeeNo))).map((t) => [t.id, t.fingerData]));
        } catch (error) {
            note(j.results.errors, { ...where, message: `No se pudieron leer sus huellas en «${source.name}»: ${error?.message ?? error}` });
            continue;
        }
        for (const id of ids) {
            const fingerData = templates.get(id);
            if (!fingerData) {
                note(j.results.errors, { ...where, message: `«${source.name}» ya no tiene su huella ${id}.` });
                continue;
            }
            let saveError = null;
            try {
                await saveFingerprint(target.device, { employeeNo: copy.employeeNo, fingerPrintID: id, fingerData });
            } catch (error) {
                if (error?.saveStatus == null) {
                    fail(error);
                    if (stopped.has(target.code)) return;
                    continue;
                }
                saveError = error;
            }
            const outcome = copyOutcome(saveError);
            if (outcome.result === 'copied') {
                copied++;
                j.results.fingerprints++;
            } else if (outcome.result === 'skipped') {
                if (saveError?.saveStatus === 5) duplicated++;
                note(j.results.skipped, { ...where, message: `Huella ${id}: ${outcome.message}` });
            } else {
                note(j.results.errors, { ...where, message: `Huella ${id}: ${outcome.message}` });
                if (outcome.stopTerminal) {
                    stopped.add(target.code);
                    return;
                }
            }
        }
    }

    if (copy.createPerson && copy.fingerprints.length > 0 && copied === 0 && duplicated > 0) {
        try {
            await deleteDeviceUser(target.device, copy.employeeNo);
            j.results.persons--;
            note(j.results.skipped, { ...where, message: 'No se agregó: sus huellas ya están en ese terminal con otra persona (¿la misma persona con otro número?).' });
        } catch (error) {
            note(j.results.errors, { ...where, message: `Quedó agregada sin huella (ya estaban con otra persona) y no se pudo quitar: bórrala a mano en el terminal. ${error?.message ?? ''}`.trim() });
        }
    }
}
