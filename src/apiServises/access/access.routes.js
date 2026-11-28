import express from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { extendSession, validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { validateObjectIdStrict } from '../../middleware/validateObjectId.js';
import nameApi from '../../libs/name_api.js';
import { loadAccess } from './access.middleware.js';
import { accessController } from './access.controller.js';
const routerAccess = express.Router();



// ══════════════════════════════════════════════════════════════════════
// QUÉ LOCALES VE CADA USUARIO (user.access, reglas en access.lib.js)
// ══════════════════════════════════════════════════════════════════════
//
//   GET    /insights/establishments
//          Los locales que puede ver QUIEN LLAMA, por la sesión de su cookie: todos ('all') o solo los de sus
//          franquicias y sus locales sueltos ('only'). Ya poblados con lo que usa insights365 (franquicia,
//          config_report, timeServices, platos). Responde { access, establishments }.
//
//   GET    /insights/documents?establishment=<id>&from=AAAA-MM-DD&to=AAAA-MM-DD
//          Los informes por turno de ese local en esos días (hasta 93), sin páginas: la lista de «Reportes por turno»
//          de insights365. Cada uno se abre con GET /document/:id?populate=pages. 403 si no es de quien llama.
//
//   GET    /access/local/id=:id                   quién tiene acceso a este local (por el local o por su franquicia)
//   POST   /access/local/id=:id                    { userId }: darle este local a un usuario
//   DELETE /access/local/id=:id/user=:userId       quitárselo
//   GET    /access/franchise/id=:id                quién ve toda esta franquicia
//   POST   /access/franchise/id=:id                { userId }: darle la franquicia entera
//   DELETE /access/franchise/id=:id/user=:userId   quitársela
//   GET    /access/users                           todos los usuarios con lo que ve cada uno (para elegir a quién)
//   DELETE /access/user/id=:id                     que vuelva a ver todos los locales (sin restricción)
//
//   Asignar y quitar es de administradores (validateAdminUser), y queda apuntado quién y cuándo (access.updatedBy y
//   access.updatedAt). Dar algo a un usuario que veía todo lo pasa a ver solo lo asignado; quitarle lo último lo deja
//   sin ver nada hasta que se le dé otra cosa o se le devuelva «todos». Nadie cambia su propio acceso (400).



routerAccess.get(`${nameApi}/insights/establishments`, extendSession, validateSession, loadAccess, asyncHandler(accessController.getInsightsEstablishments));
routerAccess.get(`${nameApi}/insights/documents`, extendSession, validateSession, loadAccess, asyncHandler(accessController.getInsightsDocuments));

routerAccess.get(`${nameApi}/access/local/id=:id`, extendSession, validateAdminUser, validateObjectIdStrict, asyncHandler(accessController.getLocalAccess));
routerAccess.post(`${nameApi}/access/local/id=:id`, extendSession, validateAdminUser, validateObjectIdStrict, asyncHandler(accessController.grantLocal));
routerAccess.delete(`${nameApi}/access/local/id=:id/user=:userId`, extendSession, validateAdminUser, validateObjectIdStrict, asyncHandler(accessController.revokeLocal));

routerAccess.get(`${nameApi}/access/franchise/id=:id`, extendSession, validateAdminUser, validateObjectIdStrict, asyncHandler(accessController.getFranchiseAccess));
routerAccess.post(`${nameApi}/access/franchise/id=:id`, extendSession, validateAdminUser, validateObjectIdStrict, asyncHandler(accessController.grantFranchise));
routerAccess.delete(`${nameApi}/access/franchise/id=:id/user=:userId`, extendSession, validateAdminUser, validateObjectIdStrict, asyncHandler(accessController.revokeFranchise));

routerAccess.get(`${nameApi}/access/users`, extendSession, validateAdminUser, asyncHandler(accessController.listUsers));
routerAccess.delete(`${nameApi}/access/user/id=:id`, extendSession, validateAdminUser, validateObjectIdStrict, asyncHandler(accessController.resetAccess));



export { routerAccess };
