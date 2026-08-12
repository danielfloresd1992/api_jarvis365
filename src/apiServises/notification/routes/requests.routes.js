import express from 'express';
import mongoose from 'mongoose';

import NotificationModel from '../notification.model.js';
import { notify, adminUserIds, actorFromSession } from '../notification.service.js';
import { applyScheduleUpdates, notifyScheduleApplied } from '../../user/scheduleWrite.lib.js';
import { staleSlots, emitScheduleRequest, parseSlot } from '../../user/scheduleRequest.lib.js';
import { validateSession, validateAdminUser } from '../../../middleware/validateSessionAndUser.js';

// ══════════════════════════════════════════════════════════════════════
// SOLICITUDES DE CAMBIO DE HORARIO
// ══════════════════════════════════════════════════════════════════════
// Un usuario `super` no escribe el horario: deja una SOLICITUD y un
// administrador la aprueba, la rechaza, o el propio autor la retira.
//
// Acá viven las tres decisiones y la consulta que la grilla usa para pintar
// las celdas que están esperando.

export const routerRequests = express.Router();
const routerNotification = routerRequests;
const nameApi = '/api_jarvis/v1';
const { ObjectId } = mongoose.Types;

/** Fechas legibles y sin repetir a partir de las celdas de una solicitud. */
const fechasDeSlots = (slots = []) => [...new Set(
    (slots || [])
        .map(parseSlot)
        .filter(Boolean)
        .map(p => new Date(`${p.date}T00:00:00.000Z`).toLocaleDateString('es-VE', { timeZone: 'UTC' })),
)];


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
            const estados = { approved: 'aprobada', rejected: 'rechazada', withdrawn: 'retirada por quien la solicitó' };
            return res.status(409).json({
                status: 409, error: 'Conflict',
                message: `Esta solicitud ya fue ${estados[notification.request?.status] || 'resuelta'}.`,
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

            // ¿Alguien tocó esas celdas mientras la solicitud esperaba?
            //
            // Entre pedir y aprobar puede pasar un día entero. Si otro
            // administrador ya cambió esa jornada a mano, aprobar acá la pisa
            // sin que nadie se entere de que había algo distinto. Se corta y se
            // muestra qué cambió; con `force: true` se aprueba igual, pero
            // siendo una decisión y no un descuido.
            if (req.body?.force !== true) {
                const desactualizadas = await staleSlots(notification.meta);
                if (desactualizadas.length > 0) {
                    return res.status(409).json({
                        status: 409,
                        error: 'Conflict',
                        stale: true,
                        message: desactualizadas.length === 1
                            ? 'El horario de esa fecha cambió después de solicitarse. Revisa antes de aprobar.'
                            : `El horario cambió en ${desactualizadas.length} fechas después de solicitarse. Revisa antes de aprobar.`,
                        changed: desactualizadas,
                    });
                }
            }

            // El autor del cambio es QUIEN APRUEBA: es su firma la que lo
            // autoriza, y así queda en la auditoría del documento de asistencia.
            aplicado = await applyScheduleUpdates(updates, req.session.userId);

            // El empleado también se entera de que su horario cambió: la
            // solicitud era entre el solicitante y el administrador, pero la
            // jornada que cambia es la suya. Se le pasa QUIÉN LO PIDIÓ para que
            // el aviso no atribuya el cambio solo a quien lo aprobó.
            notifyScheduleApplied(
                aplicado.results,
                actorFromSession(req),
                notification.actor,
            );

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
            actor: actorFromSession(req),
            target: notification.target,
            resource: notification.resource,
            extra: { requesterId: notification.actor?.user, note: notification.request.note },
        });

        // La celda deja de estar pendiente para todo el que mire la grilla.
        emitScheduleRequest(decision, {
            notificationId: String(notification._id),
            slots: notification.meta?.slots || [],
            targets: notification.meta?.targets || [],
            requestedBy: {
                user: notification.actor?.user ? String(notification.actor.user) : null,
                name: notification.actor?.name || '',
                surName: notification.actor?.surName || '',
            },
            decidedBy: { user: String(req.session.userId), name: req.session.name || '' },
            applied: aplicado.results.length,
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
 * GET /notifications/schedule/pending
 *
 * Las solicitudes pendientes indexadas por CELDA (`userId|YYYY-MM-DD`), para que
 * la grilla del horario las pinte y ofrezca aceptar o cancelar sin ir a la
 * campana.
 *
 * Devuelve un objeto y no una lista a propósito: la grilla necesita preguntar
 * "¿esta celda tiene algo pendiente?" setenta y seis por treinta y un veces al
 * pintar, y con un mapa es una búsqueda directa en vez de recorrer un arreglo.
 *
 * Una consulta por celda serían más de dos mil peticiones para dibujar un mes.
 *
 * Cada quien ve lo que le corresponde: el administrador todas —es quien
 * decide—, y el usuario `super` solo las suyas, que son las que puede retirar.
 */
routerNotification.get(`${nameApi}/notifications/schedule/pending`, validateSession, async (req, res) => {
    try {
        const esAdmin = req.session.admin === true;

        const query = {
            type: 'schedule.changeRequested',
            'request.status': 'pending',
        };
        if (!esAdmin) query['actor.user'] = req.session.userId;

        const pendientes = await NotificationModel.find(query)
            .select('_id actor target meta createdAt')
            .sort({ createdAt: -1 })
            .lean();

        // Mapa celda → solicitud. Si dos solicitudes tocaran la misma celda
        // gana la MÁS ANTIGUA: es la que está primero en la cola. (El endpoint
        // de creación ya impide que eso ocurra; esto cubre lo que quedó de
        // antes de esa validación.)
        const porCelda = {};
        for (const n of [...pendientes].reverse()) {
            const resumen = {
                notificationId: String(n._id),
                requestedBy: {
                    user: n.actor?.user ? String(n.actor.user) : null,
                    name: n.actor?.name || '',
                    surName: n.actor?.surName || '',
                    img: n.actor?.img || null,
                },
                createdAt: n.createdAt,
                // Cuántas celdas más arrastra: aprobar desde una celda aplica
                // el lote entero, y eso hay que poder decirlo antes.
                slotCount: (n.meta?.slots || []).length,
                targets: n.meta?.targets || [],
            };
            (n.meta?.slots || []).forEach(slot => { porCelda[slot] = resumen; });
        }

        return res.status(200).json({ status: 200, pending: porCelda, total: pendientes.length });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});


/**
 * POST /notifications/:id/withdraw
 *
 * Retira una solicitud propia que sigue pendiente.
 *
 * No usa `/decide` porque no es lo mismo: rechazar es un administrador negando
 * un cambio ajeno, y retirar es quien lo pidió arrepintiéndose. Mezclarlos
 * dejaría en la auditoría "rechazada por Kervis" cuando Kervis nunca la vio.
 *
 * Solo el autor. Un administrador que quiera cortarla tiene `/decide` con
 * 'rejected', que es exactamente lo que le corresponde hacer.
 */
routerNotification.post(`${nameApi}/notifications/:id/withdraw`, validateSession, async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id de notificación inválido.' });

        const notification = await NotificationModel.findById(id);
        if (!notification)
            return res.status(404).json({ status: 404, error: 'Not found', message: 'Solicitud no encontrada.' });

        if (String(notification.actor?.user || '') !== String(req.session.userId)) {
            return res.status(403).json({
                status: 403, error: 'Forbidden',
                message: 'Solo quien hizo la solicitud puede retirarla.',
            });
        }

        if (notification.request?.status !== 'pending') {
            const estados = { approved: 'aprobada', rejected: 'rechazada', withdrawn: 'retirada' };
            return res.status(409).json({
                status: 409, error: 'Conflict',
                message: `Esta solicitud ya fue ${estados[notification.request?.status] || 'resuelta'}.`,
            });
        }

        notification.request.status = 'withdrawn';
        notification.request.decidedBy = req.session.userId;
        notification.request.decidedAt = new Date();
        notification.request.note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
        await notification.save();

        // Se les avisa a los administradores: la tenían pendiente en su bandeja
        // y tienen que saber que ya no hay nada que decidir.
        await notify({
            type: 'schedule.changeWithdrawn',
            actor: actorFromSession(req),
            target: notification.target,
            resource: notification.resource,
            extra: {
                adminIds: await adminUserIds(req.session.userId),
                // Las fechas se reconstruyen de las celdas, que ya las llevan:
                // así el aviso del retiro nombra las mismas que nombraba la
                // solicitud, sin guardarlas dos veces.
                fechas: fechasDeSlots(notification.meta?.slots),
                targets: notification.meta?.targets || [],
            },
        });

        emitScheduleRequest('withdrawn', {
            notificationId: String(notification._id),
            slots: notification.meta?.slots || [],
            targets: notification.meta?.targets || [],
            requestedBy: { user: String(req.session.userId), name: req.session.name || '' },
        });

        return res.status(200).json({ status: 200, withdrawn: true, notificationId: String(notification._id) });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});
