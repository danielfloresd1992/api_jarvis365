const controller = {};
import colors from 'colors';
import scheduleLayer from './schedule.layer.js';
import Schedules from './schedule.model.js';
import { validateRanges, getActiveMonitoringNow, pickSchedule } from './schedule.logic.js';
import { IsDaylightSavingTimeBoolean } from '../time/time.model.js';

controller.getDateAll = async (req, res) => {
    try {
        if(!req.session.name) return res.status(401).json({ error: 'Debe loguearse para realizar esta operación' });
        if(!req.session.super) return res.status(403).json({ error : 'No cuentas con los permisos suficientes para esta operación' });
        const result = await Schedules.find();
        return res.status(200).json(result);
    } 
    catch(error){
        console.log(error);
    }
};


controller.getDateByIdLocal = async ( req, res ) => {
    try {
        const idLocal = req.params.idLocal;
        const result = await scheduleLayer.getDateByIdLocal(idLocal);

        if(result.length === 0) return res.status(404).send('Document not found');
        return res.json(result);

    } 
    catch (err) {
        console.log(err);
        res.status(500).send('Error server internal');
    }
};



// Horario de HOY del establecimiento (rangos del día actual del servidor),
// ya resuelto normal/invierno. 404 si el local no tiene horario configurado.
controller.getTodayByIdLocal = async ( req, res ) => {
    try {
        const idLocal = req.params.idLocal;
        const docs = await scheduleLayer.getDateByIdLocal(idLocal);
        if(docs.length === 0) return res.status(404).send('Document not found');

        const timeDoc = await IsDaylightSavingTimeBoolean.findOne();
        const isWinter = Boolean(timeDoc?.usWinterActive);

        const { ranges, usingWinter } = pickSchedule(docs[0], isWinter);
        const today = new Date().getDay();   // día local del servidor (0=Dom … 6=Sáb)
        const todayRanges = ranges.filter(r => Number(r.dayMonitoring) === today);

        return res.json({ day: today, usingWinter, ranges: todayRanges });
    }
    catch(err){
        console.log(err);
        res.status(500).send('Error server internal');
    }
};



// ¿Este establecimiento se monitorea AHORA y de qué tipo?
// Toma la hora local del servidor y el interruptor global de invierno USA.
controller.getActiveByIdLocal = async ( req, res ) => {
    try {
        const idLocal = req.params.idLocal;
        const docs = await scheduleLayer.getDateByIdLocal(idLocal);
        if(docs.length === 0) return res.status(404).send('Document not found');

        const timeDoc = await IsDaylightSavingTimeBoolean.findOne();
        const isWinter = Boolean(timeDoc?.usWinterActive);

        const status = getActiveMonitoringNow(docs[0], isWinter);
        return res.json(status);   // { active, types, ranges, usingWinter }
    }
    catch(err){
        console.log(err);
        res.status(500).send('Error server internal');
    }
};



controller.setDateLocal = async ( req, res ) => {
    try {
        if(!req.session.name) return res.status(401).send('Debe loguearse para realizar esta operación');
        if(!req.session.super){
            console.log(colors.bgRed(`Petición rechazada a ${req.session.name} al actualizar novedad`.black));
            return res.status(403).send('No cuentas con los permisos suficientes para esta operación');
        }
        if(isEmpty(req.body)){
            return res.status(400).send('Bad request. Object is empty');
        }

        const reult = await scheduleLayer.setDateLocal(req.body);
        return res.json(reult);
    } 
    catch(err){
        console.log(err);
        res.status(500).send('Error server internal');
    }
};



controller.putDate = async ( req, res ) => {
    try {
        if(!req.session.name) return res.status(401).send('Debe loguearse para realizar esta operación');
        if(!req.session.super){
            console.log(colors.bgRed(`Petición rechazada a ${req.session.name} al actualizar novedad`.black));
            return res.status(403).send('No cuentas con los permisos suficientes para esta operación');
        }
        if(isEmpty(req.body)){
            return res.status(400).send('Bad request. Object is empty');
        }

        // Valida el horario normal y, si viene, el alternativo de invierno.
        if(req.body.dayMonitoring !== undefined){
            const check = validateRanges(req.body.dayMonitoring);
            if(!check.ok) return res.status(400).json({ error: check.error });
        }
        if(req.body.dayMonitoringWinter !== undefined){
            const check = validateRanges(req.body.dayMonitoringWinter);
            if(!check.ok) return res.status(400).json({ error: check.error });
        }

        const idLocal = req.params.idLocal;
        const result = await scheduleLayer.putDateByIdLocal(idLocal, req.body);

        if(result.length === 0) return res.status(404).send('Document not found');
        console.log(result);
        return res.json(result);
    } 
    catch(err){
        console.log(err);
        res.status(500).send('Error server internal');
    }
};



function isEmpty(obj) {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        return false;
      }
    }
    return true;
}


export default controller;