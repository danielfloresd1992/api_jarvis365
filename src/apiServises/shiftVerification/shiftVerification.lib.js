import moment from 'moment-timezone';
import { SHIFTS } from '../rotation/rotation.schema.js';



// ══════════════════════════════════════════════════════════════════════
// LA VERIFICACIÓN DE UN TURNO — lo que no toca la base
// ══════════════════════════════════════════════════════════════════════
// El controlador busca, llama a estas funciones y guarda. Lo de en medio —qué
// rotaciones son del turno, quién es el operador, cómo va cada verificación y
// cuál es el resultado— vive aquí, puro, para probarlo sin Mongo
// (test/shiftVerification.test.ts).
//
// EL RESULTADO DE UN TURNO. El 100 % es lo que pasó de verdad: lo que el
// operador anotó y está en el video, más lo que el verificador recuperó del
// video porque el operador no lo anotó. Lo anotado que no está en el video no
// cuenta. Lo mismo con los toques de gerente.
//
//     45 anotadas por el operador, las 45 en el video, 1 recuperada → 46 = 100 %,
//     y el operador llevó 45 de 46.



// TIME_ZONE = «la zona en la que se define la jornada»: la misma variable que usan el día operativo
// (operationalDateOf, en dvrFailure.lib.ts) y el reporte de novedades
const TIME_ZONE = process.env.MONITORING_TZ || 'America/Caracas';

// OPENS_AT = «la hora a la que abre la jornada»: una hora anterior es de la madrugada siguiente
const OPENS_AT = 8;

// DAY_STARTS / DAY_ENDS = «dónde empieza y acaba el turno de día», en segundos desde las 00:00, para las
// rotaciones que no traen su turno. Jarvis Express lo pone al nacer; las de antes de existir el campo, no. El
// cambio de turno de la tarde (17:00 a 18:30) se parte por la mitad, y el de la mañana (07:00 a 08:00) es de la
// noche, que es la que termina.
const DAY_STARTS = 8 * 3600;
const DAY_ENDS = 17 * 3600 + 45 * 60;



// ── LAS HORAS ─────────────────────────────────────────────────────────

// secondsOfClock = «una hora 'HH:MM:SS' en segundos desde las 00:00», o null si no es una hora
export const secondsOfClock = (time) => {
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(time ?? '').trim());
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
};

// secondsOfInstant = «la hora de un instante en Caracas, en segundos desde las 00:00», o null si no es una fecha
const secondsOfInstant = (date) => {
    if (!date) return null;
    const instant = moment.tz(date, TIME_ZONE);
    return instant.isValid() ? instant.hours() * 3600 + instant.minutes() * 60 + instant.seconds() : null;
};


// operationalInstant = «el instante de una hora 'HH:MM:SS' de un día operativo», en Caracas. Una hora anterior a
// las 08:00 es de la madrugada siguiente: el día operativo '2026-11-06' a las 02:10 es el 7 a las 02:10.
// null si el día o la hora no valen.
export function operationalInstant(day, time) {
    const instant = moment.tz(`${day} ${time}`, 'YYYY-MM-DD HH:mm:ss', true, TIME_ZONE);
    if (!instant.isValid()) return null;
    if (instant.hours() < OPENS_AT) instant.add(1, 'day');
    return instant.toDate();
}


// dayKeyOf = «el día operativo guardado (medianoche UTC) como 'AAAA-MM-DD'»
export const dayKeyOf = (operationalDate) => new Date(operationalDate).toISOString().slice(0, 10);



// ── LAS ROTACIONES DEL TURNO ──────────────────────────────────────────

// shiftOfRotation = «el turno de una rotación»: el que le puso Jarvis Express al nacer y, si no lo trae, el que
// dice su hora de Ocupa o, sin ella, la del momento en que nació. null solo si no hay nada de eso.
export function shiftOfRotation(rotation) {
    if (SHIFTS.includes(rotation?.shift)) return rotation.shift;
    const seconds = secondsOfClock(rotation?.hourOccupies) ?? secondsOfInstant(rotation?.date);
    if (seconds === null) return null;
    return seconds >= DAY_STARTS && seconds < DAY_ENDS ? 'day' : 'night';
}

