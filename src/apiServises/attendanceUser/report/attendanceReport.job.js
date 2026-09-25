import moment from 'moment-timezone';
import { buildDailyAttendanceReport, registerAbsencesAsFaults, FAULT_CUT_TIMES } from './attendanceReport.service.js';
import { buildAttendanceReportPdf } from './attendanceReport.pdf.js';
import { ATTENDANCE_TIMEZONE } from '../services/attendanceTime.lib.js';
import { sendReportToWhatsapp, toChatId, BOT_URL, REPORT_NUMBER } from '../../../services/whatsapp/whatsappBot.service.js';

// El envío por WhatsApp vive en services/whatsapp. Se reexporta desde aquí porque
// dvrAlert.service.ts todavía lo importa de este archivo.
export { sendMediaToWhatsapp, sendReportToWhatsapp, sendTextToWhatsapp } from '../../../services/whatsapp/whatsappBot.service.js';

// Corte de asistencia programado: 15:00 (Diurno) y 21:00 (Nocturno), hora Venezuela.
// Cada corte registra las faltas, arma el PDF y lo manda por el bot de WhatsApp.
//
// ATTENDANCE_REPORT_ENABLED=true|false fuerza el programador (por defecto, solo en producción).

// Destinatarios que reciben siempre el corte, además del número principal.
const List_Number = ['584166268380', '584120242884'];
// Cortes programados, uno por turno. Las horas salen de FAULT_CUT_TIMES.
const REPORT_CUTS = [
    { time: FAULT_CUT_TIMES.Diurno, shift: 'Diurno', label: 'Corte diurno · Tarde' },
    { time: FAULT_CUT_TIMES.Nocturno, shift: 'Nocturno', label: 'Corte nocturno · Cierre' }
];


// Texto que acompaña al PDF en WhatsApp.
const buildCaption = (report, cutLabel) => [
    `📋 *REPORTE DE ASISTENCIA${report.shiftFocus ? ` — ${report.shiftFocus.toUpperCase()}` : ''}*`,
    `🕐 ${cutLabel}`,
    `📅 ${report.dateLabel}`,
    '',
    `👥 Esperados hoy: *${report.totals.expected}*`,
    `✅ A tiempo: *${report.totals.presentOnTime}*`,
    `⏰ Retardos: *${report.totals.late}*`,
    `🚫 Ausencias: *${report.totals.absent}*`,
    ...(report.totals.pending > 0 ? [`⏳ Turno aún no inicia: *${report.totals.pending}*`] : []),
    '',
    '📄 Detalle completo en el PDF adjunto.',
    '_Generado automáticamente por Jarvis365_'
].join('\n');


// Nombre del corte cuando no se indica uno (según el turno o la hora actual).
const cutLabelForNow = (shiftFocus) => {
    if (shiftFocus === 'Diurno') return 'Corte diurno · Mediodía';
    if (shiftFocus === 'Nocturno') return 'Corte nocturno · Cierre';
    const hour = moment.tz(ATTENDANCE_TIMEZONE).hours();
    return hour < 15 ? 'Primer corte · Mediodía' : 'Segundo corte · Cierre';
};


// Ejecuta el corte completo: datos → faltas → PDF → WhatsApp. Devuelve un resumen.
export async function runDailyAttendanceReport({ cutLabel, number, shiftFocus } = {}) {
    const label = cutLabel || cutLabelForNow(shiftFocus);
    const report = await buildDailyAttendanceReport(new Date(), shiftFocus);

    // Registrar como falta a quienes debían presentarse y no marcaron entrada.
    // Un fallo acá NO aborta el envío del reporte: se informa y se sigue.
    let faults = { attempted: 0, registered: 0, registeredNames: [], skipped: [], failed: [] };
    try {
        faults = await registerAbsencesAsFaults(report);
        if (faults.registered > 0) {
            console.log(`[attendance-report] Faltas registradas automáticamente (${faults.registered}): ${faults.registeredNames.join(', ')}`);
        }
        if (faults.failed.length > 0) {
            console.log(`[attendance-report] Faltas que NO se pudieron registrar: ${faults.failed.map(f => `${f.name} (${f.error})`).join(' | ')}`);
        }
    }
    catch (error) {
        console.log('[attendance-report] Error registrando faltas automáticas:', error?.message || error);
    }

    const pdfBuffer = await buildAttendanceReportPdf(report, label);

    const shiftTag = shiftFocus ? `${shiftFocus}_` : '';
    const dateStamp = moment.tz(ATTENDANCE_TIMEZONE).format('YYYY-MM-DD_HHmm');
    const filename = `Reporte_Asistencia_${shiftTag}${dateStamp}.pdf`;

    const sent = await sendReportToWhatsapp({
        pdfBuffer,
        caption: buildCaption(report, label),
        filename,
        number,
        listNumber: List_Number
    });

    return {
        cutLabel: label,
        shiftFocus: shiftFocus || null,
        date: report.dateLabel,
        totals: report.totals,
        faultsRegistered: faults.registered,
        faultsSkipped: faults.skipped.length,
        faultsFailed: faults.failed.length,
        sentTo: sent.chatId,
        recipients: sent.count,
        filename,
        pdfSizeKB: Math.round(pdfBuffer.length / 1024)
    };
}


