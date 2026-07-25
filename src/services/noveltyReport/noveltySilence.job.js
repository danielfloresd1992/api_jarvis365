import colors from 'colors';
import moment from 'moment-timezone';
import mongoose from 'mongoose';
import Noveltie from '../../apiServises/noveltie/noveltie.model.js';
import LocalModel from '../../apiServises/local/local.model.js';
import Schedules from '../../apiServises/schedules/schedule.model.js';
import { IsDaylightSavingTimeBoolean } from '../../apiServises/time/time.model.js';
import { getActiveMonitoringNow } from '../../apiServises/schedules/schedule.logic.js';
import MonitoringStateModel from '../monitoring/monitoringState.model.js';
import NoveltyReportLog from './noveltyReportLog.model.js';
import { getOperationalDay, REPORT_TZ } from './noveltyReport.service.js';
import { sendTextToWhatsapp } from '../../apiServises/user/attendanceReport.job.js';
import { io } from '../socket/io.js';

// ══════════════════════════════════════════════════════════════════════
// JOB: Detector de silencio — establecimientos sin reportar al grupo
// ══════════════════════════════════════════════════════════════════════
// Corre desde el bucle del monitoringWatcher. CADA HORA EN PUNTO (el primer
// corte del día operativo es a las 09:00; a las 08:00 la ventana recién abre)
// evalúa los establecimientos con monitoreo ANALÍTICO dentro de su ventana en
// ese momento — día y hora del horario vigente, invierno incluido. El
// perimetral NO cuenta para este reporte; un local fuera de su horario
// tampoco, ni uno cuyo rango no declare el tipo explícitamente (legado sin
// `type`). Y solo se EVALÚA al que ya estaba en ventana HACE UNA HORA (el
// corte mide "la última hora"): un local que apenas abre —p. ej. a las 13:00
// para el corte de las 13:00— aún no tuvo tiempo de reportar y saldría como
// falso positivo; a ese solo se le siembra el baseline y entra al corte
// siguiente:
//
//   1. Cuenta sus novedades del día operativo (desde las 08:00) que estén
//      VALIDADAS (validationResult.isApproved === true) Y ENVIADAS AL GRUPO
//      (sharedByAmazonActive o givenToTheGroup) — conteo ACUMULATIVO.
//   2. Compara contra el conteo del corte anterior (persistido por local en
//      monitoringstates.noveltyCheck; un baseline de otro día se ignora).
//   3. Si el local sigue en CERO o el contador NO aumentó, entra en la lista.
//
// Si hay listados, envía un MENSAJE DE SOLO TEXTO (sin PDF) al mismo grupo
// del reporte de conteo. Sin listados no se envía nada (sin ruido).
// Idempotencia por slot persistida en noveltyreportlogs (slotKey único);
// el baseline se actualiza aunque no haya envío.

const SLOT_GRACE_MIN = 5;   // el corte se dispara dentro de los 5 min de cada hora en punto

// Analítico EXPLÍCITO: un rango legado sin `type` cuenta como analítico en el
// resto del monitoreo (default histórico de schedule.logic), pero NO aquí —
// a este reporte solo entra quien tiene el tipo declarado en su horario.
const analyticalExplicit = st => st.active && st.ranges.some(r => r.type === 'analytical');

const SILENCE_GROUP = process.env.NOVELTY_SILENCE_GROUP
    || process.env.NOVELTY_REPORT_GROUP
    || '120363402589311344@g.us';
const SILENCE_ENABLED = process.env.NOVELTY_SILENCE_ENABLED !== undefined
    ? process.env.NOVELTY_SILENCE_ENABLED === 'true'
    : (process.env.NOVELTY_REPORT_ENABLED !== undefined
        ? process.env.NOVELTY_REPORT_ENABLED === 'true'
        : process.env.NODE_ENV === 'production');

