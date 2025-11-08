import express from 'express';
const routerView = express.Router();
import controller from './view.controller.js';
import { join } from 'path';

import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))


//vistas


routerView.get('/', controller.singinView);
routerView.get('/register', controller.register);

routerView.get('/lobby', controller.index);

routerView.get('/getCortes365', controller.viewCorte);

routerView.get('/entregaCortes365', controller.sendCorte);

routerView.get('/crudLocal', controller.crudLocal);

routerView.get('/crudManager', controller.crudManager);

routerView.get('/performance', controller.performanceUser);

routerView.get('/menuediction', controller.editMenu);

routerView.get('/profileAndRestaunrant=:namelocal', controller.getProfileLocal);


routerView.get('/reportes_alertas', (req, res) => {
    return res.sendFile(join(__dirname, '../../public/reporte_alerta/Index.html'));
});


routerView.get('/manager%date', controller.managerDateClient);

export { routerView }; 