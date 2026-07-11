import { Router } from 'express';
import controller from './aiChat.controller.js';
import nameApi from '../../libs/name_api.js';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser.js';
import { validateObjectIdStrict } from '../../middleware/validateObjectId.js';

/*
  Rutas del chat con la IA, todas PROTEGIDAS con la sesión del proyecto
  (extendSession + validateSession). Las que llevan id validan el ObjectId.
  El aislamiento por usuario lo garantiza el controller (filtra por owner).
*/

const routerAiChat = Router();


// Listar / crear conversaciones del usuario autenticado
routerAiChat.get(`${nameApi}/ai-chat`, extendSession, validateSession, controller.listConversations);
routerAiChat.post(`${nameApi}/ai-chat`, extendSession, validateSession, controller.createConversation);

// Operaciones sobre una conversación concreta (siempre del propio usuario)
routerAiChat.get(`${nameApi}/ai-chat/id=:id`, extendSession, validateSession, validateObjectIdStrict, controller.getConversation);
routerAiChat.patch(`${nameApi}/ai-chat/id=:id`, extendSession, validateSession, validateObjectIdStrict, controller.updateTitle);
routerAiChat.post(`${nameApi}/ai-chat/id=:id/message`, extendSession, validateSession, validateObjectIdStrict, controller.appendMessage);
routerAiChat.post(`${nameApi}/ai-chat/id=:id/clear`, extendSession, validateSession, validateObjectIdStrict, controller.clearConversation);
routerAiChat.delete(`${nameApi}/ai-chat/id=:id`, extendSession, validateSession, validateObjectIdStrict, controller.deleteConversation);


export { routerAiChat };
