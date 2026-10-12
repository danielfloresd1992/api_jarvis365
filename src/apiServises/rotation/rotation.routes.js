import express from 'express';
import controller from './rotation.controller.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';
const routerRotation = express.Router();



// ══════════════════════════════════════════════════════════════════════
// EL CICLO DE LA ROTACIÓN — lo que guarda el disquete de Jarvis-express365
// ══════════════════════════════════════════════════════════════════════
//
//   GET  /rotation?establishment=<id>&from=AAAA-MM-DD&to=AAAA-MM-DD
//   GET  /rotation?name=<nombre del local>&from=AAAA-MM-DD&to=AAAA-MM-DD
//        Las rotaciones de un establecimiento —por su id o por su nombre— entre
//        dos DÍAS OPERATIVOS (08:00 a 07:00 en America/Caracas), los dos
//        incluidos. Sin `to`, solo `from`. Como mucho 62 días. Un nombre que no
//        existe responde 404. Responde { establishment, name, from, to, total, documents }.
//
//   POST /rotation
//        Guarda una rotación. El autor sale de la sesión. Repetir el mismo
//        `clientId` en el mismo establecimiento responde 409: ya estaba guardada.
//
//   PUT  /rotation/id=<_id>
//        Corrige una rotación guardada. El _id es el de lo que se corrige —la
//        rotación, uno de sus procesos o uno de sus toques— y el body, lo que
//        cambia: { tableNumber: '33' }, { dishDelivery: '10:59:00' }… Cada
//        propiedad que cambie queda anotada en `changes` (quién, cuándo, el valor
//        de antes y el nuevo). Responde con la rotación entera, como el GET.
//
//   POST   /rotation/id=<_id de la rotación>/touch
//          Apunta un toque nuevo en una rotación guardada. Body: { ref, name, hourTouch }.
//          Un pedido para llevar no lleva toques: 400.
//
//   DELETE /rotation/touch/id=<_id del toque>
//          Quita un toque. El id es el del TOQUE: con el de la rotación no se borra nada.
//
//   Las dos anotan en `changes` el toque añadido o quitado y responden con la rotación entera.
//
// Los que escriben (POST, PUT, añadir y quitar toques) avisan en vivo por socket
// a los que tienen abierto ese local: '<nombre del local>-post' o '-put' (rotation.socket.js).
//
// `validateSession` y no un guard de administrador: quien guarda y corrige es el operador.



routerRotation.get(`${nameApi}/rotation`, extendSession, validateSession, asyncHandler(controller.getRotations));

routerRotation.post(`${nameApi}/rotation`, extendSession, validateSession, asyncHandler(controller.setRotation));

routerRotation.put(`${nameApi}/rotation/id=:id`, extendSession, validateSession, asyncHandler(controller.editRotation));

routerRotation.post(`${nameApi}/rotation/id=:id/touch`, extendSession, validateSession, asyncHandler(controller.addTouch));

routerRotation.delete(`${nameApi}/rotation/touch/id=:id`, extendSession, validateSession, asyncHandler(controller.removeTouch));



export { routerRotation };