// isVerifiable = «la rotación entra en la verificación de ese turno»: es de una mesa (un pedido para llevar es
// una rotación hueca, sin Ocupa ni toques) y es de ese turno
export const isVerifiable = (rotation, shift) => rotation?.takeOut !== true
    && !String(rotation?.tableNumber ?? '').trim().startsWith('#')
    && shiftOfRotation(rotation) === shift;


// majorityCreator = «quien creó la mayoría de las rotaciones»: el _id que más se repite en createdBy. En un empate,
// el de la rotación que empezó antes. null sin rotaciones.
export function majorityCreator(rotations) {
    const tally = new Map();

    for (const rotation of rotations) {
        const id = rotation?.createdBy?._id ?? rotation?.createdBy;
        if (!id) continue;

        const key = String(id);
        const startedAt = new Date(rotation.date).getTime();
        const current = tally.get(key) ?? { id, count: 0, first: Infinity };
        current.count += 1;
        if (Number.isFinite(startedAt)) current.first = Math.min(current.first, startedAt);
        tally.set(key, current);
    }

    let best = null;
    for (const candidate of tally.values()) {
        if (!best || candidate.count > best.count || (candidate.count === best.count && candidate.first < best.first)) best = candidate;
    }
    return best ? best.id : null;
}


// syncTouches = «los toques de una rotación, puestos al día»: se quedan los que siguen en la rotación, con lo que ya
// se marcó, y entran los nuevos (los que el operador apuntó después, desde Registros)
function syncTouches(touchEntries, touches) {
    const ids = new Set(touches.map(touch => String(touch._id)));
    const kept = touchEntries.filter(entry => ids.has(String(entry.touch)));
    const known = new Set(kept.map(entry => String(entry.touch)));
    const added = touches
        .filter(touch => !known.has(String(touch._id)))
        .map(touch => ({ touch: touch._id, origin: 'operator', first: null, second: null }));
    return [...kept, ...added];
}

// syncEntries = «las rotaciones de la verificación, puestas al día con las del turno»
// Recibe las entradas que ya tiene (objetos planos) y las rotaciones del turno (isVerifiable), cada una con sus
// toques (touch[]._id). Se quedan las que siguen en el turno, con lo que ya se marcó, y las que recuperó la propia
// verificación; entran las nuevas (guardadas después de abrirla). Lo mismo con los toques de cada una.
// Devuelve { entries, added, removed }.
export function syncEntries(entries, rotations) {
    const byId = new Map(rotations.map(rotation => [String(rotation._id), rotation]));

    const kept = entries.filter(entry => byId.has(String(entry.rotation)) || entry.origin === 'verification');
    const known = new Set(kept.map(entry => String(entry.rotation)));
    const added = rotations
        .filter(rotation => !known.has(String(rotation._id)))
        .map(rotation => ({ rotation: rotation._id, origin: 'operator', first: null, second: null, touches: [] }));

    const synced = [...kept, ...added].map((entry) => {
        const rotation = byId.get(String(entry.rotation));
        return rotation ? { ...entry, touches: syncTouches(entry.touches ?? [], rotation.touch ?? []) } : entry;
    });

    return { entries: synced, added: added.length, removed: entries.length - kept.length };
}


// operatorRotations = «las rotaciones que anotó el operador»: las del turno menos las que recuperó la verificación
export function operatorRotations(entries, rotations) {
    const recovered = new Set(entries.filter(entry => entry.origin === 'verification').map(entry => String(entry.rotation)));
    return rotations.filter(rotation => !recovered.has(String(rotation._id)));
}


