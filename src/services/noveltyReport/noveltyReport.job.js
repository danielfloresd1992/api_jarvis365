import colors from 'colors';
import moment from 'moment-timezone';
import { buildNoveltyCountReport, getOperationalDay, REPORT_TZ } from './noveltyReport.service.js';
import { buildNoveltyReportPdf } from './noveltyReport.pdf.js';
import NoveltyReportLog from './noveltyReportLog.model.js';
import { sendReportToWhatsapp } from '../../apiServises/user/attendanceReport.job.js';

// ══════════════════════════════════════════════════════════════════════
// JOB: Reporte de conteo de novedades → PDF → grupo de WhatsApp
// ══════════════════════════════════════════════════════════════════════
// Se dispara desde el bucle del monitoringWatcher (tick de 30s): en cada tick
// se evalúa si toca un corte. El día operativo va de 08:00 a 07:00 del día
// siguiente (hora REPORT_TZ):
//
//   · Cortes PARCIALES a horas fijas: 14:30, 18:00, 19:30 y 22:30
//     (configurables con NOVELTY_REPORT_SLOTS, lista HH:mm separada por comas).
//     Cada parcial cubre desde las 08:00 hasta la hora del corte.
//   · REPORTE FINAL a las 07:00 del día siguiente, con el día operativo
//     COMPLETO y el caption lo dice explícito.
//
// Idempotencia PERSISTIDA (colección noveltyreportlogs, slotKey único): un
// corte no se reenvía tras un reinicio ni si el tick se dispara de más. Si
// falla la CONSTRUCCIÓN (antes de enviar) se libera el slot y se reintenta;
// si falla el ENVÍO queda 'failed' y NO se reintenta (el bot pudo haber
// entregado aunque la respuesta se perdiera — reintentar duplicaría).
//
// Variables de entorno:
//   NOVELTY_REPORT_GROUP    chat destino (default 120363402589311344@g.us)
//   NOVELTY_REPORT_ENABLED  true|false (default: solo en producción)
//   NOVELTY_REPORT_SLOTS    cortes parciales HH:mm separados por comas
//                           (default: 14:30,18:00,19:30,22:30)

// Cortes parciales del día operativo (hora REPORT_TZ), formato HH:mm
const PARTIAL_SLOTS = (process.env.NOVELTY_REPORT_SLOTS || '14:30,18:00,19:30,22:30')
    .split(',')
    .map(t => t.trim())
    .filter(t => /^\d{1,2}:\d{2}$/.test(t));
const FINAL_HOUR = 7;
const PARTIAL_GRACE_MIN = 20;   // un parcial solo se envía dentro de sus primeros 20 min

const REPORT_GROUP = process.env.NOVELTY_REPORT_GROUP || '120363402589311344@g.us';
const REPORT_ENABLED = process.env.NOVELTY_REPORT_ENABLED !== undefined
    ? process.env.NOVELTY_REPORT_ENABLED === 'true'
    : process.env.NODE_ENV === 'production';

export const buildCaption = report => {
    const head = report.isFinal
        ? `🏁 *REPORTE FINAL DEL DÍA OPERATIVO — ${report.weekdayLabel} ${report.dateLabel}*\n_Día completo: ${report.windowLabel}_`
        : `📊 *Novedades — corte parcial ${report.cutoffLabel}*\n_${report.weekdayLabel} ${report.dateLabel} · desde las 08:00_`;

    return [
        head,
        '',
        `🧑‍✈️ Encargado diurno: *${report.onDuty.diurno ?? '—'}*`,
        `🌙 Encargado nocturno: *${report.onDuty.nocturno ?? '—'}*`,
        '',
        `📦 Total: *${report.totals.total}*`,
        `✅ Positivas: *${report.totals.positivas}*`,
        `❌ Negativas: *${report.totals.negativas}*`,
        `👁️ Ignoradas: *${report.totals.ignoradas}*`,
        `📤 Enviadas al grupo: *${report.totals.enviadas}*`,
        `☀️ Diurno: *${report.totals.diurno}*  ·  🌙 Nocturno: *${report.totals.nocturno}*`,
        '',
        `🏪 Establecimientos en horario: ${report.localsInSchedule}`,
        '📄 Detalle por franquicia en el PDF adjunto.',
        '_Generado automáticamente por Jarvis365_',
    ].join('\n');
};

