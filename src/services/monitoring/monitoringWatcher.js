import colors from 'colors';
import moment from 'moment-timezone';
import mongoose from 'mongoose';
import Schedules from '../../apiServises/schedules/schedule.model.js';
import LocalModel from '../../apiServises/local/local.model.js';
import { IsDaylightSavingTimeBoolean } from '../../apiServises/time/time.model.js';
import { getActiveMonitoringNow } from '../../apiServises/schedules/schedule.logic.js';
import MonitoringStateModel from './monitoringState.model.js';
import NoveltyReportLog from '../noveltyReport/noveltyReportLog.model.js';
import Noveltie from '../../apiServises/noveltie/noveltie.model.js';
import { getOperationalDay, REPORT_TZ } from '../noveltyReport/noveltyReport.service.js';
import { maybeSendNoveltyReport } from '../noveltyReport/noveltyReport.job.js';
import { sendTextToWhatsapp } from '../../apiServises/user/attendanceReport.job.js';
import { io } from '../socket/io.js';

// ══════════════════════════════════════════════════════════════════════════
// SERVICIO DE MONITOREO EN TIEMPO REAL — un solo bucle (setInterval) que:
//   1. calcula, con el HORARIO (schedule.model), qué monitoreo tiene cada
//      local AHORA: su día (dayMonitoring), su rango de hora y su TIPO
//      (analítico / perimetral), invierno incluido;
//   2. dispara por socket el INICIO y el FIN de monitoreo por local y tipo;
//   3. detecta qué local en monitoreo ANALÍTICO no ha reportado novedades
//      (noveltie.model) validadas y enviadas al grupo en la última hora;
//   4. a la hora del corte, arma y envía el PDF con el conteo del día;
//   5. persiste todo (monitoringstates + noveltyreportlogs) y late para que
//      se pueda ver desde afuera que el proceso sigue vivo.
//
// El bucle está pensado para LEERSE de un vistazo: `tick()` es la tabla de
// contenidos; cada paso vive en su propia función y en su propio try/catch,
// así un fallo en una sección NO tumba a las demás ni detiene el bucle.
// ══════════════════════════════════════════════════════════════════════════


// ─────────────────────────────── Configuración ───────────────────────────────

const TICK_MS = 30_000;          // cada cuánto corre el bucle
const HEARTBEAT_EVERY = 20;      // latido de "sigo vivo" cada N ticks (~10 min)

// Etiqueta en español de cada tipo, para el anuncio por voz del front
const TYPE_LABELS = { analytical: 'analítico', perimeter: 'perimetral' };

// El corte de silencio se dispara dentro de los primeros minutos de cada hora
const SILENCE_GRACE_MIN = 5;

const SILENCE_GROUP = process.env.NOVELTY_SILENCE_GROUP
    || process.env.NOVELTY_REPORT_GROUP
    || '120363402589311344@g.us';

const SILENCE_ENABLED = process.env.NOVELTY_SILENCE_ENABLED !== undefined
    ? process.env.NOVELTY_SILENCE_ENABLED === 'true'
    : (process.env.NOVELTY_REPORT_ENABLED !== undefined
        ? process.env.NOVELTY_REPORT_ENABLED === 'true'
        : process.env.NODE_ENV === 'production');

// Analítico EXPLÍCITO: un rango legado SIN `type` cuenta como analítico en el
// resto del monitoreo, pero NO para el corte de silencio — aquí solo entra
// quien declara el tipo 'analytical' en su horario.
const isAnalyticalInWindow = state => state.active && state.ranges.some(r => r.type === 'analytical');


// ─────────────────────────────── Estado en memoria ───────────────────────────

const previousTypes = new Map();    // idLocal → Set(tipos activos) del tick anterior
const lastKnownNames = new Map();   // idLocal → último nombre conocido
let seeded = false;                 // ¿ya se sembró el estado durable desde Mongo?
let timer = null;                   // handle del setInterval
let lastTickAt = null;              // instante del último tick (observabilidad)
let tickCount = 0;                  // ticks acumulados desde el arranque


