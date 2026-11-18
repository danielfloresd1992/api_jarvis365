import express from 'express';
import controller from './verificationSession.controller.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';
const routerVerificationSession = express.Router();



// ══════════════════════════════════════════════════════════════════════
// QUIÉN ESTÁ HACIENDO CADA VERIFICACIÓN — el bloqueo en vivo
// ══════════════════════════════════════════════════════════════════════
//
// Una verificación (la 1 o la 2 de un turno) la trabaja una persona a la vez. Mientras su sesión está activa, los
// endpoints que escriben en /shift-verification responden 423 a cualquier otra. Cerrar el navegador NO la suelta: al
// volver (o desde otro equipo) se reanuda. El modelo y las reglas, en verificationSession.model.js y .lib.js.
//
//   POST   /verification-session                 body: { verification, pass }
//          Tomarla al abrir el panel: 201 claim · 200 resume · 409 busy (con idle) | elsewhere | closed.
//
//   POST   /verification-session/id=<_id>/take
//          Quitársela a quien lleva 15 minutos sin señales (un administrador, siempre): 201 take.
//
//   PUT    /verification-session/id=<_id>/heartbeat
//          «Sigo aquí»: 200, o 409 lost si ya no es tuya.
//
//   DELETE /verification-session/id=<_id>
//          Soltarla («Dejar para luego»): quien la tiene, o un administrador.
//
//   GET    /verification-session/mine            la que tengo a medias, o null: para llevar a reanudar
//   GET    /verification-session?day=AAAA-MM-DD  las activas de ese día, con mine e idle: el candado de la lista
//
// Cada cambio se avisa en vivo a todos ('verification-session', con la sesión poblada) y queda en el historial de
// la verificación (tomarla, reanudarla tras un rato, quitársela a otro, soltarla).



routerVerificationSession.get(`${nameApi}/verification-session/mine`, extendSession, validateSession, asyncHandler(controller.mine));

routerVerificationSession.get(`${nameApi}/verification-session`, extendSession, validateSession, asyncHandler(controller.list));

routerVerificationSession.post(`${nameApi}/verification-session`, extendSession, validateSession, asyncHandler(controller.acquire));

routerVerificationSession.post(`${nameApi}/verification-session/id=:id/take`, extendSession, validateSession, asyncHandler(controller.take));

routerVerificationSession.put(`${nameApi}/verification-session/id=:id/heartbeat`, extendSession, validateSession, asyncHandler(controller.heartbeat));

routerVerificationSession.delete(`${nameApi}/verification-session/id=:id`, extendSession, validateSession, asyncHandler(controller.release));



export { routerVerificationSession };
