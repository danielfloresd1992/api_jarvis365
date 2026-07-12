import https from 'https';
import moment from 'moment-timezone';
import { buildDailyAttendanceReport } from './attendanceReport.service.js';
import { buildAttendanceReportPdf } from './attendanceReport.pdf.js';

// ══════════════════════════════════════════════════════════════════════
// JOB: Corte de asistencia 2 veces al día → PDF → API de WhatsApp (ava bot)
// ══════════════════════════════════════════════════════════════════════
// Variables de entorno (todas opcionales, con estos defaults):
//   WHATSAPP_BOT_URL           https://amazona365.ddns.net:4000
//   ATTENDANCE_REPORT_NUMBER   584143041220  (acepta también un id @g.us)
//   ATTENDANCE_REPORT_ENABLED  true|false    (default: solo en producción)
//
// Cortes fijos (ver REPORT_CUTS): 13:10 enfocado en personal Diurno y
// 19:30 enfocado en personal Nocturno (horas Venezuela).
//
// El bot expone POST /bot/imgV2/number=:number y recibe JSON:
//   { "my-file": <base64>, "type": <mime>, "my-text": <caption>, "filename": <nombre> }

const ATTENDANCE_TIMEZONE = 'America/Caracas';

const BOT_URL = process.env.WHATSAPP_BOT_URL || 'https://amazona365.ddns.net:4000';
const REPORT_NUMBER = process.env.ATTENDANCE_REPORT_NUMBER || '584143041220';

// Cortes programados: cada uno se enfoca en un tipo de turno.
//   13:10 → personal Diurno   ·   19:30 → personal Nocturno
const REPORT_CUTS = [
    { time: '13:10', shift: 'Diurno', label: 'Corte diurno · Mediodía' },
    { time: '19:30', shift: 'Nocturno', label: 'Corte nocturno · Cierre' }
];


const toChatId = (number) => number.includes('@') ? number : `${number}@c.us`;


// POST JSON al bot usando https.request en vez de fetch: el bot sirve su
// certificado sin la cadena intermedia de Let's Encrypt (cert.pem en lugar
// de fullchain.pem) y fetch lo rechaza con UNABLE_TO_VERIFY_LEAF_SIGNATURE.
// rejectUnauthorized:false aplica SOLO a esta llamada; cuando el bot sirva
// fullchain.pem se puede volver a verificación estricta.
const postJsonToBot = (url, payload) => new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        },
        rejectUnauthorized: false
    }, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body: data }));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
});


// Envía el PDF (base64) con caption a través de la API del bot de WhatsApp.
export async function sendReportToWhatsapp({ pdfBuffer, caption, filename, number = REPORT_NUMBER }) {
    const chatId = toChatId(number);
    const url = `${BOT_URL}/bot/imgV2/number=${encodeURIComponent(chatId)}`;

    const response = await postJsonToBot(url, {
        'my-file': pdfBuffer.toString('base64'),
        'type': 'application/pdf',
        'my-text': caption,
        'filename': filename
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`WhatsApp bot respondió ${response.status}: ${response.body}`);
    }

    return { chatId, status: response.status };
}


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


const cutLabelForNow = (shiftFocus) => {
    if (shiftFocus === 'Diurno') return 'Corte diurno · Mediodía';
    if (shiftFocus === 'Nocturno') return 'Corte nocturno · Cierre';
    const hour = moment.tz(ATTENDANCE_TIMEZONE).hours();
    return hour < 15 ? 'Primer corte · Mediodía' : 'Segundo corte · Cierre';
};


/**
 * Ejecuta el corte completo: datos → PDF → envío por WhatsApp.
 * @param {object} [options]
 * @param {string} [options.cutLabel] - Etiqueta del corte (default según la hora).
 * @param {string} [options.number]   - Número/chat destino (default env o 584143041220).
 * @returns {Promise<object>} Resumen de la ejecución.
 */
export async function runDailyAttendanceReport({ cutLabel, number, shiftFocus } = {}) {
    const label = cutLabel || cutLabelForNow(shiftFocus);
    const report = await buildDailyAttendanceReport(new Date(), shiftFocus);
    const pdfBuffer = await buildAttendanceReportPdf(report, label);

    const shiftTag = shiftFocus ? `${shiftFocus}_` : '';
    const dateStamp = moment.tz(ATTENDANCE_TIMEZONE).format('YYYY-MM-DD_HHmm');
    const filename = `Reporte_Asistencia_${shiftTag}${dateStamp}.pdf`;

    const sent = await sendReportToWhatsapp({
        pdfBuffer,
        caption: buildCaption(report, label),
        filename,
        number
    });

    return {
        cutLabel: label,
        shiftFocus: shiftFocus || null,
        date: report.dateLabel,
        totals: report.totals,
        sentTo: sent.chatId,
        filename,
        pdfSizeKB: Math.round(pdfBuffer.length / 1024)
    };
}


// ── Scheduler ──────────────────────────────────────────────────────────
// Sin dependencias: para cada hora configurada calcula los ms que faltan
// hasta su próxima ocurrencia (hora Venezuela), dispara el job y se
// re-agenda para el día siguiente.

const msUntilNext = (hhmm) => {
    const now = moment.tz(ATTENDANCE_TIMEZONE);
    const [h, m] = hhmm.split(':').map(Number);
    const next = now.clone().hours(h).minutes(m).seconds(0).milliseconds(0);
    if (next.isSameOrBefore(now)) next.add(1, 'day');
    return next.diff(now);
};

const scheduleAt = (cut) => {
    const delay = msUntilNext(cut.time);
    setTimeout(async () => {
        try {
            const result = await runDailyAttendanceReport({ cutLabel: cut.label, shiftFocus: cut.shift });
            console.log(`[attendance-report] Corte ${cut.time} (${cut.shift}) enviado a ${result.sentTo} · retardos: ${result.totals.late} · ausencias: ${result.totals.absent}`);
        }
        catch (error) {
            console.log(`[attendance-report] Error en corte ${cut.time} (${cut.shift}):`, error?.message || error);
        }
        finally {
            scheduleAt(cut); // re-agendar para el día siguiente
        }
    }, delay);

    const nextRun = moment.tz(ATTENDANCE_TIMEZONE).add(delay, 'ms').format('YYYY-MM-DD hh:mm A');
    console.log(`[attendance-report] Próximo corte ${cut.time} (${cut.shift}) → ${nextRun} (hora Venezuela)`);
};


/**
 * Inicia el scheduler de cortes. Habilitado por defecto solo en producción;
 * en desarrollo requiere ATTENDANCE_REPORT_ENABLED=true (evita spam al
 * número real mientras se programa). ATTENDANCE_REPORT_ENABLED=false lo
 * desactiva también en producción.
 */
export function startAttendanceReportScheduler() {
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
}
