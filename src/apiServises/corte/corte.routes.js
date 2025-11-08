import express from 'express';
const routerCorte = express.Router();
import controller from './corte.controller.js';

routerCorte.get('/getcorteDoc365', controller.getCorte);
routerCorte.post('/SendCorteDoc365', controller.setCorte);

export { routerCorte }; 