// ══════════════════════════════════ EL BUCLE ═════════════════════════════════
//
// Cada tick, en cinco pasos legibles. El paso 0 lee la BD UNA sola vez y ese
// contexto se comparte con todas las secciones (antes cada una re-consultaba
// el horario y los locales por su cuenta).
async function tick() {
    const now = moment.tz(REPORT_TZ);

    // Paso 0 — contexto compartido (horario + locales). Si esto falla, no hay
    // nada que evaluar en este tick: se loguea y se reintenta al siguiente.
    let ctx;
    try {
        ctx = await loadContext(now);
    }
    catch (error) {
        console.log(colors.red(`[monitoreo] no se pudo leer el contexto: ${error?.message ?? error}`));
        return;
    }

    // Paso 1 — estado de monitoreo de cada local AHORA (día + rango + tipo)
    const statuses = computeStatuses(ctx);

    // Pasos 2-4 — cada sección aislada: un fallo se loguea pero no corta el resto
    await section('transiciones', () => detectTransitions(statuses));   // inicio/fin por socket
    await section('silencio',     () => runSilenceCut(ctx, statuses));  // sin reportar → socket + WhatsApp
    await section('conteo',       () => maybeSendNoveltyReport());      // PDF del corte a su hora

    // Paso 5 — latido
    heartbeat(now);
}

// Aísla una sección del tick: cualquier error se registra pero NO se propaga,
// así una falla en «silencio» nunca impide correr «conteo» (ni al revés).
async function section(name, run) {
    try {
        await run();
    }
    catch (error) {
        console.log(colors.red(`[monitoreo] error en «${name}»: ${error?.message ?? error}`));
    }
}


// ─────────────────────── Paso 0: contexto compartido ─────────────────────────

// Una sola lectura de la BD por tick: el flag de invierno, todos los horarios
// y los locales activos. Lo usan tanto las transiciones como el corte de
// silencio, en vez de consultar cada uno por su lado.
async function loadContext(now) {
    if (!seeded) await seedFromDatabase();

    const [timeDoc, schedules, activeLocals] = await Promise.all([
        IsDaylightSavingTimeBoolean.findOne(),
        Schedules.find(),
        LocalModel.find({ isActive: true }).select('_id name').lean(),
    ]);

    const isWinter = Boolean(timeDoc?.usWinterActive);
    const nameById = new Map(activeLocals.map(l => [String(l._id), l.name]));
    nameById.forEach((name, id) => lastKnownNames.set(id, name));

    // idLocal → doc de horario (para reevaluar el estado de hace 1 hora en el silencio)
    const scheduleById = new Map(schedules.map(d => [String(d.idLocal), d]));

    return { now, isWinter, nameById, scheduleById };
}

// Carga el estado persistido a la caché en memoria (una vez por proceso), para
// que un reinicio no pierda las transiciones ocurridas durante el downtime.
async function seedFromDatabase() {
    const persisted = await MonitoringStateModel.find();
    for (const doc of persisted) {
        previousTypes.set(doc.idLocal, new Set(doc.activeTypes ?? []));
        if (doc.name) lastKnownNames.set(doc.idLocal, doc.name);
    }
    seeded = true;
    console.log(colors.cyan(`[monitoreo] estado sembrado desde Mongo (${persisted.length} locales)`));
}


// ─────────────────── Paso 1: estado de cada local AHORA ───────────────────────

// Para cada local activo con horario, resuelve su monitoreo en este instante:
//   { name, doc, status: { active, types, ranges, usingWinter } }
// `getActiveMonitoringNow` ya resuelve rangos corridos (que cruzan medianoche),
// el tipo por rango y el horario de invierno. Se calcula UNA vez y lo comparten
// las transiciones y el corte de silencio.
function computeStatuses(ctx) {
    const statuses = new Map();
    for (const [id, doc] of ctx.scheduleById) {
        const name = ctx.nameById.get(id);
        if (!name) continue;   // local inactivo o inexistente → no se monitorea
        statuses.set(id, { name, doc, status: getActiveMonitoringNow(doc, ctx.isWinter) });
    }
    return statuses;
}


// ──────────────────── Paso 2: transiciones (inicio / fin) ─────────────────────