// findEntry = «la rotación de la verificación y, si se pide, uno de sus toques»: { entry, touchEntry } o null si no está
export function findEntry(entries, rotationId, touchId = null) {
    const entry = entries.find(item => String(item.rotation?._id ?? item.rotation) === String(rotationId));
    if (!entry) return null;
    if (!touchId) return { entry, touchEntry: null };

    const touchEntry = (entry.touches ?? []).find(item => String(item.touch) === String(touchId));
    return touchEntry ? { entry, touchEntry } : null;
}



// ── LAS DOS VERIFICACIONES ────────────────────────────────────────────

// passKey = «el campo de una verificación»: 1 → 'first', 2 → 'second'
export const passKey = (pass) => (Number(pass) === 2 ? 'second' : 'first');

// finalCheck = «lo que quedó de una rotación o de un toque»: lo de la segunda verificación si dijo algo; si no,
// lo de la primera. null si ninguna lo miró.
export const finalCheck = (entry) => entry?.second ?? entry?.first ?? null;

// checkOf = «la marca de una verificación»: lo que dijo, la nota, quién y cuándo. null si `status` es null
// (quitar la marca).
export const checkOf = ({ status, note = '' }, userId, now = new Date()) => (status
    ? { status, note: note ?? '', checkedBy: userId, checkedAt: now }
    : null);


// passProgress = «cuánto lleva revisado una verificación»: { checked, total }, contando rotaciones y toques. Los
// toques de una rotación que esa verificación dice que no existe cuentan como revisados: no hay nada que mirar.
export function passProgress(entries, pass) {
    const key = passKey(pass);
    let checked = 0;
    let total = 0;

    for (const entry of entries ?? []) {
        total += 1;
        if (entry[key]) checked += 1;

        const gone = entry[key]?.status === 'notFound';
        for (const touchEntry of entry.touches ?? []) {
            total += 1;
            if (gone || touchEntry[key]) checked += 1;
        }
    }
    return { checked, total };
}


// passProblem = «por qué no se puede marcar en esa verificación», o null. La segunda revisa lo que dejó la
// primera: empieza cuando la primera se cierra. Una verificación cerrada ya no cambia.
export function passProblem(verification, pass) {
    if (passKey(pass) === 'second' && !verification?.firstClosedAt) return 'La verificación 2 empieza cuando se cierra la 1';
    if (verification?.[`${passKey(pass)}ClosedAt`]) return `La verificación ${pass} ya está cerrada`;
    return null;
}

// closeProblem = «por qué no se puede cerrar esa verificación», o null: lo de passProblem, o que falta revisar algo
export function closeProblem(verification, pass) {
    const problem = passProblem(verification, pass);
    if (problem) return problem;

    const { checked, total } = passProgress(verification?.rotations, pass);
    const missing = total - checked;
    return missing > 0 ? `Falta${missing === 1 ? '' : 'n'} ${missing} por revisar en la verificación ${pass}` : null;
}



// ── EL RESULTADO ──────────────────────────────────────────────────────

// emptyCounts = «el resultado de un grupo, todavía sin nada»
//   recorded   lo que anotó el operador
//   confirmed  de eso, lo que está en el video
//   notFound   de eso, lo que no está
//   pending    de eso, lo que nadie ha mirado todavía
//   recovered  lo que el operador no anotó y se sacó del video
//   total      lo que pasó de verdad: confirmed + recovered. Es el 100 %.
const emptyCounts = () => ({ recorded: 0, confirmed: 0, notFound: 0, pending: 0, recovered: 0, total: 0 });

// countInto = «sumar una rotación o un toque a su grupo», con lo que quedó de él (finalCheck)
function countInto(counts, origin, status) {
    if (origin === 'verification') {
        if (status !== 'notFound') counts.recovered += 1;
        return;
    }
    counts.recorded += 1;
    if (status === 'confirmed') counts.confirmed += 1;
    else if (status === 'notFound') counts.notFound += 1;
    else counts.pending += 1;
}

