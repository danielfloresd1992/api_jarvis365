import mongoose from 'mongoose';
import controller from './alert.controller.js';
import express from 'express';
import { uploadAlert } from '../../util/multer.js';
import { io } from '../../services/socket/io.js'
import { AlertModel, RecordsLiveModel } from './alert.model.js'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { extendSession, validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js'
import nameApi from '../../libs/name_api.js';


const routerAlert = express.Router();


routerAlert.post(`${nameApi}/alertNoveltie`, extendSession, validateSession,  uploadAlert.single('img') , controller.setAlert);


routerAlert.get(`${nameApi}/alertNoveltie/recordsLive`, validateSession, async (req, res) => {
    try {
        const dateParam = req.query.date;
        const shiftParam = req.query.shift;

        const query = {
            createdAt: dateParam ? dateParam : new Date(Date.now()).toLocaleDateString(),
        }
        if(shiftParam) query.shift = shiftParam;


        const existsRecordsLiveexists = await RecordsLiveModel.findOne(query).sort({$natural:-1});
        if(existsRecordsLiveexists) return res.status(200).json(existsRecordsLiveexists);
        else return res.status(404).json({ error: 'This resource does not exist yet' });
    } 
    catch(error){
        console.log(error);
        return res.status(500).json({ error: 'Error server internal' });
    }
});



routerAlert.post(`${nameApi}/alertNoveltie/recordsLive`, extendSession, validateSession, async (req, res) => {
    try {
        const dateParam = req.query.date;
        const shiftParam = req.query.shift;
        const goalDayParam = req.query.goalDay;
        const body = req.body;
        
        if(!dateParam) return res.status(400).json({ error: 'The URL must have a parameter called "date"' });
        if(!shiftParam) return res.status(400).json({ error: 'The URL must have a parameter called "shift"' });

        const existsRecordsLiveexists = await RecordsLiveModel.findOne({ createdAt: new Date(Date.now()).toLocaleDateString(), shift: shiftParam });
        if(Array.isArray(body) && Array.isArray(body).length < 1) return res.status(400).json({ error: 'the array is empty' });

        if(existsRecordsLiveexists){
            return res.status(409).json({ error: 'The URL must have a parameter called "shift"', data: existsRecordsLiveexists });
        }
        else{
            const recordsLiveModel = new RecordsLiveModel(
                {
                    shift: shiftParam,
                    goalDay: goalDayParam,
                    createdAt: new Date(Date.now()).toLocaleDateString(),
                    data: body
                }
            );
            try {
                const responseSaveCollection = await recordsLiveModel.save();
                return res.status(200).json(responseSaveCollection);
            } 
            catch (error) {
                console.log(error);
                return res.status(400).json({ error });
            }
        }
    } 
    catch(error){
        console.log(error);
        return res.status(500).json({ error: error });
    }
});



routerAlert.put(`${nameApi}/alertNoveltie/recordsLive`, extendSession, validateSession,async (req, res) => {
    try {
        const dateParam = req.query.date;
        const shiftParam = req.query.shift;
        const ID_STABLISHMENT = req.query.id;
        const alertParam = req.query.alert;
        const importantParam = req.query.important;
        const lineParam = req.query.line;
        const failedParam = req.query.failed;
        const monitoringParam = req.query.monitoring;
        const noSetSchedule = req.query.noSetSchedule;
        if(!ID_STABLISHMENT || ID_STABLISHMENT  === 'undefined') return res.status(400).json({ error: 'The URL must have a parameter called "id"' });
        if(!mongoose.Types.ObjectId.isValid(ID_STABLISHMENT)) return res.status(400).json({ error: 'id invalid' });

        const query = {};
 
        query.createdAt = dateParam ? dateParam : new Date(Date.now()).toLocaleDateString()
        if(shiftParam) query.shift = shiftParam;


        const result = await RecordsLiveModel.findOne(query);

        if(!result) return res.status(404).json({ error: 'report not found' });

        const indexOb = result.data.findIndex(establishment => establishment.establishment._id === ID_STABLISHMENT);
        if(indexOb < 0) return res.status(404).json({ error: 'establishment not found' });

        const CloneCollection = [ ...result.data ];
        const cloneObject = { ...result.data[indexOb] };
        cloneObject.alert = alertParam ? Number(alertParam) : cloneObject.alert;
        cloneObject.important = importantParam ? Number(importantParam) : cloneObject.important;
        cloneObject.line = lineParam ? lineParam : cloneObject.line;
        cloneObject.failed = failedParam ? (/true/).test(failedParam) : cloneObject.failed;
        cloneObject.monitoring = monitoringParam ? (/true/).test(monitoringParam) : cloneObject.monitoring;
        cloneObject.noSetSchedule = noSetSchedule ? noSetSchedule : null;
        cloneObject.editedBy = {
            name: req.session.name,
            sessionId: req.session.idSession
        }
        CloneCollection[ indexOb ] = cloneObject;
        const resUpdate = await RecordsLiveModel.updateOne({ _id: result._id }, { data: CloneCollection });
        //console.log(req.session)
        io.emit('update-report-alert-live', { ...cloneObject, editedBy: cloneObject.editedBy, document:{ date: result.createdAt, shift: result.shift } });
        return res.json(cloneObject);
        
    } 
    catch(error){
        console.log(error);
    }
});


export { routerAlert } ;