/** Corte horario vigente, o null si no estamos en su ventana de gracia. */
export function dueSilenceSlot(now) {
    if (now.minute() >= SLOT_GRACE_MIN) return null;
    // A las 08:00 la ventana del día recién abre: el primer corte es el de las 09:00
    if (now.hour() === 8) return null;

    const slotLabel = `${now.format('HH')}:00`;
    const { start } = getOperationalDay(now);
    return {
        slotLabel,
        slotKey: `silencio_${start.format('YYYY-MM-DD')}_${slotLabel.replace(':', '')}`,
    };
}

const buildSilenceMessage = (flagged, slotLabel, now) => [
    '🚨 *ESTABLECIMIENTOS SIN REPORTAR AL GRUPO*',
    `🕐 Corte ${slotLabel} — ${now.format('dddd DD/MM/YYYY')}`,
    '🔎 En monitoreo analítico activo, sin novedades nuevas ✓ validadas y 📤 enviadas en la última hora:',
    '',
    ...flagged.map(f => f.count === 0
        ? `🔴 ${f.name} · 0 en el día`
        : `🟠 ${f.name} · ${f.count} en el día (sin aumento)`),
    '',
    '_Generado automáticamente por Jarvis365_',
].join('\n');

/**
 * Evalúa el corte de silencio de la media hora y, si hay locales sin reportar,
 * envía el aviso de texto al grupo. Pensada para el tick del monitoringWatcher.
 */