// totalsOf = «el resultado del turno»: { rotations, touches }, cada uno con emptyCounts. Los toques de una rotación
// que no existe tampoco existen.
export function totalsOf(entries) {
    const rotations = emptyCounts();
    const touches = emptyCounts();

    for (const entry of entries ?? []) {
        const status = finalCheck(entry)?.status ?? null;
        countInto(rotations, entry.origin, status);

        for (const touchEntry of entry.touches ?? []) {
            countInto(touches, touchEntry.origin, status === 'notFound' ? 'notFound' : finalCheck(touchEntry)?.status ?? null);
        }
    }

    rotations.total = rotations.confirmed + rotations.recovered;
    touches.total = touches.confirmed + touches.recovered;
    return { rotations, touches };
}


// withSummary = «la verificación como la devuelve la API»: el documento y, calculado, cómo va cada verificación y
// el resultado de ahora mismo (el guardado en `totals` es el del último cierre)
export const withSummary = (verification) => ({
    ...verification,
    summary: {
        first: passProgress(verification.rotations, 1),
        second: passProgress(verification.rotations, 2),
        totals: totalsOf(verification.rotations),
    },
});



// ── EL RESUMEN DEL DÍA, para la lista de /verifications de Client365 ──

// passState = «cómo va una verificación», sin la lista: { checked, total, closedAt, verifiedBy }
const passState = (verification, pass) => ({
    ...passProgress(verification.rotations, pass),
    closedAt: verification[`${passKey(pass)}ClosedAt`] ?? null,
    verifiedBy: verification[`${passKey(pass)}Verifier`] ?? null,
});

// summarizeDay = «cómo va la verificación de cada local un día»: por local, sus turnos con rotaciones (o con
// verificación abierta), cuántas rotaciones de mesa tiene cada uno y cómo van sus dos verificaciones (null si nadie
// la abrió). Recibe las rotaciones guardadas del día (con establishment, shift, hourOccupies, date, takeOut,
// tableNumber) y las verificaciones del día (planas).
export function summarizeDay(rotations, verifications) {
    const locals = new Map();
    const slotOf = (establishment, shift) => {
        const key = String(establishment?._id ?? establishment);
        if (!locals.has(key)) locals.set(key, { establishment: key, shifts: new Map() });
        const shifts = locals.get(key).shifts;
        if (!shifts.has(shift)) shifts.set(shift, { shift, rotations: 0, verification: null });
        return shifts.get(shift);
    };

    for (const rotation of rotations) {
        const shift = shiftOfRotation(rotation);
        if (shift && isVerifiable(rotation, shift)) slotOf(rotation.establishment, shift).rotations += 1;
    }

    for (const verification of verifications) {
        slotOf(verification.establishment, verification.shift).verification = {
            _id: verification._id,
            operator: verification.operator ?? null,
            first: passState(verification, 1),
            second: passState(verification, 2),
            totals: totalsOf(verification.rotations),
        };
    }

    const order = (one, other) => SHIFTS.indexOf(one.shift) - SHIFTS.indexOf(other.shift);
    return [...locals.values()].map(local => ({ establishment: local.establishment, shifts: [...local.shifts.values()].sort(order) }));
}



// ── EL HISTORIAL ──────────────────────────────────────────────────────

// historyEntry = «una línea del historial»: quién, qué (HISTORY_ACTIONS) y cuándo, y lo que haga falta para leerla
export const historyEntry = ({ action, userId, pass = null, rotation = null, touch = null, from = null, to = null, note = '', now = new Date() }) => ({
    at: now,
    user: userId,
    action,
    pass: pass === null ? null : Number(pass),
    rotation,
    touch,
    from,
    to,
    note,
});



// ── LAS DEMORAS ───────────────────────────────────────────────────────

// DEFAULT_LIMIT = «el tiempo de referencia de un local que no tiene el suyo»: el general de Jarvis Express
// (LIMITE_GENERAL en Jarvis-express365, src/libs/limites/limitesDelLocal.js). Un tiempo '00:00:00' es «sin configurar».
export const DEFAULT_LIMIT = '00:03:30';

