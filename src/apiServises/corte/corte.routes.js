import express from 'express';
const routerCorte = express.Router();
import controller from './corte.controller.js';

import nameApi from '../../libs/name_api.js';

routerCorte.get(`${nameApi}/getcorteDoc365`, controller.getCorte);
routerCorte.post(`${nameApi}/SendCorteDoc365`, controller.setCorte);

export { routerCorte }; 