export async function maybeSendSilenceReport() {
    if (!SILENCE_ENABLED) return;

    const now = moment.tz(REPORT_TZ);
    const slot = dueSilenceSlot(now);
    if (!slot) return;

    // Idempotencia: el primer proceso que inserta el slot "gana" el corte
    let log;
    try {
        log = await NoveltyReportLog.create({ slotKey: slot.slotKey });
    }
    catch (error) {
        if (error?.code === 11000) return;
        throw error;
    }

    try {
        const { start } = getOperationalDay(now);

        // Locales ACTIVOS que están DENTRO de su ventana en este momento
        const [timeDoc, schedules, activeLocals] = await Promise.all([
            IsDaylightSavingTimeBoolean.findOne(),
            Schedules.find(),
            LocalModel.find({ isActive: true }).select('_id name').lean(),
        ]);
        const isWinter = Boolean(timeDoc?.usWinterActive);
        const nameById = new Map(activeLocals.map(l => [String(l._id), l.name]));

        // Solo cuentan los locales cuyo monitoreo ANALÍTICO está en ventana en
        // este momento (día y hora). Un local solo-perimetral, o fuera de su
        // horario, queda fuera de este reporte. Y solo se evalúa al que TAMBIÉN
        // estaba en ventana hace una hora: al recién abierto se le siembra el
        // baseline en este corte y se le juzga a partir del siguiente.
        const oneHourAgo = now.clone().subtract(1, 'hour').toDate();
        const inWindowIds = [];   // en ventana ahora → reciben baseline
        const evaluableIds = [];  // en ventana ahora Y hace una hora → se evalúan
        for (const doc of schedules) {
            const id = String(doc.idLocal);
            if (!nameById.has(id)) continue;
            const status = getActiveMonitoringNow(doc, isWinter);
            if (!analyticalExplicit(status)) continue;
            inWindowIds.push(id);
            const before = getActiveMonitoringNow(doc, isWinter, oneHourAgo);
            if (analyticalExplicit(before)) evaluableIds.push(id);
        }

        if (inWindowIds.length === 0) {
            // Nadie en ventana → nada que evaluar ni enviar, pero los avisos
            // que hayan quedado de cortes anteriores se apagan (durable y en
            // el front): sin monitoreo en curso no debe parpadear ningún local.
            await MonitoringStateModel.updateMany(
                { 'noveltyCheck.flagged': true },
                { $set: { 'noveltyCheck.flagged': false } },
            );
            io.emit('monitoring-silence', { slotLabel: slot.slotLabel, at: now.toISOString(), flagged: [] });
            await NoveltyReportLog.updateOne({ _id: log._id }, { $set: { status: 'sent', sentAt: new Date() } });
            return;
        }

        const objectIds = inWindowIds.map(id => new mongoose.Types.ObjectId(id));

        // Conteo ACUMULADO del día: validadas (true) Y enviadas al grupo
        const rows = await Noveltie.aggregate([
            {
                $match: {
                    date: { $gte: start.toDate(), $lt: now.toDate() },
                    'validationResult.isApproved': true,
                    $and: [
                        { $or: [{ establishment: { $in: objectIds } }, { 'local.idLocal': { $in: objectIds } }] },
                        { $or: [{ sharedByAmazonActive: true }, { givenToTheGroup: true }] },
                    ],
                },
            },
            { $group: { _id: { $ifNull: ['$establishment', '$local.idLocal'] }, count: { $sum: 1 } } },
        ]);
        const countById = new Map(rows.map(r => [String(r._id), r.count]));

        // Baselines del corte anterior (los de otro día operativo se ignoran)
        const states = await MonitoringStateModel.find({ idLocal: { $in: inWindowIds } })
            .select('idLocal noveltyCheck').lean();
        const baselineById = new Map(states.map(st => {
            const fresh = st.noveltyCheck?.at && new Date(st.noveltyCheck.at) >= start.toDate();
            return [st.idLocal, fresh ? (st.noveltyCheck.count ?? 0) : 0];
        }));

        // Sin reportar: sigue en cero, o el acumulado no superó el corte anterior
        // (solo los evaluables; el recién abierto no se juzga en este corte)
        const flagged = evaluableIds
            .map(id => ({ id, name: nameById.get(id) ?? id, count: countById.get(id) ?? 0, baseline: baselineById.get(id) ?? 0 }))
            .filter(l => l.count === 0 || l.count <= l.baseline)
            .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, 'es'));

        // El front (AlertInputLive) resalta en rojo los señalados. Se emite
        // SIEMPRE (aunque la lista venga vacía) para que también LIMPIE los
        // parpadeos del corte anterior.
        io.emit('monitoring-silence', {
            slotLabel: slot.slotLabel,
            at: now.toISOString(),
            flagged: flagged.map(f => ({ idLocal: f.id, name: f.name, count: f.count })),
        });

        if (flagged.length > 0) {
            await sendTextToWhatsapp({
                text: buildSilenceMessage(flagged, slot.slotLabel, now.clone().locale('es')),
                number: SILENCE_GROUP,
            });
            console.log(colors.yellow(`[novelty-silence] corte ${slot.slotLabel}: ${flagged.length} local(es) sin reportar → aviso enviado`));
        }

        // El baseline SIEMPRE avanza para los locales evaluados (haya o no aviso)
        // y el flag de silencio queda persistido para sembrar el front al montar.
        const flaggedIds = new Set(flagged.map(f => f.id));
        await MonitoringStateModel.bulkWrite(inWindowIds.map(id => ({
            updateOne: {
                filter: { idLocal: id },
                update: { $set: {
                    'noveltyCheck.count': countById.get(id) ?? 0,
                    'noveltyCheck.at': now.toDate(),
                    'noveltyCheck.flagged': flaggedIds.has(id),
                } },
                upsert: true,
            },
        })));

        // Espejo exacto del corte: cualquier flag que haya quedado de cortes
        // anteriores (un local que salió de ventana o que ya no se evalúa,
        // p. ej. por rango sin tipo) se apaga si no está en la lista de ESTE
        // corte. Así la siembra del front nunca revive avisos viejos.
        await MonitoringStateModel.updateMany(
            { 'noveltyCheck.flagged': true, idLocal: { $nin: [...flaggedIds] } },
            { $set: { 'noveltyCheck.flagged': false } },
        );

        await NoveltyReportLog.updateOne({ _id: log._id }, { $set: { status: 'sent', sentAt: new Date() } });
    }
    catch (error) {
        // Igual que el reporte de conteo: si el fallo pudo ser post-entrega, no se
        // reintenta el slot (evita duplicados); queda 'failed' para revisión.
        await NoveltyReportLog.updateOne(
            { _id: log._id },
            { $set: { status: 'failed', lastError: String(error?.message ?? error) } },
        ).catch(() => {});
        console.log(colors.red(`[novelty-silence] error en el corte ${slot.slotKey}: ${error?.message ?? error}`));
    }
}
