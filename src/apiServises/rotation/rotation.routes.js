import express from 'express';
import controller from './rotation.controller.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';
import { loadAccess } from '../access/access.middleware.js';
const routerRotation = express.Router();



// ══════════════════════════════════════════════════════════════════════
// EL CICLO DE LA ROTACIÓN — lo que guarda el disquete de Jarvis-express365
// ══════════════════════════════════════════════════════════════════════
//
//   GET  /rotation?establishment=<id>&from=AAAA-MM-DD&to=AAAA-MM-DD
//   GET  /rotation?name=<nombre del local>&from=AAAA-MM-DD&to=AAAA-MM-DD
//        Las rotaciones GUARDADAS de un establecimiento —por su id o por su nombre— entre
//        dos DÍAS OPERATIVOS (08:00 a 07:00 en America/Caracas), los dos
//        incluidos. Sin `to`, solo `from`. Como mucho 62 días. Un nombre que no
//        existe responde 404. Responde { establishment, name, status, from, to, total, documents }.
//   GET  /rotation?establishment=<id>&status=open
//        Las que siguen ABIERTAS en Mesas, de cualquier día (las fechas son opcionales).
//
//   GET  /rotation/summary?scope=live   (solo las ABIERTAS ahora: el tablero en vivo del lobby de Client365)
//   GET  /rotation/summary?day=AAAA-MM-DD
//        El día operativo de TODOS los locales, ya contado: una fila por local que tuvo rotaciones (con su nombre y el
//        de su franquicia), con en vivo,
//        guardadas, primeros y otros toques y las demoras reportadas (primera atención, limpieza, preparación).
//        Sin `day`, el de ahora, con las abiertas incluidas. Lo usa el tablero del lobby de Client365.
//        Responde { day, live, total, establishments }.
//
//   POST /rotation
//        Guarda una rotación. El autor sale de la sesión. Repetir el mismo
//        `clientId` en el mismo establecimiento responde 409: ya estaba guardada.
//        Si estaba abierta (subida por Mesas), la cierra.
//
//   PUT  /rotation/client=<clientId>
//        MESAS EN VIVO: sube la rotación entera mientras se trabaja (status 'open') o la
//        cierra (status 'closed', el disquete). Crea, reemplaza, o no toca si lo que llega
//        es más viejo (clientUpdatedAt). Responde { outcome, rotation }. 409 si ya estaba
//        guardada y lo que llega la quiere abierta.
//
//   DELETE /rotation/client=<clientId>?establishment=<id>
//        Quita una rotación ABIERTA que Mesas eliminó o dejó en blanco. Una guardada no: 409.
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
//   DELETE /rotation/id=<_id de la rotación>
//          Borra una rotación guardada. Solo quien la guardó (403 si es otro), y no si Client365 ya la
//          verificó o si sigue abierta en Mesas (409). Una que ya no existe responde 200 con removed: false.
//
// Los que escriben (POST, PUT, añadir y quitar toques) avisan en vivo por socket
// a los que tienen abierto ese local: '<nombre del local>-post' o '-put' (rotation.socket.js); el
// borrado, con '<nombre del local>-delete' y solo el _id.
// Los de Mesas (PUT y DELETE /rotation/client=) avisan con 'rotation-sync:<_id del local>'.
//
// `validateSession` y no un guard de administrador: quien guarda y corrige es el operador.
// Las lecturas (GET) pasan además por loadAccess: un usuario con acceso restringido (user.access) solo lee las
// rotaciones de sus locales; pedir las de otro responde 403, y el resumen solo trae los suyos.



routerRotation.get(`${nameApi}/rotation`, extendSession, validateSession, loadAccess, asyncHandler(controller.getRotations));

routerRotation.get(`${nameApi}/rotation/summary`, extendSession, validateSession, loadAccess, asyncHandler(controller.getRotationSummary));

routerRotation.post(`${nameApi}/rotation`, extendSession, validateSession, asyncHandler(controller.setRotation));

routerRotation.put(`${nameApi}/rotation/id=:id`, extendSession, validateSession, asyncHandler(controller.editRotation));

routerRotation.put(`${nameApi}/rotation/client=:clientId`, extendSession, validateSession, asyncHandler(controller.syncRotation));

routerRotation.delete(`${nameApi}/rotation/client=:clientId`, extendSession, validateSession, asyncHandler(controller.removeOpenRotation));

routerRotation.post(`${nameApi}/rotation/id=:id/touch`, extendSession, validateSession, asyncHandler(controller.addTouch));

routerRotation.delete(`${nameApi}/rotation/touch/id=:id`, extendSession, validateSession, asyncHandler(controller.removeTouch));

routerRotation.delete(`${nameApi}/rotation/id=:id`, extendSession, validateSession, asyncHandler(controller.removeRotation));



export { routerRotation };
