import express from 'express';
import { Worker } from 'worker_threads';
import Cache_Jarvis from '../../services/cache/cache.js';
import { io } from '../../services/socket/io.js';
import nameApi from '../../libs/name_api.js';

const cacheFailedConcnection = new Cache_Jarvis();
const routesFailed = express.Router();



routesFailed.get(`${nameApi}/failed/all`, (req, res) => {

    const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: cacheFailedConcnection.cache });

    worker.on('message', (result) => {
        return res.status(200).json(result);
    });

    worker.on('error', (error) => {
        return res.status(500).json({ error: error });
    });

    worker.on('exit', (code) => {
        if (code !== 0) {
            return res.status(500).send(`Worker stopped with exit code ${code}`);
        }
    });
});


routesFailed.post(`${nameApi}/failed`, (req, res) => {
    const body = req.body;

    const dataLocal = {
        nameItem: `${body.idLocal}-${body.localName}`,
        ...req.body
    };
    io.emit('failed-connection', dataLocal);

    console.log(cacheFailedConcnection.getItem(`${body.idLocal}-${body.localName}`));
    if(!cacheFailedConcnection.getItem(`${body.idLocal}-${body.localName}`)){
        cacheFailedConcnection.setItem(dataLocal.nameItem, body);
        return res.status(200).json({ text: 'ok' });
    }
    else{
        console.log('el local ya existe');
        return res.status(409);
    }
    
});



routesFailed.delete(`${nameApi}/failed`, (req, res) => {
    const { idLocal } = req.query;
    const { localName } = req.query;
    const body = req.body;
    console.log(idLocal);
    console.log(localName);

    if(!idLocal) return res.status(400).json({ error: 'Param idLocal is undefined' });
    if(!localName) return res.status(400).json({ error: 'Param localName is undefined' });

    const item = cacheFailedConcnection.getItem(`${idLocal}-${localName}`)
    console.log(item);
    if(!item) return res.status(404);
    
    cacheFailedConcnection.deleteItem(`${idLocal}-${localName}`);
    io.emit('failed-connection-deleteItem', item);
    return res.status(200).json({ text: 'ok' });
});



export { routesFailed };