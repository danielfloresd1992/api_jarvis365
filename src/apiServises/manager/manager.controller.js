const controller = {};
import { ObjectId } from 'mongodb'
import fs from 'fs';
import path from 'path';
import colors from 'colors';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

import ManagerImg from './managerImg.model.js';
import Manager from './manager.model.js';

import Local from '../local/local.model.js';

import managerLayer from './manager.js';




// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────
controller.getManagetAllLocal = async (req, res) => {
    try {
        let managers = await managerLayer.managerActive();
        return res.json(managers);
    }
    catch (err) {
        console.log(colors.bgRed('Error en la consulta a get Manager All'));
        console.log(err);
        res.status(500).send(err);
    }
};// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────



controller.getByNameManager = async (req, res) => {
    try {
        const nameParam = req.params.name;
        const result = await managerLayer.getByNameLocal(nameParam);
        return res.json(result);
    }
    catch (err) {
        console.log(err);
        return res.status(500)
    }
}// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────




controller.managerLocalAndImgById = async (req, res) => {
    try {
        const id = req.params.id;
        const result = await managerLayer.managerLocalAndImgById(id);
        return res.json(result);
    }
    catch (err) {
        console.log(err);
        return res.status(500);
    }
}// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────




controller.getMannager = async (req, res) => {
    if (!req.params.id) return res.status(400).send('params "Id" is invalid or null');
    const id = req.params.id;
    let manager = await Manager.findById(id).exec();
    console.log(manager);
    return res.status(200).json(manager);




};

/*
// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────
controller.getManagetAllFranchise = async (req, res) => {
    try {
        let managers = await Manager.find().populate('local').populate('franchise');
        console.log(colors.bgCyan('Cierta aplicación a realizado una petición a la colección Manager'.black));
        return res.status(200).json(managers);
    }
    catch (err) {
        console.log(colors.bgRed('Error en la consulta a get Manager All Data'));
        res.status(500).send(err);
    }
};// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────


*/


/*
controller.getManagetAllFranchise_fill = async (req, res) => {
    try {
        const param = req.params.name;
        const query = { localName: param };
        const managers = await Manager.find(query).populate('local').populate('franchise');
        console.log(managers)
        if (managers.length < 1) return res.status(404).send('No encontrado o  no existe');
        return res.status(200).json(managers);
    }
    catch (err) {
        console.log(colors.bgRed('Error en la consulta a get Manager All Data'));
        res.status(500).send(err);
    }
}// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────
*/




controller.getManagerImg = async (req, res) => {
    try {
        let manager = await Manager.find();
        return res.status(200).json(manager);
    }
    catch (err) {
        console.log(err);
        res.status(500).send(err);
    }

}// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────



controller.setManager = async (req, res) => {
    try {
        let body = req.body;
        
        const establishmentId = req.query?.establishment;
   
        if (!establishmentId) return res.status(400).json({ error: 'Bad Request', status: 400, message: 'establishment is required' });
      
        if (!ObjectId.isValid(establishmentId)) return res.status(400).json({ error: 'Bad Request', status: 400, message: 'Invalid establishment ID' });    

        
        
        const manager = new Manager({
            name: body.name,
            numberManager: body.numberManager,
            burden: body.burden,
            status: body.status,
            characteristic: body.characteristic,
        });

        const result = await Local.findByIdAndUpdate({ _id: establishmentId }, { $push: { managers: manager._id } }) ;
        if (!result) return res.status(400).json({ error: 'Bad Request', status: 400, message: `No establishment found with the provided ID: ${establishmentId}` });
        const newManager = await manager.save();
        return res.status(200).json({ manager : newManager, establishment: result });        console.log(colors.bgCyan(`Manager ${body.name || 'gerente'} guardado en la colección manager`.black));
    }
    catch(error){
        console.log(error);
        return res.status(500).json({ error: 'Internal Server Error', status: 500, message: 'An error occurred while creating the manager' });  
    }
};




controller.putManager = async (req, res) => {
    if (!req.session.name) return res.status(401).send('Debe loguearse para realizar esta operación');
    if (!req.session.super || !req.session.admin) {
        console.log(colors.bgRed(`Petición rechazada a ${req.session.name} al editar manager`.black));
        return res.status(403).send('No cuentas con los permisos suficientes para esta operación');
    }
    try {
        if (!req.params.id) return res.status(400).send('params "Id" is invalid or null');
        const id = req.params.id;
        const body = req.body;

        delete body._id;
        delete body.local;
        delete body.otherLocals;



        const result = await Manager.findByIdAndUpdate(id , body);

       
        return res.status(200).json(body);
    }
    catch (err) {
        console.log(err);
        console.log(colors.bgRed('Error en la consulta a put Manager'));
        res.status(500).send(err);
    }
};// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────




controller.deleteManager = async (req, res) => {
    try {
        if (!req.params.id) return res.status(400).send('params "Id" is invalid or null');
        const id = req.params.id;
        //let manager = await Manager.findById(id).populate('managerimg').exec();

        const manager = await Manager.findOne({ _id: id });

        manager.otherLocals.forEach(async id => {
            try {
                const findLocal = await Local.find({ _id: id }).select('-img');
                const getId = findLocal[0].managers.filter(item => manager._id.toString() !== item.toString());
                let updateLocal = await Local.findByIdAndUpdate({ _id: id }, { $set: { managers: getId } });
            }
            catch (err) {
                console.log(err)
            }
        });

        Manager.deleteOne({ _id: manager.id })
            .then(async result => {
                if (result.deletedCount === 0) return res.status(400).send('El documento no existe');

                await Local.updateOne({ _id: manager.local }, { $pullAll: { managers: [manager._id] } });
                console.log(colors.bgCyan(`Manager eliminado de colección Manager`.black));
                return res.status(200).send('Manager eliminado con exito de la coleción Manager');
            })
            .catch(err => {
                console.log(err);
                return res.status(500).send('Error server internal');
            });
    }
    catch (err) {
        console.log(colors.bgRed('Error en la consulta a delete Manager'));
        res.status(500).send(err);
    }

};// ─── LEGACY CODE DOWNLOAD MORE 👇 ────────────────────────────────────────────────────────────────




function putManagerId(body, local, manager) {
    let newArrayOtherLocals;
    typeof body.otherLocals === 'string' ? newArrayOtherLocals = JSON.parse(body.otherLocals) : newArrayOtherLocals = body.otherLocals;

    newArrayOtherLocals.push(local._id);
    if (body.localToDelete) {
        body.localToDelete.forEach(async id => {
            try {
                const findLocal = await Local.find({ _id: id }).select('-img');
                const getId = findLocal[0].managers.filter(item => body._id.toString() !== item.toString());
                let updateLocal = await Local.findByIdAndUpdate({ _id: id }, { $set: { managers: getId } });
            }
            catch (err) {
                console.log(err)
            }
        });
    }
    newArrayOtherLocals.forEach(async id => {
        try {
            const findLocal = await Local.find({ _id: id }).select('-img');
            const getId = findLocal[0].managers.filter(item => item.toString() === body._id.toString());
            if (getId.length < 1) {
                let updateLocal = await Local.findByIdAndUpdate({ _id: id }, { $push: { managers: body._id } });
                console.log('durante el bucle');
            }
        }
        catch (err) {
            console.log(err)
        }
    });
};









export default controller;