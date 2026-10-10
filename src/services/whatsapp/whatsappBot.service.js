import https from 'https';

// Envío de mensajes por el bot de WhatsApp (ava bot). Lo usan el corte de
// asistencia, las caídas de DVR, el monitoreo y el reporte de novedades.
//
// Variables de entorno (opcionales):
//   WHATSAPP_BOT_URL           https://amazona365.ddns.net:4000
//   ATTENDANCE_REPORT_NUMBER   584143041220, destino por defecto (acepta un id @g.us)
//
// El bot recibe POST /bot/imgV2/number=:number con
//   { "my-file": <base64>, "type": <mime>, "my-text": <caption>, "filename": <nombre> }

export const BOT_URL = process.env.WHATSAPP_BOT_URL || 'https://amazona365.ddns.net:4000';
export const REPORT_NUMBER = process.env.ATTENDANCE_REPORT_NUMBER || '584143041220';


// Número de teléfono → id de chat del bot (lo deja igual si ya es un id).
export const toChatId = (number) => number.includes('@') ? number : `${number}@c.us`;


// Destinatarios como ids de chat, sin vacíos y sin repetir (principal + adicionales).
const chatIdsOf = (number, listNumber) => [...new Set([number, ...listNumber].filter(Boolean).map(toChatId))];


// Envía un JSON al bot. Usa https.request con rejectUnauthorized:false porque el
// bot sirve su certificado sin la cadena intermedia y fetch lo rechaza.
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
    // Sin timeout, un bot colgado dejaría la promesa pendiente para siempre.
    request.setTimeout(60_000, () => {
        request.destroy(new Error('Timeout esperando al bot de WhatsApp (60s)'));
    });
    request.write(body);
    request.end();
});


// Manda el mismo mensaje a cada destinatario, uno tras otro. Un fallo con uno no
// corta el envío a los demás; solo lanza si NADIE lo recibió.
// `failLabel` y `subject` son el texto del log y del error ("el reporte", "el mensaje").
async function deliverToAll(chatIds, payload, { failLabel, subject }) {
    const recipients = [];
    const failed = [];
    for (const chatId of chatIds) {
        try {
            const url = `${BOT_URL}/bot/imgV2/number=${encodeURIComponent(chatId)}`;
            const response = await postJsonToBot(url, payload);
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`WhatsApp bot respondió ${response.status}: ${response.body}`);
            }
            recipients.push(chatId);
        }
        catch (error) {
            failed.push({ chatId, error: error?.message ?? String(error) });
            console.log(`[whatsapp-report] ${failLabel} ${chatId}: ${error?.message ?? error}`);
        }
    }

    if (recipients.length === 0) {
        throw new Error(`Ningún destinatario recibió ${subject}: ${failed.map(f => `${f.chatId} (${f.error})`).join(' | ')}`);
    }

    return { chatId: recipients[0] || null, recipients, count: recipients.length, failed };
}


// Envía un adjunto (PDF, foto…) con texto a uno o varios destinatarios.
export async function sendMediaToWhatsapp({ buffer, mimeType, caption, filename, number = REPORT_NUMBER, listNumber = [] }) {
    const chatIds = chatIdsOf(number, listNumber);
    const payload = {
        'my-file': buffer.toString('base64'),
        'type': mimeType,
        'my-text': caption,
        'filename': filename
    };
    return deliverToAll(chatIds, payload, { failLabel: 'fallo el envío a', subject: 'el reporte' });
}


// Envía un PDF por WhatsApp (atajo de sendMediaToWhatsapp).
export async function sendReportToWhatsapp({ pdfBuffer, caption, filename, number = REPORT_NUMBER, listNumber = [] }) {
    return sendMediaToWhatsapp({
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
        caption,
        filename,
        number,
        listNumber,
    });
}


// Envía solo texto por WhatsApp.
export async function sendTextToWhatsapp({ text, number = REPORT_NUMBER, listNumber = [] }) {
    const chatIds = chatIdsOf(number, listNumber);
    const payload = { 'my-text': text };
    return deliverToAll(chatIds, payload, { failLabel: 'fallo el envío de texto a', subject: 'el mensaje' });
}
