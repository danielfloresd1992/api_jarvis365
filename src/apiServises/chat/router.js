import { Router } from 'express';
import { io } from '../../services/socket/io.js';
import nameApi from '../../libs/name_api.js';
import { validateSession } from '../../middleware/validateSessionAndUser.js';
import controller from './controller.js';

const routerChat = Router();


routerChat.get(`${nameApi}/chat`, validateSession, controller.getChatPaginate);
routerChat.post(`${nameApi}/chat`, validateSession, controller.setMessage);



export { routerChat };