/** Corte que corresponde a este instante, o null si no toca ninguno. */
export function dueSlot(now) {
    const hour = now.hour();
    const minute = now.minute();

    // Final: a las 07:00, con toda la hora de gracia (07:00–07:59). El día
    // operativo que cierra es el que EMPEZÓ ayer a las 08:00.
    if (hour === FINAL_HOUR) {
        const { start } = getOperationalDay(now.clone().subtract(2, 'hours'));
        return { isFinal: true, slotKey: `${start.format('YYYY-MM-DD')}_final` };
    }

    // Parciales: solo dentro de la ventana de gracia de cada corte fijo
    const minutesNow = hour * 60 + minute;
    for (const slotTime of PARTIAL_SLOTS) {
        const [h, m] = slotTime.split(':').map(Number);
        const slotMinutes = h * 60 + m;
        if (minutesNow >= slotMinutes && minutesNow < slotMinutes + PARTIAL_GRACE_MIN) {
            const { start } = getOperationalDay(now);
            return { isFinal: false, slotKey: `${start.format('YYYY-MM-DD')}_${slotTime.replace(':', '')}` };
        }
    }

    return null;
}

/**
 * Evalúa si toca un corte y, de ser así, lo envía (una sola vez por slot).
 * Pensada para llamarse desde el tick del monitoringWatcher.
 */
export async function maybeSendNoveltyReport() {
    if (!REPORT_ENABLED) return;

    const now = moment.tz(REPORT_TZ);
    const slot = dueSlot(now);
    if (!slot) return;

    // Idempotencia: el primer proceso que inserta el slot "gana" el corte
    let log;
    try {
        log = await NoveltyReportLog.create({ slotKey: slot.slotKey });
    }
    catch (error) {
        if (error?.code === 11000) return;   // ya enviado (o en envío) → nada que hacer
        throw error;
    }

    // Fase 1 — construir datos y PDF. Si falla AQUÍ (antes de intentar enviar),
    // es seguro liberar el slot: el siguiente tick reintenta sin riesgo de duplicar.
    let report, pdfBuffer, filename;
    try {
        report = await buildNoveltyCountReport({ isFinal: slot.isFinal, at: now.toDate() });
        pdfBuffer = await buildNoveltyReportPdf(
            report,
            slot.isFinal ? 'Reporte final · 07:00' : `Corte parcial · ${now.format('HH:mm')}`,
        );
        filename = slot.isFinal
            ? `Reporte_Novedades_FINAL_${report.operationalDayKey}.pdf`
            : `Reporte_Novedades_${report.operationalDayKey}_${now.format('HHmm')}.pdf`;
    }
    catch (error) {
        await NoveltyReportLog.deleteOne({ _id: log._id }).catch(() => {});
        console.log(colors.red(`[novelty-report] error construyendo el corte ${slot.slotKey} (se reintentará): ${error?.message ?? error}`));
        return;
    }

    // Fase 2 — enviar. Si falla, el bot pudo haber ENTREGADO aunque la respuesta
    // se perdiera: NO se libera el slot (reintentar cada 30s duplicaría el mensaje
    // en el grupo). Queda 'failed' con el error para revisión; el dedupe del bot
    // cubre además los reintentos dentro de su ventana.
    try {
        await sendReportToWhatsapp({
            pdfBuffer,
            caption: buildCaption(report),
            filename,
            number: REPORT_GROUP,
        });

        await NoveltyReportLog.updateOne({ _id: log._id }, { $set: { status: 'sent', sentAt: new Date() } });
        console.log(colors.cyan(`[novelty-report] ${slot.isFinal ? 'REPORTE FINAL' : 'Corte parcial'} ${slot.slotKey} enviado · total: ${report.totals.total} (+${report.totals.positivas} / -${report.totals.negativas} / ign ${report.totals.ignoradas} / env ${report.totals.enviadas})`));
    }
    catch (error) {
        await NoveltyReportLog.updateOne(
            { _id: log._id },
            { $set: { status: 'failed', lastError: String(error?.message ?? error) } },
        ).catch(() => {});
        console.log(colors.red(`[novelty-report] error enviando el corte ${slot.slotKey} (NO se reintenta para evitar duplicados; revisar noveltyreportlogs): ${error?.message ?? error}`));
    }
}