// limitsOf = «los tiempos de referencia de un local» (Local.timeServices, poblado): { attention, cleaning }, 'HH:MM:SS'
export function limitsOf(timeServices) {
    const configured = (time) => (secondsOfClock(time) ?? 0) > 0;
    return {
        attention: configured(timeServices?.firstAtenttion) ? timeServices.firstAtenttion : DEFAULT_LIMIT,
        cleaning: configured(timeServices?.TableCleaning) ? timeServices.TableCleaning : DEFAULT_LIMIT,
    };
}

// elapsedBetween = «cuánto pasó de una hora a otra», en segundos; pasada la medianoche, la hora vuelve a empezar.
// null si falta alguna.
export function elapsedBetween(from, to) {
    const start = secondsOfClock(from);
    const end = secondsOfClock(to);
    if (start === null || end === null) return null;
    return end >= start ? end - start : end + 24 * 3600 - start;
}

// delaysOf = «las demoras del turno»: de cada mesa que pasó de verdad (no la que «no está en el video»), su primera
// atención (de Ocupa a 1ra atención) y su limpieza (de Desocupa a Limpieza) contra los límites del local, y si el
// operador la reportó (firstAttentionDelay / cleaningDelay, la novedad). Solo entran las que pasaron del límite o
// se reportaron. Recibe las entradas de la verificación, las rotaciones (con sus horas y sus demoras reportadas) y
// los límites (limitsOf). Devuelve la forma de `delays` del modelo.
export function delaysOf(entries, rotations, limits) {
    const byId = new Map(rotations.map(rotation => [String(rotation._id), rotation]));
    const limitSeconds = { attention: secondsOfClock(limits.attention), cleaning: secondsOfClock(limits.cleaning) };
    const result = { limits: { attention: limits.attention, cleaning: limits.cleaning }, attention: 0, cleaning: 0, reported: 0, items: [] };

    for (const entry of entries ?? []) {
        if (finalCheck(entry)?.status === 'notFound') continue;
        const rotation = byId.get(String(entry.rotation?._id ?? entry.rotation));
        if (!rotation) continue;

        const measures = [
            { kind: 'attention', seconds: elapsedBetween(rotation.hourOccupies, rotation.hourFirstAttention), reported: Boolean(rotation.firstAttentionDelay) },
            { kind: 'cleaning', seconds: elapsedBetween(rotation.breakUp, rotation.tableCleaning), reported: Boolean(rotation.cleaningDelay) },
        ];
        for (const measure of measures) {
            const over = measure.seconds !== null && limitSeconds[measure.kind] !== null && measure.seconds > limitSeconds[measure.kind];
            if (!over && !measure.reported) continue;
            if (over) result[measure.kind] += 1;
            if (measure.reported) result.reported += 1;
            result.items.push({ rotation: rotation._id, kind: measure.kind, seconds: measure.seconds, over, reported: measure.reported });
        }
    }
    return result;
}



// PEOPLE = «lo que viaja poblado con una verificación»: el local, el operador, los dos verificadores, cada rotación
// con lo que se mira de ella (sus horas, su mesa, sus toques, sus demoras reportadas) y quién la creó, y quién hizo
// cada cosa del historial
export const PEOPLE = [
    { path: 'establishment', select: 'name' },
    { path: 'operator', select: 'name surName img' },
    { path: 'firstVerifier', select: 'name surName img' },
    { path: 'secondVerifier', select: 'name surName img' },
    {
        path: 'rotations.rotation',
        select: 'tableNumber hourOccupies hourFirstAttention breakUp tableCleaning shift takeOut recovered date touch createdBy firstAttentionDelay cleaningDelay',
        populate: { path: 'createdBy', select: 'name surName' },
    },
    { path: 'history.user', select: 'name surName' },
];
