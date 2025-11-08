const controller = {};
import scheduleLayer from './schedule.layer.js';
import Schedules from './schedule.model.js';

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