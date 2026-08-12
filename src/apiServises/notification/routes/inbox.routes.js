import express from 'express';
import mongoose from 'mongoose';

import NotificationModel from '../notification.model.js';
import NotificationReadModel from '../notificationRead.model.js';
import { audienceQuery } from '../notification.audience.js';
import { validateSession } from '../../../middleware/validateSessionAndUser.js';

// ══════════════════════════════════════════════════════════════════════
// LA BANDEJA
// ══════════════════════════════════════════════════════════════════════
// Leer lo que a uno le toca y marcarlo como leído. Nada acá CREA avisos:
// eso pasa en el resto del sistema, a través de notify().
//
// Qué le toca a cada quien lo decide audienceQuery, en notification.audience.js.

export const routerInbox = express.Router();
const routerNotification = routerInbox;
const nameApi = '/api_jarvis/v1';
const { ObjectId } = mongoose.Types;

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
