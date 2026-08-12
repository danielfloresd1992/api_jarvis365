import express from 'express';

import { notify } from '../notification.service.js';
import NotificationModel from '../notification.model.js';
import { SYSTEM_USER_ID, SYSTEM_USER_LABEL } from '../../../libs/systemUser.js';
import { validateAdminUser } from '../../../middleware/validateSessionAndUser.js';

// ══════════════════════════════════════════════════════════════════════
// ANUNCIOS DE LA PLATAFORMA
// ══════════════════════════════════════════════════════════════════════
// El único aviso que NO nace de que alguien tocara un documento: lo publica
// un administrador a mano y lo firma el usuario del sistema.

export const routerAnnouncement = express.Router();
const routerNotification = routerAnnouncement;
const nameApi = '/api_jarvis/v1';

/**
 * POST /notifications/announcement
 *
 * Publica un anuncio GLOBAL firmado por el usuario de Jarvis, no por quien lo
 * dispara: es la voz del sistema, no la de una persona.
 *
 * Sin cuerpo publica el estreno del sistema de notificaciones. Con
 * { es: {title, body}, en: {...} } publica cualquier otro anuncio, para no
 * tener que tocar código en el próximo.
 *
 * Solo administradores: un anuncio global le llega a toda la plantilla.
 */
routerNotification.post(`${nameApi}/notifications/announcement`, validateAdminUser, async (req, res) => {
    try {
        const ANUNCIO_POR_DEFECTO = {
            es: {
                title: 'Nuevo sistema de notificaciones',
                body: 'Se ha introducido un nuevo sistema de notificaciones. Desde ahora verás en esta campana los cambios del sistema: creación y edición de establecimientos y franquicias, con el nombre de quien los hizo y la fecha. Las notificaciones que te afecten directamente aparecerán marcadas como "para ti".',
            },
            en: {
                title: 'New notification system',
                body: 'A new notification system has been introduced. From now on this bell shows system changes: establishments and franchises created or edited, with the name of who did it and the date. Notifications that affect you directly are marked as "for you".',
            },
        };

        const texto = {
            es: { ...ANUNCIO_POR_DEFECTO.es, ...(req.body?.es || {}) },
            en: { ...ANUNCIO_POR_DEFECTO.en, ...(req.body?.en || {}) },
        };

        // Un anuncio global le llega a toda la plantilla: repetirlo por un doble
        // clic sería ruido para todos. Se bloquea el mismo título, salvo que se
        // pida explícitamente con { force: true }.
        if (req.body?.force !== true) {
            const yaExiste = await NotificationModel.findOne({
                type: 'system.announcement',
                'i18n.es.title': texto.es.title,
            }).select('_id createdAt').lean();

            if (yaExiste) {
                return res.status(409).json({
                    status: 409,
                    error: 'Conflict',
                    message: `Ese anuncio ya se publicó el ${new Date(yaExiste.createdAt).toLocaleString('es-VE')}. Usa force:true para repetirlo.`,
                });
            }
        }

        const notification = await notify({
            type: 'system.announcement',
            // El apellido va vacío a propósito: actorName concatena nombre y
            // apellido, y así la firma se lee exactamente "Usuario de Jarvis".
            // `resolved` impide que el servicio lo complete desde la base, donde
            // ese usuario figura como "Jarvis Vision".
            actor: { user: SYSTEM_USER_ID, name: SYSTEM_USER_LABEL, surName: '', resolved: true },
            resource: { kind: 'system', name: 'Jarvis365', path: '' },
            extra: texto,
        });

        if (!notification) {
            return res.status(500).json({ status: 500, error: 'Error', message: 'No se pudo publicar el anuncio.' });
        }

        return res.status(201).json({ status: 201, notification });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});
