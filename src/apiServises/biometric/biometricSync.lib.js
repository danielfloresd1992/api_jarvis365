import { normalizeName, nameTokens, tokensMatch, nameMatch, fullNameOf } from './biometricLink.lib.js';

// ══════════════════════════════════════════════════════════════════════
// LOS MISMOS DATOS EN TODOS LOS TERMINALES — reglas puras
// ══════════════════════════════════════════════════════════════════════
// Cada terminal guarda sus personas (nº de empleado y nombre) y sus huellas.
// Sincronizar es copiar a cada terminal lo que le falta de los demás: personas
// y huellas. SOLO AGREGA: no borra ni cambia a nadie.
//
// La regla de todo el sistema es «una persona, un número en todos los
// terminales»: el vínculo con Jarvis (user.biometric.employeeNo) es por número.
// Lo que la rompe no se copia, porque mezclaría a dos personas:
//   - CONFLICTO: el mismo número es una persona en un terminal y otra en otro
//     (o no es la persona vinculada en Jarvis). Comprobado el 2026-11-18: el
//     terminal de Oficina 2 se cargó aparte y cuatro números chocan.
//   - DUPLICADO: la misma persona con un número distinto en cada terminal.
//     Copiarla la dejaría dos veces en cada uno.
// Para esos hay que cambiarle el número a alguien en un terminal.
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
