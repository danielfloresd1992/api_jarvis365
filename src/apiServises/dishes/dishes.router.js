import express from 'express';
import controller from './dishes.controller.js';
import { validateObjectIdStrict } from '../../middleware/validateObjectId.js';
import {  extendSession, validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';


const routesDishes = express.Router();


routesDishes.post(`${nameApi}/dishes`, extendSession, validateSessionAndUserSuper, validateObjectIdStrict, controller.setDishe);


routesDishes.get(`${nameApi}/dishes`, extendSession, validateSession, controller.getDishe);


routesDishes.delete(`${nameApi}/dishes`, extendSession, validateSessionAndUserSuper, validateObjectIdStrict, controller.deleteDishComplete);


export { routesDishes };