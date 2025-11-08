import controller from './menu.controller.js';
import express from 'express';
import { extendSession, validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';
const routerMenu = express.Router();



routerMenu.get(`${nameApi}/menu`, extendSession, validateSession, controller.getAllMenu);

routerMenu.get(`${nameApi}/menu/category=:category`, extendSession, validateSession, controller.getCategory);

routerMenu.get(`${nameApi}/menu/id=:id`, extendSession, validateSession, controller.getMenuById);

routerMenu.post(`${nameApi}/menu`, extendSession, validateSessionAndUserSuper, controller.setMenu);

routerMenu.post(`${nameApi}/menu/put`, extendSession, validateSessionAndUserSuper, controller.putMenu);

routerMenu.delete(`${nameApi}/menu/id=:id`, extendSession, validateSessionAndUserSuper,controller.deleteByIdMenu);



export { routerMenu };