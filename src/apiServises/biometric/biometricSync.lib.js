import { normalizeName, nameTokens, tokensMatch, nameMatch, fullNameOf } from './biometricLink.lib.js';

// ══════════════════════════════════════════════════════════════════════
// LOS MISMOS DATOS EN TODOS LOS TERMINALES — reglas puras
// ══════════════════════════════════════════════════════════════════════
// Cada terminal guarda sus personas (nº de empleado y nombre) y sus huellas.
// Sincronizar es copiar a cada terminal lo que le falta de los demás: personas
// y huellas. Copiar solo agrega: no borra ni cambia a nadie.
//
// La regla de todo el sistema es «una persona, un número en todos los
// terminales»: el vínculo con Jarvis (user.biometric.employeeNo) es por número.
// Lo que la rompe no se copia, porque mezclaría a dos personas:
//   - CONFLICTO: el mismo número es una persona en un terminal y otra en otro
//     (o no es la persona vinculada en Jarvis). Comprobado el 2026-11-18: el
//     terminal de Oficina 2 se cargó aparte y cuatro números chocan.
//   - DUPLICADO: la misma persona con un número distinto en cada terminal.
//     Copiarla la dejaría dos veces en cada uno.
// Cuando una de las personas está vinculada en Jarvis, su número manda y se
// corrige antes de copiar (planCorrections, más abajo). Sin nadie vinculado no
// se sabe quién se queda el número, y queda apartado.
//
// Comprobado contra los DS-K1A8503MF (firmware V1.4.0), solo leyendo:
//   - FingerPrintUpload entrega cada huella con su plantilla (512 bytes), una
//     por consulta: copiarla a otro equipo es leerla y guardarla con SetUp.
//   - FingerPrintUploadAll no existe en este firmware (notSupport): las huellas
//     se leen persona por persona (~1/3 s cada una; 45 personas, 15 s). Leer
//     varias a la vez no es más rápido, y con el mismo searchID mezcla los datos.
//   - Ninguno tiene tarjetas (CardInfo/Count = 0): no se copian.
//   - El terminal rechaza una huella que ya tiene con otra persona (estado 5).



// sameDeviceName = «¿estos dos nombres de terminal son la misma persona?»:
// iguales, o todas las palabras del más corto (al menos dos) están en el otro.
export function sameDeviceName(a, b) {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const ab = nameMatch(a, b);
    const ba = nameMatch(b, a);
    const shorter = ab.total <= ba.total ? ab : ba;
    return shorter.total >= 2 && shorter.matched === shorter.total;
}

// linkMismatch = «el nombre en el terminal es de otra persona que el usuario
// vinculado a ese número». Es la misma si coinciden todas las palabras, o
// alguna que no sea la primera (el apellido: «Jhonatan Perez» y «Jonathan
// Pérez»). Si solo coincide el nombre de pila, no: hay muchos Daniel.
export function linkMismatch(deviceName, user) {
    const tokens = nameTokens(deviceName);
    if (!user || tokens.length === 0) return false;
    const pool = nameTokens(fullNameOf(user));
    if (pool.length === 0) return false;
    const found = tokens.map((token) => pool.some((candidate) => tokensMatch(token, candidate)));
    if (found.every(Boolean)) return false;
    return !found.slice(1).some(Boolean);
}



// ─── El plan ─────────────────────────────────────────────────────────────

const byNumber = (a, b) => (Number(a) - Number(b)) || String(a).localeCompare(String(b));

// Grupos de la misma persona con números distintos en distintos terminales.
// Se comparan solo nombres que comparten el comienzo de alguna palabra.
function findDuplicates(entries) {
    const parent = new Map(entries.map((e) => [e.key, e.key]));
    const root = (key) => {
        while (parent.get(key) !== key) key = parent.get(key);
        return key;
    };
    const buckets = new Map();
    for (const entry of entries) {
        for (const token of new Set(nameTokens(entry.name).map((t) => t.slice(0, 2)))) {
            if (!buckets.has(token)) buckets.set(token, []);
            buckets.get(token).push(entry);
        }
    }
    const compared = new Set();
    for (const bucket of buckets.values()) {
        for (let i = 0; i < bucket.length; i++) {
            for (let j = i + 1; j < bucket.length; j++) {
                const a = bucket[i];
                const b = bucket[j];
                if (a.code === b.code || a.employeeNo === b.employeeNo) continue;
                const pair = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
                if (compared.has(pair)) continue;
                compared.add(pair);
                if (sameDeviceName(a.name, b.name)) parent.set(root(a.key), root(b.key));
            }
        }
    }
    const groups = new Map();
    for (const entry of entries) {
        const r = root(entry.key);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(entry);
    }
    return [...groups.values()].filter((group) => new Set(group.map((e) => e.employeeNo)).size > 1);
}

