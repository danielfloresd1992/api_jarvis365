import express, { Request, Response, NextFunction, Express, Router } from 'express';
import { spawn } from 'child_process';
import ControllerNovelty from './novelties.controller';
import { uploadNoveltie } from '../../util/multer';
import NoveltieModel from './noveltie.model';
import fileNoveltieModel from './fileNoveltie.model';
import { zipMiddleware } from '../../middleware/zip';
import mongoose from 'mongoose'; // ./time.model.js
import multer from 'multer';
import { ObjectId } from 'mongodb';
import { join } from 'path';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser';
import nameApi from '../../libs/name_api';
import AbbreviateNumber from '../../script/abbreviate_number'

import { FileImgToadPos } from './fileNoveltie.model';
import { io } from '../../services/socket/io';
import SocketAdapter from '../../adapters/SocketAdapter';


import * as url from 'url';
const __dirname: string = url.fileURLToPath(new URL('.', import.meta.url));


const routerNoveltie = express.Router();

const socketAdapter = new SocketAdapter(io);  // inyeción de dependencias
const controller =  new ControllerNovelty(socketAdapter);




routerNoveltie.get(`${nameApi}/noveltiesAll`, extendSession, validateSession, controller.getNovelties);
routerNoveltie.get(`${nameApi}/noveltie/since=/:since/until=:until`, extendSession, validateSession, zipMiddleware, controller.getNoveltie);



routerNoveltie.get(`${nameApi}/noveltie/coundDocuments`, extendSession, validateSession, async (req: Request, res: Response): Promise<void>  => {
    try {
        const { id } = req.query as { id?: string };
        if(!id) res.status(400).json({ error: 'Bad request', status: 400, message: 'ObjectId undefined' });
        if (typeof id === 'string' && !ObjectId.isValid(id)) res.status(400).json({ error: 'Bad request', status: 400, message: 'ObjectId invalid' });

        const result = await NoveltieModel.countDocuments({ 'local.idLocal': new ObjectId(id) });

        res.json({ totalDocumentAbbreviate: AbbreviateNumber(result), total: result });
    }
    catch (error:any) {
        console.log(error);
        res.status(500).json({ error: 'Error server internal', status: 500, message: error.message });
    }
});





routerNoveltie.get(`${nameApi}/noveltie/date=:date/shift=:shift/establishments=:establishments/extract`, extendSession, validateSession, async (req: Request, res: Response): Promise<void> => {
    try {
        const since = `${req.params.date} 00:08:00`;
        const until = `${req.params.date} 23:59:59`;
        const shift = req.params.shift
        const establishments = req.params.establishments;

        const { populate } = req.query;
        const properties: any = req.query.properties;
        
        

        const query: any = {
            'local.name': establishments,
            date: {
                $gte: new Date(since).toISOString(),
                $lt: new Date(until).toISOString()
            }
        };

        if(shift && shift !== 'all') query.shift = shift;

        let resultSeleted: any;
        let seleted = 'userPublic rulesForBonus userPublic videoUrl imageUrl collection_status fileNoveltie sharedByAmazonActive menu givenToTheGroup isValidate local description _id sharedByUser imageToShare validationResult'.split(' ');


        if(properties){
            resultSeleted = seleted.filter(item => !properties.includes(item));
        }
        else{
            resultSeleted = seleted;
        }

        const result = await NoveltieModel
        .find(query).select(resultSeleted.join(' -'))
        .populate(populate ?? '');


        res.json(result);
    }
    catch (error:any) {
        console.log(error);
        res.status(500).json({ error: 'Error server internal', status: 500, message: error.message });
    }
});




routerNoveltie.get(`${nameApi}/noveltie/local=:local/since=:since/until=:until/page=:page`, validateSession, controller.getNoveltiesFilter);

routerNoveltie.get(`${nameApi}/novelty`, validateSession, controller.getNovelty);

//routerNoveltie.get(`${nameApi}/noveltiesFill-user=:user/&since=:since/&until=:until`, extendSession, validateSession, controller.getfillNoveltie);

routerNoveltie.get(`${nameApi}/novelties/id=:id`, validateSession, controller.getNoveltiesById);

routerNoveltie.get(`${nameApi}/novelties/paginate=:page/items=:items`, validateSession, controller.getNoveltiesPaginate);

routerNoveltie.get(`${nameApi}/novelties/img/id=:id`, validateSession, controller.getNoveltieImgById);