// Compara el estado actual (por tipo) contra el del tick anterior. Por cada
// tipo que ENTRA o SALE de ventana, emite un evento de socket y persiste el
// nuevo estado durable. Un local nunca visto se siembra callado (sin emitir),
// para no anunciar como "inicio" algo que ya venía activo antes del arranque.
async function detectTransitions(statuses) {
    // Estado actual por local: Set de tipos dentro de su ventana ahora mismo
    const currentTypes = new Map();
    const usingWinterById = new Map();
    for (const [id, { status }] of statuses) {
        currentTypes.set(id, new Set(status.active ? status.types : []));
        usingWinterById.set(id, Boolean(status.usingWinter));
    }

    // Recorremos la unión de locales conocidos (tick anterior) y actuales
    const allIds = new Set([...previousTypes.keys(), ...currentTypes.keys()]);
    for (const id of allIds) {
        const isKnown = previousTypes.has(id);
        const before = previousTypes.get(id) ?? new Set();
        const nowTypes = currentTypes.get(id) ?? new Set();
        const name = lastKnownNames.get(id) ?? id;
        const winter = usingWinterById.get(id) ?? false;

        const started = [...nowTypes].filter(t => !before.has(t));
        const ended = [...before].filter(t => !nowTypes.has(t));

        if (isKnown && (started.length > 0 || ended.length > 0)) {
            const at = new Date();
            for (const type of started) emitTransition('monitoring-start', 'INICIO', { id, name, type, winter, at });
            for (const type of ended)   emitTransition('monitoring-end',   'FIN',    { id, name, type, winter, at });

            await MonitoringStateModel.updateOne(
                { idLocal: id },
                { $set: {
                    name,
                    activeTypes: [...nowTypes],
                    active: nowTypes.size > 0,
                    usingWinter: winter,
                    ...(started.length > 0 ? { lastStartAt: at } : {}),
                    ...(ended.length > 0 ? { lastEndAt: at } : {}),
                } },
                { upsert: true },
            );
        }
        else if (!isKnown) {
            // Primer avistamiento → sembrar en silencio (sin emitir eventos)
            await MonitoringStateModel.updateOne(
                { idLocal: id },
                { $set: { name, activeTypes: [...nowTypes], active: nowTypes.size > 0, usingWinter: winter } },
                { upsert: true },
            );
        }

        // La caché conserva la entrada aunque el local salga de la consulta
        previousTypes.set(id, nowTypes);
    }
}

function emitTransition(event, label, { id, name, type, winter, at }) {
    io.emit(event, {
        idLocal: id,
        name,
        type,
        typeLabel: TYPE_LABELS[type] ?? type,
        usingWinter: winter,
        at: at.toISOString(),
    });
    console.log(colors.cyan(`[monitoreo] ${label} monitoreo ${TYPE_LABELS[type] ?? type} en ${name}${winter ? ' (horario de invierno)' : ''}`));
}


// ─────────────────────── Paso 3: corte de silencio ───────────────────────────