// buildSyncPlan = «qué le falta a cada terminal y qué no se puede copiar».
//   terminals: [{ code, name, people: [{ employeeNo, name, fingerprints: [posiciones], menuAccess }] }]
//              (en orden: de los primeros se copia antes)
//   links:     [{ employeeNo, user: { name, surName } }], los números vinculados en Jarvis
// Devuelve:
//   copies:     [{ to, employeeNo, name, createPerson, fingerprints: [{ id, from }], menuAccess }]
//   conflicts:  [{ employeeNo, kind: 'numero' | 'vinculo', entries: [{ code, name }], linkedName }]
//   duplicates: [{ name, entries: [{ code, employeeNo }] }]
//   same:       personas que ya están iguales en todos
export function buildSyncPlan({ terminals, links = [] }) {
    const order = terminals.map((t) => t.code);
    const linked = new Map(links.map((l) => [String(l.employeeNo), l.user]));

    const entries = [];
    const numbers = new Map();   // nº → [entrada por terminal]
    for (const terminal of terminals) {
        for (const person of terminal.people) {
            const employeeNo = String(person.employeeNo);
            const entry = {
                key: `${terminal.code}:${employeeNo}`,
                code: terminal.code,
                employeeNo,
                name: person.name ?? '',
                fingerprints: [...new Set(person.fingerprints ?? [])].sort((a, b) => a - b),
                menuAccess: person.menuAccess === true,
            };
            entries.push(entry);
            if (!numbers.has(employeeNo)) numbers.set(employeeNo, []);
            numbers.get(employeeNo).push(entry);
        }
    }

    // Conflictos: el número no es la misma persona en todos (o no es la vinculada).
    const conflicts = [];
    const conflicted = new Set();
    for (const [employeeNo, list] of numbers) {
        const user = linked.get(employeeNo) ?? null;
        const offLink = user ? list.filter((e) => linkMismatch(e.name, user)) : [];
        const mixed = list.some((e) => !sameDeviceName(e.name, list[0].name));
        if (!offLink.length && !mixed) continue;
        conflicted.add(employeeNo);
        conflicts.push({
            employeeNo,
            kind: offLink.length ? 'vinculo' : 'numero',
            entries: list.map((e) => ({ code: e.code, name: e.name })),
            linkedName: user ? fullNameOf(user) : null,
        });
    }

    // Duplicados: la misma persona con otro número en otro terminal.
    const duplicates = [];
    const duplicated = new Set();
    for (const group of findDuplicates(entries)) {
        group.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code) || byNumber(a.employeeNo, b.employeeNo));
        group.forEach((e) => duplicated.add(e.employeeNo));
        duplicates.push({ name: group[0].name, entries: group.map((e) => ({ code: e.code, employeeNo: e.employeeNo })) });
    }

    // Lo que falta en cada terminal, número por número.
    const copies = [];
    let same = 0;
    for (const employeeNo of [...numbers.keys()].sort(byNumber)) {
        if (conflicted.has(employeeNo) || duplicated.has(employeeNo)) continue;
        const list = numbers.get(employeeNo);
        const holders = new Map();   // posición → el primer terminal que la tiene
        for (const e of list) for (const id of e.fingerprints) if (!holders.has(id)) holders.set(id, e.code);
        const source = list[0];
        let complete = true;
        for (const code of order) {
            const here = list.find((e) => e.code === code) ?? null;
            const has = new Set(here?.fingerprints ?? []);
            const fingerprints = [...holders.entries()].filter(([id]) => !has.has(id)).map(([id, from]) => ({ id, from })).sort((a, b) => a.id - b.id);
            if (here && fingerprints.length === 0) continue;
            complete = false;
            copies.push({
                to: code,
                employeeNo,
                name: source.name,
                createPerson: !here,
                fingerprints,
                menuAccess: !here && list.some((e) => e.menuAccess),
            });
        }
        if (complete) same++;
    }

    conflicts.sort((a, b) => byNumber(a.employeeNo, b.employeeNo));
    return { copies, conflicts, duplicates, same };
}

// ─── Correcciones: manda el número que la persona tiene en Jarvis ────────
// Pedido del usuario (2026-11-19): si una persona está vinculada en Jarvis, su
// número es el bueno en todos los terminales. Así se resuelven, antes de copiar:
//   - «otra_persona»: el número vinculado a Ana es, en un terminal, otra persona
//     (Pedro): Pedro pasa a un número nuevo, libre en todos los terminales y en
//     Jarvis, con sus huellas. Después se copia Ana con su número.
//   - «mismo_jarvis»: la misma persona está en un terminal con otro número que
//     el vinculado: sus huellas pasan a su número de Jarvis y el otro se quita.
// Cambiar el número de alguien en un terminal es crearlo con el número nuevo,
// borrar el viejo (el terminal no deja la misma huella en dos números) y
// guardarle sus huellas (biometricSync.service.js, renumberPerson). Lo que
// choca sin nadie vinculado (dos personas con el mismo número) sigue sin tocarse:
// no se sabe quién se queda el número hasta que se vincule a una.

