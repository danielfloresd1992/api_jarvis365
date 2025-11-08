import express from 'express';
import controller from './manager.controller.js';
import { uploadManager, uploadNoveltie } from '../../util/multer.js';
import { extendSession, validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';


const routerManager = express.Router();


routerManager.get(`${nameApi}/managerlocal`, extendSession, validateSession, controller.getManagetAllLocal); //solo datos del gerente

routerManager.get(`${nameApi}/managerlocal/local=:name`, extendSession, validateSession, controller.getByNameManager);

routerManager.get(`${nameApi}/manager/establishment=:name`, validateSession, controller.getByNameManager);

routerManager.get(`${nameApi}/managerLocalAndImgById/id=:id`, validateSession, controller.managerLocalAndImgById); /// individual con imagenes por id



/////////////////////////////////////////////////////////////////////////////////////////////////
routerManager.get(`${nameApi}/managerlocal/img`, extendSession, validateSession, controller.getManagerImg); //datos del gerente con imganes

routerManager.get(`${nameApi}/managerlocal/alldata`, extendSession, validateSession, controller.getManagetAllFranchise); //datos de gerente + localidad + franquicia

routerManager.get(`${nameApi}/managerlocal/alldataFill=:name`, extendSession, validateSession, controller.getManagetAllFranchise_fill); //datos de gerente + localidad + franquicia

routerManager.get(`${nameApi}/managerlocal/find=:id`, extendSession, validateSession, controller.getMannager); //solos datos del gerente individual

routerManager.post(`${nameApi}/managerlocal`, extendSession, validateSessionAndUserSuper, uploadNoveltie.fields([{ name: 'img', maxCount: 3 }]), controller.setManager);

routerManager.put(`${nameApi}/managerlocal/id=:id`, extendSession, validateSessionAndUserSuper, controller.putManager);

routerManager.delete(`${nameApi}/managerlocal/:id`, extendSession, validateSessionAndUserSuper, controller.deleteManager);


export { routerManager };