// Registra las faltas de los cortes que ya pasaron hoy (por si el servidor se
// reinició después de la hora). No reenvía el PDF y se puede repetir sin duplicar.
export async function catchUpMissedFaults() {
    const now = moment.tz(ATTENDANCE_TIMEZONE);
    const nowMinutes = (now.hours() * 60) + now.minutes();
    const results = [];

    for (const cut of REPORT_CUTS) {
        const [h, m] = cut.time.split(':').map(Number);
        if (nowMinutes < (h * 60) + m) continue;   // ese corte aún no toca hoy

        try {
            const report = await buildDailyAttendanceReport(new Date(), cut.shift);
            const faults = await registerAbsencesAsFaults(report);
            results.push({ cut: cut.time, shift: cut.shift, registered: faults.registered });

            if (faults.registered > 0) {
                console.log(`[attendance-report] Recuperación del corte ${cut.time} (${cut.shift}): ${faults.registered} falta(s) registrada(s) · ${faults.registeredNames.join(', ')}`);
            }
        }
        catch (error) {
            console.log(`[attendance-report] Error recuperando el corte ${cut.time} (${cut.shift}):`, error?.message || error);
        }
    }

    return results;
}


// ─── PROGRAMADOR ─────────────────────────────────────────────────────────────
// Sin librerías: cada corte se agenda con setTimeout y se re-agenda al terminar.

// Milisegundos que faltan para la próxima vez que el reloj marque hh:mm (Caracas).
const msUntilNext = (hhmm) => {
    const now = moment.tz(ATTENDANCE_TIMEZONE);
    const [h, m] = hhmm.split(':').map(Number);
    const next = now.clone().hours(h).minutes(m).seconds(0).milliseconds(0);
    if (next.isSameOrBefore(now)) next.add(1, 'day');
    return next.diff(now);
};

// Fecha del último envío de cada corte, para no mandarlo dos veces el mismo día.
const sentToday = {};

// Evita arrancar el programador dos veces (duplicaría los envíos).
let schedulerStarted = false;

// Agenda un corte para su próxima hora; al terminar se vuelve a agendar.
const scheduleAt = (cut) => {
    const delay = msUntilNext(cut.time);
    setTimeout(async () => {
        const cutKey = `${cut.time}-${cut.shift}`;
        const today = moment.tz(ATTENDANCE_TIMEZONE).format('YYYY-MM-DD');

        // Ya se envió este corte hoy → no reenviar, solo re-agendar para mañana.
        if (sentToday[cutKey] === today) {
            console.log(`[attendance-report] Corte ${cut.time} (${cut.shift}) ya enviado hoy; se omite el reenvío.`);
            scheduleAt(cut);
            return;
        }

        try {
            sentToday[cutKey] = today; // marca ANTES de enviar (evita reentradas concurrentes)
            const result = await runDailyAttendanceReport({ cutLabel: cut.label, shiftFocus: cut.shift });
            console.log(`[attendance-report] Corte ${cut.time} (${cut.shift}) enviado a ${result.recipients} dest. · retardos: ${result.totals.late} · ausencias: ${result.totals.absent} · faltas registradas: ${result.faultsRegistered}`);
        }
        catch (error) {
            sentToday[cutKey] = null; // falló el envío: permitir reintento
            console.log(`[attendance-report] Error en corte ${cut.time} (${cut.shift}):`, error?.message || error);
        }
        finally {
            scheduleAt(cut); // re-agendar para el día siguiente
        }
    }, delay);

    const nextRun = moment.tz(ATTENDANCE_TIMEZONE).add(delay, 'ms').format('YYYY-MM-DD hh:mm A');
    console.log(`[attendance-report] Próximo corte ${cut.time} (${cut.shift}) → ${nextRun} (hora Venezuela)`);
};


// Arranca el programador de cortes. Por defecto solo en producción;
// ATTENDANCE_REPORT_ENABLED=true|false lo fuerza en cualquier entorno.
export function startAttendanceReportScheduler() {
    if (schedulerStarted) {
        console.log('[attendance-report] Scheduler ya iniciado; se ignora la segunda llamada (evita timers y envíos duplicados).');
        return;
    }
    schedulerStarted = true;

    const flag = process.env.ATTENDANCE_REPORT_ENABLED;
    const enabled = flag !== undefined
        ? flag === 'true'
        : process.env.NODE_ENV === 'production';

    if (!enabled) {
        console.log('[attendance-report] Scheduler DESACTIVADO (ATTENDANCE_REPORT_ENABLED/NODE_ENV). El envío manual por endpoint sigue disponible.');
        return;
    }
    if (REPORT_CUTS.length === 0) {
        console.log('[attendance-report] REPORT_CUTS sin cortes definidos; scheduler no iniciado.');
        return;
    }

    const resumen = REPORT_CUTS.map(c => `${c.time} (${c.shift})`).join(', ');
    console.log(`[attendance-report] Scheduler activo · cortes: ${resumen} · destino: ${toChatId(REPORT_NUMBER)} · bot: ${BOT_URL}`);
    REPORT_CUTS.forEach(scheduleAt);

    // Recupera las faltas de los cortes que ya pasaron hoy, sin bloquear el arranque.
    catchUpMissedFaults().catch(error => {
        console.log('[attendance-report] Error en la recuperación de faltas al arranque:', error?.message || error);
    });
}
