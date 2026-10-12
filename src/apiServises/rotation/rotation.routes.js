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
// `validateSession` y no un guard de administrador: quien guarda es el operador.



routerRotation.get(`${nameApi}/rotation`, extendSession, validateSession, asyncHandler(controller.getRotations));

routerRotation.post(`${nameApi}/rotation`, extendSession, validateSession, asyncHandler(controller.setRotation));



export { routerRotation };
