import express from 'express';
const routerFranchise = express.Router();
import controller from './franchise.controller.js';
import {  extendSession, validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';



routerFranchise.get(`${nameApi}/franchise`,  extendSession, validateSession, controller.getAllFranchise);

routerFranchise.get(`${nameApi}/franchise/establishments=:name`,  extendSession, validateSession, controller.getEstablishments);

routerFranchise.post(`${nameApi}/franchise`, extendSession, validateSessionAndUserSuper, controller.setFranchise);

routerFranchise.delete(`${nameApi}/franchise/:id`, extendSession, validateSessionAndUserSuper, controller.deleteFranchise);



export { routerFranchise };