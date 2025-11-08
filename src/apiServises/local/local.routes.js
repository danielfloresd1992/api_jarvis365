import express from 'express';
const routerLocal = express.Router();
import { uploadLocal } from '../../util/multer.js';
import { controller } from './local.controller.js';
import {  extendSession, validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import { validateObjectIdStrict } from '../../middleware/validateObjectId.js';
import nameApi from '../../libs/name_api.js';



import LocalModel from './local.model.js';


routerLocal.get(`${nameApi}/establishment`,  extendSession, validateSession, async (req, res) => {
    try {
        const { AllEstablishment, paginate, limit, page } = req.query;
        const query = {
            status: 'activo',
        };
        
        if(AllEstablishment === 'complete') {
            delete query.status;
        }

        let establishment;
        if(paginate === 'true'){
            const currentPage = parseInt(page);
            const pageSize = parseInt(limit);
            if(!currentPage || !pageSize) return res.status(400).json({ status: 400, error: 'Bad request', message: 'When the paginate parameter is set to true, the limit and page parameters are mandatory and must contain numeric values.' })
            const skip = (currentPage - 1) * pageSize;

            const totalDocuments = await LocalModel.countDocuments(query);
            const result = await LocalModel.find(query).select('-managers -img -dishes -touchs -dishMenu')
                .skip(skip)
                .limit(pageSize);

            establishment = {
                documents: result,
                totalDocuments,
                currentPage,
                pageSize,
                totalPages: Math.ceil(totalDocuments / pageSize)
            }

        }
        else{
            establishment = await LocalModel.find(query).select('-managers -img -dishes -touchs -dishMenu');
        }

        return res.json(establishment).status(200);

    } 
    catch (error) {
        return res.status(500).json({ status: 500, error: 'Error server internal', error: error });
    }
}); // datos solos del local



// this is deprecated


routerLocal.get(`${nameApi}/local`,  extendSession, validateSession, controller.getAllLocal); // datos solos del local

routerLocal.get(`${nameApi}/localLigth`,  extendSession, controller.getAllLocalLigth);

routerLocal.get(`${nameApi}/localforCort`, extendSession, validateSession, controller.getCortLocal);

routerLocal.get(`${nameApi}/local/image=:image`, extendSession, validateSession ,controller.getImage); //getImage 

routerLocal.get(`${nameApi}/local-cache/activate=:boolean`, extendSession, validateSession ,controller.local_cache);

routerLocal.get(`${nameApi}/local&Manager`, extendSession, validateSession, controller.getAllLocalManager);//datados del local con los datos del manager 'all'

routerLocal.get(`${nameApi}/local/id=:id`, extendSession, validateSession, validateObjectIdStrict, controller.getlocal);

routerLocal.get(`${nameApi}/local&manager/id=:id`, extendSession, validateSession, validateObjectIdStrict, controller.getlocalAndManager);

routerLocal.get(`${nameApi}/local/findByName/name=:name`, extendSession, validateSession, controller.getLocalAndImgByName);

routerLocal.post(`${nameApi}/local`, extendSession, validateSessionAndUserSuper, uploadLocal.single('image') , controller.setlocal);

routerLocal.put(`${nameApi}/local/:id`, extendSession, validateSessionAndUserSuper, uploadLocal.single('image'), controller.putLocal);

routerLocal.put(`${nameApi}/local/image/id=:id`, extendSession, validateSessionAndUserSuper, uploadLocal.single('image'), controller.updateImgImage);

routerLocal.delete(`${nameApi}/local/:id`, extendSession, validateSessionAndUserSuper, controller.deleteLocal);




export { routerLocal };