// fullNameMatch = «todas las palabras del nombre del terminal (al menos dos)
// están en el nombre completo de Jarvis»: la misma prueba que las sugerencias.
const fullNameMatch = (deviceName, user) => {
    const match = nameMatch(deviceName, fullNameOf(user));
    return match.total >= 2 && match.matched === match.total;
};

const isNumeric = (text) => /^\d+$/.test(text);

// planCorrections = «qué números cambiar antes de copiar, y el plan de copia
// que queda después». Recibe lo mismo que buildSyncPlan y devuelve lo suyo más
// `renumbers`: [{ terminal, from, to, name, fingerprints, reason, linkedName, targetExists, menuAccess }]
export function planCorrections({ terminals, links = [] }) {
    const model = terminals.map((t) => ({
        ...t,
        people: t.people.map((p) => ({ ...p, employeeNo: String(p.employeeNo), fingerprints: [...new Set(p.fingerprints ?? [])].sort((a, b) => a - b) })),
    }));
    const linked = new Map(links.map((l) => [String(l.employeeNo), l.user]));

    // Números libres: ni en un terminal ni vinculados en Jarvis, desde el mayor + 1.
    const used = new Set([...model.flatMap((t) => t.people.map((p) => p.employeeNo)), ...linked.keys()]);
    let next = Math.max(0, ...[...used].filter(isNumeric).map(Number)) + 1;
    const freeNumber = () => {
        while (used.has(String(next))) next++;
        used.add(String(next));
        return String(next++);
    };

    const renumbers = [];

    // 1) El número vinculado a alguien es otra persona en un terminal: esa se va a uno nuevo.
    for (const terminal of model) {
        for (const person of terminal.people) {
            const user = linked.get(person.employeeNo);
            if (!user || !linkMismatch(person.name, user)) continue;
            const to = freeNumber();
            renumbers.push({
                terminal: terminal.code, from: person.employeeNo, to, name: person.name, fingerprints: [...person.fingerprints],
                reason: 'otra_persona', linkedName: fullNameOf(user), targetExists: false, menuAccess: person.menuAccess === true,
            });
            person.employeeNo = to;
        }
    }

    // 2) La misma persona con otro número que el suyo de Jarvis: pasa a ese.
    for (const terminal of model) {
        for (const person of [...terminal.people]) {
            const own = linked.get(person.employeeNo);
            if (own && !linkMismatch(person.name, own)) continue;   // ya está en un número vinculado a ella
            // Su número de Jarvis: vinculado a alguien con su nombre completo, y que en
            // otro terminal es la misma persona (dos pruebas: el nombre solo no alcanza).
            const candidates = [...linked.entries()].filter(([number, user]) => number !== person.employeeNo
                && fullNameMatch(person.name, user)
                && model.some((other) => other.code !== terminal.code && other.people.some((p) => p.employeeNo === number && sameDeviceName(p.name, person.name))));
            if (candidates.length !== 1) continue;
            const [to, user] = candidates[0];
            const target = terminal.people.find((p) => p.employeeNo === to);
            if (target && !sameDeviceName(target.name, person.name)) continue;   // ahí hay otra persona: no se mezcla
            renumbers.push({
                terminal: terminal.code, from: person.employeeNo, to, name: person.name, fingerprints: [...person.fingerprints],
                reason: 'mismo_jarvis', linkedName: fullNameOf(user), targetExists: Boolean(target), menuAccess: person.menuAccess === true,
            });
            terminal.people = terminal.people.filter((p) => p !== person);
            if (target) {
                target.fingerprints = [...new Set([...target.fingerprints, ...person.fingerprints])].sort((a, b) => a - b);
            } else {
                terminal.people.push({ ...person, employeeNo: to });
            }
        }
    }

    return { renumbers, ...buildSyncPlan({ terminals: model, links }) };
}

// planSummary = «cuánto se copia a cada terminal»
export function planSummary(plan, terminals) {
    return terminals.map(({ code, name }) => {
        const mine = plan.copies.filter((c) => c.to === code);
        return {
            code,
            name,
            persons: mine.filter((c) => c.createPerson).length,
            fingerprints: mine.reduce((sum, c) => sum + c.fingerprints.length, 0),
        };
    });
}



// ─── Al guardar una huella copiada ───────────────────────────────────────

// copyOutcome = «qué pasó al guardar una huella copiada», según el estado del
// terminal (fingerprintSaveResult): guardada, ya la tenía, o un error de verdad.
//   5 la huella ya está en ese terminal (con otra persona, o esta en otra posición)
//   6 esa posición ya está ocupada
//   4 memoria de huellas llena: no tiene sentido seguir copiando a ese terminal
export function copyOutcome(saveError) {
    if (!saveError) return { result: 'copied' };
    const status = saveError.saveStatus;
    if (status === 5) return { result: 'skipped', message: 'Esa huella ya está en el terminal (con otra persona, o en otra posición).' };
    if (status === 6) return { result: 'skipped', message: 'Esa posición de huella ya está ocupada en el terminal.' };
    if (status === 4) return { result: 'error', stopTerminal: true, message: saveError.message };
    return { result: 'error', message: saveError.message };
}
