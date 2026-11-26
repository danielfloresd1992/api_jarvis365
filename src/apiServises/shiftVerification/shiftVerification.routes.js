import express from 'express';
import controller from './shiftVerification.controller.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';
const routerShiftVerification = express.Router();



// ══════════════════════════════════════════════════════════════════════
// LA VERIFICACIÓN DE UN TURNO — las rotaciones de Mesas comparadas con el video
// ══════════════════════════════════════════════════════════════════════
//
// Una por local, día operativo (08:00 a 07:00 en America/Caracas) y turno ('day' | 'night'). Lleva todas las
// rotaciones de mesa del turno y, en cada una y en cada uno de sus toques, lo que dijeron las DOS verificaciones:
// 'confirmed' (está en el video) o 'notFound' (no está). Lo que el operador no anotó se recupera. El modelo y las
// cuentas están en shiftVerification.model.js y shiftVerification.lib.js.
//
//   GET  /shift-verification?day=AAAA-MM-DD[&establishment=<id>]
//        Cómo va cada local ese día: { day, establishments: [{ establishment, shifts: [{ shift, rotations,
//        verification }] }] }. `rotations` son las de mesa guardadas en ese turno; `verification`, null si nadie
//        la abrió, o { _id, operator, first, second, totals } con { checked, total, closedAt, verifiedBy } en
//        cada verificación.
//
//   GET  /shift-verification/id=<_id>
//        La verificación entera, sin cambiarla: para quien mira mientras otra persona la trabaja.
//
//   POST /shift-verification            body: { establishment, day, shift }
//        Abre la verificación: la crea (201) o la pone al día con lo guardado después (200). Responde la
//        verificación entera, con cada rotación poblada (sus horas, su mesa y sus toques) y `summary`: cómo va
//        cada verificación y el resultado de ahora.
//
//   PUT  /shift-verification/id=<_id>/check     body: { pass: 1|2, rotation, touch?, status, note? }
//        Marca una rotación —o, con `touch`, uno de sus toques— en esa verificación: 'confirmed', 'notFound',
//        o null para quitar la marca.
//
//   POST /shift-verification/id=<_id>/rotation  body: { pass, tableNumber, hourOccupies, hourFirstAttention?,
//                                                       breakUp?, tableCleaning? }
//        Recupera una rotación del video: se crea guardada (recovered: true) y entra en la verificación.
//
//   POST /shift-verification/id=<_id>/rotation=<_id>/touch    body: { pass, ref?, name, hourTouch, hourTouchFinish? }
//        Recupera un toque del video en esa rotación.
//
//   PUT  /shift-verification/id=<_id>/close     body: { pass }
//        Cierra esa verificación: tiene que estar todo marcado. Quien la cierra queda como su verificador.
//
//   POST   /shift-verification/id=<_id>/comment                   body: { pass, rotation?, text }
//   PUT    /shift-verification/id=<_id>/comment=<_id>             body: { text }
//   DELETE /shift-verification/id=<_id>/comment=<_id>
//        Los comentarios de cada verificación: dejar uno en la 1 o en la 2 (con `rotation`, apunta a esa rotación),
//        cambiar su texto o borrarlo. Editar y borrar, solo su autor (403). Comentar no pide tener la verificación
//        tomada y se puede con ella cerrada.
//
// Todos menos el primer GET responden con la verificación entera, que lleva su historial (quién hizo qué), sus
// comentarios y, desde el primer cierre, sus demoras. 409 cuando la verificación está cerrada, cuando se intenta la
// 2 con la 1 abierta, o cuando se cierra con algo sin marcar. Para marcar, recuperar o cerrar hay que TENER la
// verificación (POST /verification-session): si no, 423 con quién la tiene. Quien verifica sale de la sesión.



routerShiftVerification.get(`${nameApi}/shift-verification`, extendSession, validateSession, asyncHandler(controller.getSummary));

routerShiftVerification.get(`${nameApi}/shift-verification/id=:id`, extendSession, validateSession, asyncHandler(controller.getVerification));

routerShiftVerification.post(`${nameApi}/shift-verification`, extendSession, validateSession, asyncHandler(controller.openVerification));

routerShiftVerification.put(`${nameApi}/shift-verification/id=:id/check`, extendSession, validateSession, asyncHandler(controller.check));

routerShiftVerification.post(`${nameApi}/shift-verification/id=:id/rotation`, extendSession, validateSession, asyncHandler(controller.recoverRotation));

routerShiftVerification.post(`${nameApi}/shift-verification/id=:id/rotation=:rotationId/touch`, extendSession, validateSession, asyncHandler(controller.recoverTouch));

routerShiftVerification.put(`${nameApi}/shift-verification/id=:id/close`, extendSession, validateSession, asyncHandler(controller.closeVerification));

routerShiftVerification.post(`${nameApi}/shift-verification/id=:id/comment`, extendSession, validateSession, asyncHandler(controller.addComment));

routerShiftVerification.put(`${nameApi}/shift-verification/id=:id/comment=:commentId`, extendSession, validateSession, asyncHandler(controller.editComment));

routerShiftVerification.delete(`${nameApi}/shift-verification/id=:id/comment=:commentId`, extendSession, validateSession, asyncHandler(controller.deleteComment));



export { routerShiftVerification };