// CADA HORA EN PUNTO (primer corte 09:00; a las 08:00 la ventana recién abre):
// de los locales en monitoreo ANALÍTICO ahora (y abiertos ≥1h), señala a los
// que NO enviaron NINGUNA novedad validada al grupo (givenToTheGroup) en la
// última hora. Es una CONSULTA DIRECTA por `updatedAt` (≈ momento del envío),
// sin baseline persistido: por eso el resultado es correcto aunque el proceso
// se haya caído y perdido cortes anteriores. Emite el evento SIEMPRE (aun con
// lista vacía, para limpiar avisos viejos del front); si hay señalados, además
// manda un texto al grupo de WhatsApp.
async function runSilenceCut(ctx, statuses) {
    if (!SILENCE_ENABLED) return;

    const slot = dueSilenceSlot(ctx.now);
    if (!slot) return;   // no es la ventana de ningún corte horario

    // Idempotencia: el primer proceso/tick que inserta el slot "gana" el corte
    let log;
    try {
        log = await NoveltyReportLog.create({ slotKey: slot.slotKey });
    }
    catch (error) {
        if (error?.code === 11000) return;   // ya enviado (o en envío) → nada que hacer
        throw error;
    }

    try {
        const { start } = getOperationalDay(ctx.now);
        const oneHourAgo = ctx.now.clone().subtract(1, 'hour').toDate();

        // En ventana analítica AHORA; "evaluable" = también lo estaba hace 1h
        // (al recién abierto solo se le siembra baseline y se juzga al siguiente).
        const inWindowIds = [];
        const evaluableIds = [];
        for (const [id, { doc, status }] of statuses) {
            if (!isAnalyticalInWindow(status)) continue;
            inWindowIds.push(id);
            if (isAnalyticalInWindow(getActiveMonitoringNow(doc, ctx.isWinter, oneHourAgo))) evaluableIds.push(id);
        }

        // Nadie en ventana → apaga cualquier aviso viejo (durable y en el front)
        if (inWindowIds.length === 0) {
            await MonitoringStateModel.updateMany(
                { 'noveltyCheck.flagged': true },
                { $set: { 'noveltyCheck.flagged': false } },
            );
            io.emit('monitoring-silence', { slotLabel: slot.slotLabel, at: ctx.now.toISOString(), flagged: [] });
            await markSlot(log, 'sent');
            return;
        }

        const objectIds = inWindowIds.map(id => new mongoose.Types.ObjectId(id));

        // Novedades VALIDADAS y ENVIADAS AL GRUPO (givenToTheGroup) de estos
        // locales, agrupadas por local, con el filtro de fecha que se le pase.
        // `givenToTheGroup` es el flag que marca "enviado al grupo" (el mismo que
        // pinta el chip en Client365); es lo que cuenta como "reportar al grupo".
        const countSentToGroup = async (dateMatch) => {
            const rows = await Noveltie.aggregate([
                {
                    $match: {
                        ...dateMatch,
                        'validationResult.isApproved': true,
                        givenToTheGroup: true,
                        $or: [{ establishment: { $in: objectIds } }, { 'local.idLocal': { $in: objectIds } }],
                    },
                },
                { $group: { _id: { $ifNull: ['$establishment', '$local.idLocal'] }, count: { $sum: 1 } } },
            ]);
            return new Map(rows.map(r => [String(r._id), r.count]));
        };

        // CRITERIO DIRECTO (sin baseline persistido): un local está callado si NO
        // envió NADA al grupo en la última hora. `updatedAt` ≈ momento del envío
        // (la acción de compartir actualiza el documento). Al no arrastrar un
        // baseline entre cortes, el resultado es correcto aunque el proceso se
        // haya caído y perdido cortes anteriores.
        const sentLastHour = await countSentToGroup({ updatedAt: { $gte: oneHourAgo, $lt: ctx.now.toDate() } });
        // Enviadas al grupo en todo el día operativo → solo para el texto del aviso.
        const sentToday = await countSentToGroup({ date: { $gte: start.toDate(), $lt: ctx.now.toDate() } });

        // Señalado: evaluable (abierto ≥1h) que envió 0 al grupo en la última hora
        const flagged = evaluableIds
            .filter(id => (sentLastHour.get(id) ?? 0) === 0)
            .map(id => ({ id, name: ctx.nameById.get(id) ?? id, today: sentToday.get(id) ?? 0 }))
            .sort((a, b) => a.today - b.today || a.name.localeCompare(b.name, 'es'));

        // El front (AlertInputLive / AlertsChart / LocalsOverview) resalta a los
        // señalados. Se emite SIEMPRE para que también limpie el corte anterior.
        io.emit('monitoring-silence', {
            slotLabel: slot.slotLabel,
            at: ctx.now.toISOString(),
            flagged: flagged.map(f => ({ idLocal: f.id, name: f.name, count: f.today })),
        });

        if (flagged.length > 0) {
            await sendTextToWhatsapp({
                text: buildSilenceMessage(flagged, slot.slotLabel, ctx.now.clone().locale('es')),
                number: SILENCE_GROUP,
            });
            console.log(colors.yellow(`[monitoreo] corte ${slot.slotLabel}: ${flagged.length} local(es) sin reportar → aviso enviado`));
        }

        // Persiste el flag por local para sembrar el front al montar (ya no se
        // guarda baseline: el criterio de última hora se calcula solo cada corte).
        const flaggedIds = new Set(flagged.map(f => f.id));
        await MonitoringStateModel.bulkWrite(inWindowIds.map(id => ({
            updateOne: {
                filter: { idLocal: id },
                update: { $set: {
                    'noveltyCheck.at': ctx.now.toDate(),
                    'noveltyCheck.flagged': flaggedIds.has(id),
                } },
                upsert: true,
            },
        })));

        // Espejo del corte: apaga cualquier flag viejo que no esté en ESTE corte
        await MonitoringStateModel.updateMany(
            { 'noveltyCheck.flagged': true, idLocal: { $nin: [...flaggedIds] } },
            { $set: { 'noveltyCheck.flagged': false } },
        );

        await markSlot(log, 'sent');
    }
    catch (error) {
        // Si el fallo pudo ser post-entrega, no se reintenta el slot (evita
        // duplicados en el grupo); queda 'failed' para revisión.
        await markSlot(log, 'failed', error);
    }
}

