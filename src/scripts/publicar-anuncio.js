import mongoose from 'mongoose';
import { config } from 'dotenv';
import colors from 'colors';

import NotificationModel from '../apiServises/notification/notification.model.js';
import { notify } from '../apiServises/notification/notification.service.js';
import { SYSTEM_USER_ID, SYSTEM_USER_LABEL } from '../libs/systemUser.js';

config();

// ══════════════════════════════════════════════════════════════════════
// PUBLICAR EL ANUNCIO DEL SISTEMA DE NOTIFICACIONES
// ══════════════════════════════════════════════════════════════════════
// Se ejecuta UNA vez, a mano, en el servidor donde vive la API:
//
//     node dist/scripts/publicar-anuncio.js
//
// Hace lo mismo que el endpoint POST /notifications/announcement, pero sin
// necesitar una sesión de administrador ni que el servidor esté levantado:
// entra directo a la base. Es lo práctico para un anuncio único.
//
// La notificación queda firmada por el usuario de Jarvis, el mismo que registra
// las faltas automáticas del corte de asistencia.
//
// El socket no está inicializado en un script suelto, así que no se emite en
// vivo: la notificación queda guardada y cada usuario la ve la próxima vez que
// su campana consulte. Es el comportamiento correcto para un anuncio.

const ANUNCIO = {
    es: {
        title: 'Nuevo sistema de notificaciones',
        body: 'Se ha introducido un nuevo sistema de notificaciones. Desde ahora verás en esta campana los cambios del sistema: creación y edición de establecimientos y franquicias, con el nombre de quien los hizo y la fecha. Las notificaciones que te afecten directamente aparecerán marcadas como "para ti".',
    },
    en: {
        title: 'New notification system',
        body: 'A new notification system has been introduced. From now on this bell shows system changes: establishments and franchises created or edited, with the name of who did it and the date. Notifications that affect you directly are marked as "for you".',
    },
};

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Cortes365';


async function main() {
    console.log(colors.cyan(`Conectando a ${MONGO_URI.replace(/\/\/[^@]*@/, '//***@')}`));
    await mongoose.connect(MONGO_URI);

    // Un anuncio global le llega a toda la plantilla: si el script se corre dos
    // veces por error, no se duplica.
    const yaExiste = await NotificationModel.findOne({
        type: 'system.announcement',
        'i18n.es.title': ANUNCIO.es.title,
    }).select('_id createdAt').lean();

    if (yaExiste) {
        console.log(colors.yellow(
            `El anuncio ya estaba publicado el ${new Date(yaExiste.createdAt).toLocaleString('es-VE')} (id ${yaExiste._id}). No se hace nada.`,
        ));
        await mongoose.disconnect();
        return;
    }

    const notification = await notify({
        type: 'system.announcement',
        actor: { user: SYSTEM_USER_ID, name: SYSTEM_USER_LABEL, surName: '', resolved: true },
        resource: { kind: 'system', name: 'Jarvis365', path: '' },
        extra: ANUNCIO,
    });

    if (!notification) {
        console.log(colors.red('No se pudo crear la notificación. Revisa el log de arriba.'));
        await mongoose.disconnect();
        process.exitCode = 1;
        return;
    }

    console.log(colors.green('Anuncio publicado.'));
    console.log(`  id     : ${notification._id}`);
    console.log(`  firma  : ${SYSTEM_USER_LABEL}`);
    console.log(`  título : ${notification.i18n.es.title}`);
    console.log(`  alcance: ${notification.scope}`);

    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.log(colors.red('Error publicando el anuncio:'), error?.message || error);
    try { await mongoose.disconnect(); } catch { /* ya estaba cerrada */ }
    process.exitCode = 1;
});
