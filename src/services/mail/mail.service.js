import nodemailer from 'nodemailer';

// ══════════════════════════════════════════════════════════════════════
// EL CORREO SALIENTE
// ══════════════════════════════════════════════════════════════════════
// Un solo punto de salida para el correo de la API. Va por SMTP con nodemailer,
// así que sirve cualquier proveedor que dé SMTP: Resend, Amazon SES, Brevo,
// SendGrid o una cuenta de Google Workspace. Cambiar de proveedor es cambiar
// las variables, no el código.
//
// Variables de entorno:
//   MAIL_HOST      el servidor SMTP del proveedor (smtp.resend.com, …)
//   MAIL_PORT      587 por defecto (STARTTLS); 465 es TLS directo
//   MAIL_SECURE    true|false; sin ella, true solo en el puerto 465
//   MAIL_USER      el usuario SMTP
//   MAIL_PASS      la contraseña o llave SMTP
//   MAIL_FROM      quién firma: «Jarvis365 <no-responder@dominio>». El dominio
//                  tiene que estar verificado en el proveedor (SPF y DKIM), o
//                  el correo acaba en spam.
//   MAIL_ENABLED   true|false fuerza el envío. Sin ella, solo se envía en
//                  producción, como los avisos de WhatsApp: una máquina de
//                  desarrollo no manda correos a personas reales.
//
// Apagado, no se envía nada y se dice en el log. En desarrollo se escribe
// además el texto entero, para poder seguir el enlace sin buzón.


// mailEnabled = «si el correo sale de verdad: lo que diga MAIL_ENABLED, y si no dice nada, solo en producción»
export const mailEnabled = () => {
    const flag = process.env.MAIL_ENABLED;
    return flag !== undefined ? flag === 'true' : process.env.NODE_ENV === 'production';
};

// mailFrom = «el remitente»
export const mailFrom = () => process.env.MAIL_FROM || 'Jarvis365 <no-responder@jarvis365.net>';


// transport = «la conexión SMTP, creada la primera vez que hace falta y reutilizada después»
let transport = null;

function getTransport() {
    if (transport) return transport;

    const host = process.env.MAIL_HOST;
    if (!host) throw new Error('MAIL_HOST no está definida: no se puede enviar correo.');

    const port = Number(process.env.MAIL_PORT || 587);
    const secure = process.env.MAIL_SECURE !== undefined ? process.env.MAIL_SECURE === 'true' : port === 465;
    const user = process.env.MAIL_USER;

    transport = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass: process.env.MAIL_PASS || '' } : undefined,
        // Sin tiempos, un SMTP que no contesta deja la promesa colgada para siempre.
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
    });
    return transport;
}


/**
 * Envía un correo. Lanza si el proveedor lo rechaza; quien llama decide si eso
 * se le dice a alguien o solo va al log.
 *
 * @returns {Promise<{ sent: boolean, id?: string }>}
 */
export async function sendMail({ to, subject, text, html }) {
    if (!mailEnabled()) {
        console.log(`[correo] DESACTIVADO (MAIL_ENABLED/NODE_ENV): no se envió «${subject}» a ${to}.`);
        if (process.env.NODE_ENV === 'development') console.log(`[correo] el texto:\n${text}\n`);
        return { sent: false };
    }

    const info = await getTransport().sendMail({ from: mailFrom(), to, subject, text, html });
    return { sent: true, id: info.messageId };
}


export default { sendMail, mailEnabled, mailFrom };