// Corte horario vigente, o null si no estamos en su ventana de gracia.
function dueSilenceSlot(now) {
    if (now.minute() >= SILENCE_GRACE_MIN) return null;
    if (now.hour() === 8) return null;   // a las 08:00 la ventana del día recién abre
    const slotLabel = `${now.format('HH')}:00`;
    const { start } = getOperationalDay(now);
    return { slotLabel, slotKey: `silencio_${start.format('YYYY-MM-DD')}_${slotLabel.replace(':', '')}` };
}

const buildSilenceMessage = (flagged, slotLabel, now) => [
    '🚨 *ESTABLECIMIENTOS SIN REPORTAR AL GRUPO*',
    `🕐 Corte ${slotLabel} — ${now.format('dddd DD/MM/YYYY')}`,
    '🔎 En monitoreo analítico activo, SIN novedades ✓ validadas y 📤 enviadas al grupo en la última hora:',
    '',
    ...flagged.map(f => f.today === 0
        ? `🔴 ${f.name} · sin reportes hoy`
        : `🟠 ${f.name} · ${f.today} en el día, pero 0 en la última hora`),
    '',
    '_Generado automáticamente por Jarvis365_',
].join('\n');


// ─────────────────────── Registro de cortes (idempotencia) ───────────────────

// Marca un slot como enviado o fallido en noveltyreportlogs. Nunca rompe el tick.
async function markSlot(log, status, error) {
    const set = status === 'sent'
        ? { status: 'sent', sentAt: new Date() }
        : { status: 'failed', lastError: String(error?.message ?? error) };
    await NoveltyReportLog.updateOne({ _id: log._id }, { $set: set }).catch(() => {});
    if (status === 'failed') {
        console.log(colors.red(`[monitoreo] corte de silencio ${log.slotKey ?? ''} falló: ${error?.message ?? error}`));
    }
}


// ─────────────────────────── Paso 5: latido / salud ──────────────────────────

function heartbeat(now) {
    lastTickAt = now.toDate();
    tickCount += 1;
    if (tickCount % HEARTBEAT_EVERY === 0) {
        console.log(colors.gray(`[monitoreo] vivo · tick #${tickCount} · ${now.format('HH:mm:ss')} · locales vigilados: ${previousTypes.size}`));
    }
}

// Estado del servicio para un chequeo externo (p. ej. un endpoint /health que
// reinicie el proceso si lleva demasiado tiempo sin tickear).
function getWatcherHealth() {
    return {
        alive: Boolean(timer),
        tickCount,
        lastTickAt: lastTickAt ? lastTickAt.toISOString() : null,
        secondsSinceLastTick: lastTickAt ? Math.round((Date.now() - lastTickAt.getTime()) / 1000) : null,
    };
}


// ─────────────────────────── Arranque / apagado ──────────────────────────────

// Arranca el bucle. Idempotente. El tick es "fire-and-forget" pero SIEMPRE con
// .catch: aunque algo escape a los try/catch internos, un rechazo del tick no
// puede quedar sin manejar (en Node moderno eso tumbaría el proceso entero).
function startMonitoringWatcher() {
    if (timer) return;
    const runTick = () => tick().catch(err => console.log(colors.red(`[monitoreo] tick sin capturar: ${err?.message ?? err}`)));
    runTick();                                  // primera pasada inmediata (siembra + transiciones)
    timer = setInterval(runTick, TICK_MS);
    console.log(colors.cyan(`[monitoreo] servicio iniciado (tick cada ${TICK_MS / 1000}s)`));
}

function stopMonitoringWatcher() {
    if (timer) clearInterval(timer);
    timer = null;
}

export { startMonitoringWatcher, stopMonitoringWatcher, getWatcherHealth };