routerNoveltie.get(`${nameApi}/novelties/menu/id=:id`, validateSession, controller.findAndSelectMenu);



////////////////////////////////////////////////////////////////////MULTIMEDIA//////////////////////////////////////////////////////////////////////////////

routerNoveltie.get(`${nameApi}/novelty/img=:img`, controller.findFileImg);

routerNoveltie.get(`${nameApi}/novelty/video=:video`, extendSession, validateSession, controller.findFileImg);


routerNoveltie.get(`${nameApi}/noveltie/file=:id`, extendSession, validateSession, async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) res.status(400).json({ error: 'the id is not valid' });

        const fileRes = await fileNoveltieModel.findOne({ _id: id });
        if (!fileRes) res.status(404).json({ error: 'File not found' });

        res.status(200).json(fileRes);
    }
    catch (error) {
        console.log(error);
        res.status(500).json({error});
    }
});


routerNoveltie.post(`${nameApi}/novelties`, extendSession, validateSession, controller.createNovelties);


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////







routerNoveltie.post(`${nameApi}/novelty/video`, extendSession, validateSession, uploadNoveltie.fields([{ name: 'video', maxCount: 1 }, { name: 'img', maxCount: 1 }, { name: 'imageUrl', maxCount: 4 }]), controller.saveNovelty);


routerNoveltie.put(`${nameApi}/novelties/id=:id`, extendSession, validateSession, controller.updateNovelties);



routerNoveltie.post(`${nameApi}/noventy/imageToasdPos`, extendSession, validateSession, uploadNoveltie.fields([{ name: 'img', maxCount: 1 }]), async (req: any, res: Response): Promise<void> => {
    try {
        const { id } = req.query;
        if (!mongoose.Types.ObjectId.isValid(id)) res.status(400).json({ error: 'the id is not valid' });
        if(!req.files) res.status(400).json({ error: 'Bad request', status: 400, message: 'img is undefined' }); 
   
        const file = req.files.img[0];

        const fileImgToadPos = new FileImgToadPos({
            idEstablishment: id,
            submittedByUser: req.session.name,
            path: file.path,
            url: process.env.NODE_ENV === 'development' ? `https://amazona365.ddns.net:3006${nameApi}/novelty/img=${file.filename}` : `https://amazona365.ddns.net${nameApi}/novelty/img=${file.filename}`,
        });
        const fileSaved = await fileImgToadPos.save();

        if(typeof io !== 'undefined') io.emit('fileLoader', fileSaved);

        res.status(200).json(fileSaved);
    } 
    catch(error:any){
        if (error instanceof multer.MulterError){
            console.log('Multer error:', error); 
            res.status(400).json({ error: 'Multer error', status: 400, message: error.message }); 
        } 
        else if(error.name === 'ValidationError'){
            res.status(400).json({ error: 'Bad request', status: 400, message: error.message }); 
        }
        else {
            console.log('General error:', error);
            res.status(500).json({ error: 'Error server internal', status: 500, message: error });
        }
    }
});



routerNoveltie.get(`${nameApi}/noventy/imageToasdPos`, validateSession, async (req: Request, res: Response): Promise<void> => {
    try{
        const idEstablishment  = req.query.id;
        if (typeof idEstablishment === 'string' && !mongoose.Types.ObjectId.isValid(idEstablishment)) res.status(400).json({ error: 'the id is not valid' });

        const result = await FileImgToadPos.find({ idEstablishment: idEstablishment }).sort({ $natural: -1 });

        res.json(result);
    }   
    catch(error){
        console.log(error);
        res.status(500).json({ error: 'Error server internal', status: 500, message: error });
    }
});




routerNoveltie.delete(`${nameApi}/noventy/imageToasdPos`,  validateSession, async (req: Request, res: Response): Promise<void> => {
    try{
        const { id } = req.query;
        if (typeof id === 'string' && !mongoose.Types.ObjectId.isValid(id)) res.status(400).json({ error: 'the id is not valid' });

        const result: any = await FileImgToadPos.findByIdAndDelete(id);
        if(!result) res.status(404).json({ error: 'Document not fount', status: 404 });



        spawn('node', [join(__dirname, '../../subprocesses/delete_file.js'), result.path]);

        res.status(200).json({ message: 'Document and file deleted', _id: result._id });
    }   
    catch(error){
        console.log(error);
        res.status(500).json({ error: 'Error server internal', status: 500, message: error });
    }
});



routerNoveltie.put(`${nameApi}/novelty/comment`, controller.setComment);



export { routerNoveltie };