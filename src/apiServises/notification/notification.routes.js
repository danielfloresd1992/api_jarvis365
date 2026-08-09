import express from 'express';
import mongoose from 'mongoose';

import NotificationModel from './notification.model.js';
import NotificationReadModel from './notificationRead.model.js';
import { notify } from './notification.service.js';
import { applyScheduleUpdates, notifyScheduleApplied } from '../user/scheduleWrite.lib.js';
import { SYSTEM_USER_ID, SYSTEM_USER_LABEL } from '../../libs/systemUser.js';
import { validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';

const routerNotification = express.Router();
const nameApi = '/api_jarvis/v1';
const { ObjectId } = mongoose.Types;


/**
 * Qué notificaciones le corresponden a un usuario.
 *   · todas las globales
 *   · las personales donde figura como destinatario
 *   · las de administradores, solo si lo es
 *
 * El filtro se arma en el SERVIDOR, no en el cliente: una notificación personal
 * que viaja al front equivocado ya está filtrada, aunque no se pinte.
 */
const audienceQuery = (session) => {
    const or = [{ scope: 'global' }];
    if (session?.userId) or.push({ scope: 'personal', recipients: session.userId });
    if (session?.admin === true) or.push({ scope: 'admin' });
    return { $or: or };
};


/**
 * GET /notifications?page=0&limit=20
 * Lista paginada con el estado de lectura de ESTE usuario.
 */
routerNotification.get(`${nameApi}/notifications`, validateSession, async (req, res) => {
    try {
        const page = Math.max(0, Number(req.query.page) || 0);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
        const userId = req.session.userId;

        const query = audienceQuery(req.session);

        const [items, total] = await Promise.all([
            NotificationModel.find(query)
                .sort({ createdAt: -1 })
                .skip(page * limit)
                .limit(limit)
                .populate('actor.user', 'name surName img')
                .lean(),
            NotificationModel.countDocuments(query),
        ]);

        // Estado de lectura en UNA consulta para toda la página, en vez de una
        // por notificación.
        const ids = items.map(n => n._id);
        const reads = await NotificationReadModel.find({ user: userId, notification: { $in: ids } })
            .select('notification')
            .lean();
        const leidas = new Set(reads.map(r => String(r.notification)));

        return res.status(200).json({
            status: 200,
            page,
            limit,
            total,
            notifications: items.map(n => ({ ...n, read: leidas.has(String(n._id)) })),
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});


/**
 * GET /notifications/unread-count
 * Lo consulta la campana al montar. Se resuelve contando las que le tocan y
 * restando las que ya leyó, sin traer los documentos.
 */
routerNotification.get(`${nameApi}/notifications/unread-count`, validateSession, async (req, res) => {
    try {
        const userId = req.session.userId;
        const query = audienceQuery(req.session);

        const [total, leidas] = await Promise.all([
            NotificationModel.countDocuments(query),
            NotificationReadModel.countDocuments({ user: userId }),
        ]);

        // `leidas` puede incluir lecturas de notificaciones ya borradas; el
        // máximo con cero evita un contador negativo.
        return res.status(200).json({ status: 200, unread: Math.max(0, total - leidas) });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});


/**
 * POST /notifications/:id/read
 * Idempotente: el índice único (notification, user) hace que marcar dos veces
 * no duplique ni falle.
 */
routerNotification.post(`${nameApi}/notifications/:id/read`, validateSession, async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id de notificación inválido.' });

        await NotificationReadModel.updateOne(
            { notification: id, user: req.session.userId },
            { $setOnInsert: { readAt: new Date() } },
            { upsert: true },
        );

        return res.status(200).json({ status: 200, read: true });
    }
    catch (error) {
        // 11000 = carrera entre dos pestañas marcando a la vez: ya está leída.
        if (error?.code === 11000) return res.status(200).json({ status: 200, read: true });
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});


/**
 * POST /notifications/read-all
 * Marca como leídas todas las que le corresponden al usuario.
 */
routerNotification.post(`${nameApi}/notifications/read-all`, validateSession, async (req, res) => {
    try {
        const userId = req.session.userId;

        const pendientes = await NotificationModel.find(audienceQuery(req.session))
            .select('_id')
            .lean();

        if (pendientes.length === 0) return res.status(200).json({ status: 200, marked: 0 });

        // bulkWrite con upsert: una sola ida a la base para todas.
        const ops = pendientes.map(n => ({
            updateOne: {
                filter: { notification: n._id, user: userId },
                update: { $setOnInsert: { readAt: new Date() } },
                upsert: true,
            },
        }));

        const result = await NotificationReadModel.bulkWrite(ops, { ordered: false });
        return res.status(200).json({ status: 200, marked: result.upsertedCount ?? 0 });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});


/**
 * POST /notifications/:id/decide   body: { decision: 'approved'|'rejected', note? }
 *
 * Resuelve una SOLICITUD pendiente. Solo administradores.
 *
 * Al aprobar se aplica el cambio guardado en request.payload con la MISMA
 * función que usa el camino directo (applyScheduleUpdates), no con una copia:
 * el cambio aprobado tiene que escribirse exactamente igual que si lo hubiera
 * hecho el administrador a mano.
 *
 * Queda registrado quién decidió y cuándo, y se le avisa a quien lo solicitó.
 */
routerNotification.post(`${nameApi}/notifications/:id/decide`, validateAdminUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { decision, note } = req.body || {};

        if (!ObjectId.isValid(id))
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id de notificación inválido.' });
        if (!['approved', 'rejected'].includes(decision))
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'La decisión debe ser "approved" o "rejected".' });

        const notification = await NotificationModel.findById(id);
        if (!notification)
            return res.status(404).json({ status: 404, error: 'Not found', message: 'Solicitud no encontrada.' });

        if (notification.request?.status !== 'pending') {
            // Dos administradores abriendo la campana a la vez: el segundo se
            // encuentra con que ya está resuelta. Se informa, no se re-aplica.
            return res.status(409).json({
                status: 409, error: 'Conflict',
                message: `Esta solicitud ya fue ${notification.request?.status === 'approved' ? 'aprobada' : 'rechazada'}.`,
            });
        }

        let aplicado = { results: [], errors: [] };

        if (decision === 'approved') {
            const updates = notification.request?.payload?.updates || [];
            if (updates.length === 0) {
                return res.status(400).json({
                    status: 400, error: 'Bad request',
                    message: 'La solicitud no tiene cambios que aplicar.',
                });
            }

            // El autor del cambio es QUIEN APRUEBA: es su firma la que lo
            // autoriza, y así queda en la auditoría del documento de asistencia.
            aplicado = await applyScheduleUpdates(updates, req.session.userId);

            // El empleado también se entera de que su horario cambió: la
            // solicitud era entre el solicitante y el administrador, pero la
            // jornada que cambia es la suya.
            notifyScheduleApplied(aplicado.results, {
                user: req.session.userId,
                name: req.session.name || '',
            });

            // Si NADA se pudo aplicar, la solicitud sigue pendiente: darla por
            // aprobada dejaría al solicitante creyendo que su cambio entró.
            if (aplicado.results.length === 0) {
                return res.status(422).json({
                    status: 422, error: 'Unprocessable',
                    message: 'No se pudo aplicar ningún cambio. La solicitud sigue pendiente.',
                    errors: aplicado.errors,
                });
            }
        }

        notification.request.status = decision;
        notification.request.decidedBy = req.session.userId;
        notification.request.decidedAt = new Date();
        notification.request.note = typeof note === 'string' ? note.trim() : '';
        await notification.save();

        // Avisar a quien lo pidió. A los administradores no: acaban de decidirlo.
        await notify({
            type: decision === 'approved' ? 'schedule.changeApproved' : 'schedule.changeRejected',
            actor: { user: req.session.userId, name: req.session.name || '' },
            target: notification.target,
            resource: notification.resource,
            extra: { requesterId: notification.actor?.user, note: notification.request.note },
        });

        const poblada = await NotificationModel.findById(id)
            .populate('actor.user request.decidedBy', 'name surName img')
            .lean();

        return res.status(200).json({
            status: 200,
            notification: poblada,
            applied: aplicado.results.length,
            errors: aplicado.errors,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});


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


export { routerNotification };
