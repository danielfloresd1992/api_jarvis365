const controller = {};
import { ObjectId } from 'mongodb'
import fs from 'fs';
import path from 'path';
import colors from 'colors';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

import ManagerImg from './managerImg.model.js';
import Manager from './manager.model.js';

import Local from '../local/Local.model.js';

import managerLayer from './manager.js';


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
};



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
}


controller.managerLocalAndImgById = async (req, res) => {
    try {
        const id = req.params.id;
        const result = await managerLayer.managerLocalAndImgById(id);
        return res.json(result);
    }
    catch (err) {

    }
}



controller.getMannager = async (req, res) => {
    if (!req.params.id) return res.status(400).send('params "Id" is invalid or null');
    const id = req.params.id;
    let manager = await Manager.findById(id).exec();
    console.log(manager);
    return res.status(200).json(manager);
};


controller.getManagetAllFranchise = async (req, res) => {
    try {
        let managers = await Manager.find().populate('local').populate('franchise').populate('managerimg');
        console.log(colors.bgCyan('Cierta aplicación a realizado una petición a la colección Manager'.black));
        return res.status(200).json(managers);
    }
    catch (err) {
        console.log(colors.bgRed('Error en la consulta a get Manager All Data'));
        res.status(500).send(err);
    }
};


controller.getManagetAllFranchise_fill = async (req, res) => {
    try {
        const param = req.params.name;
        const query = { localName: param };
        const managers = await Manager.find(query).populate('local').populate('franchise').populate('managerimg');
        console.log(managers)
        if (managers.length < 1) return res.status(404).send('No encontrado o  no existe');
        return res.status(200).json(managers);
    }
    catch (err) {
        console.log(colors.bgRed('Error en la consulta a get Manager All Data'));
        res.status(500).send(err);
    }
}


controller.getManagerImg = async (req, res) => {
    try {
        let manager = await Manager.find().populate('managerimg');
        return res.status(200).json(manager);
    }
    catch (err) {
        console.log(err);
        res.status(500).send(err);
    }
}


controller.setManager = async (req, res) => {
    try {

        let body = req.body;
        if (body.otherLocals === '') body.otherLocals = [];
        if (!Object.entries(req.body).length) {
            console.log('error, line 118')
            return res.status(400).send('Campos nulos');
        }

        // ─── Validación de imágenes desactivada temporalmente ───────────────────
        // El guardado de imágenes está en pausa; se acepta el registro sin archivos.
        // if (req.files?.img?.length !== 3) return res.status(400).json({ error: 'Bad request', status: 400, message: 'The file limit should be 3' });

        let local = await Local.findOne({ _id: body.localName });

        if (!local) return res.status(400).send(`${body.name} no existe! error al crear la relación`);



        /*
        const arrImg = req.files.img.map(img => (
            const url: string = process.env.NODE_ENV === 'development' ? `https://amazona365.ddns.net:3006${nameApi}/novelty/img=${file.img[0].filename}` : `https://amazona365.ddns.net${nameApi}/novelty/img=${file.img[0].filename}`
        ))
    
        let img = new ManagerImg({
            local: local.name,
            img: [{
                data: fs.readFileSync(path.join(__dirname, `../../../uploads/manager_local/${req.files.img[0].filename}`)),
                contentType: req.files.img[0].mimetype,
                name: req.files.img[0].filename
            },
            {
                data: fs.readFileSync(path.join(__dirname, `../../../uploads/manager_local/${req.files.img[1].filename}`)),
                contentType: req.files.img[1].mimetype,
                name: req.files.img[1].filename
            },
            {
                data: fs.readFileSync(path.join(__dirname, `../../../uploads/manager_local/${req.files.img[2].filename}`)),
                contentType: req.files.img[2].mimetype,
                name: req.files.img[2].filename
            }]
        });


        
*/




        let manager = new Manager({
            local: local._id,
            franchise: local.idLocal,
            name: body.name,
            numberManager: body.numberManager,
            burden: body.burden,
            status: body.status,
            characteristic: body.characteristic,
            localName: local.name,
            otherLocals: JSON.parse(body.otherLocals)
            //    managerimg: ObjectId(newImg._id),
            ///image: 
        });
        let newManager = await manager.save();

        putManagerId(manager, local);

        console.log(colors.bgCyan(`Manager ${body.name || 'gerente'} guardado en la colección manager`.black));
        return res.status(200).json(newManager);

    }
    catch (err) {

        console.log(err);
        return res.status(500).send('Error server internal');
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

        let local = await Local.findOne({ _id: body.local });
        const result = await managerLayer.putManager(id, body);
        putManagerId(body, local);
        return res.status(200).json(body);
    }
    catch (err) {
        console.log(err);
        console.log(colors.bgRed('Error en la consulta a put Manager'));
        res.status(500).send(err);
    }
};


controller.deleteManager = async (req, res) => {
    try {
        if (!req.params.id) return res.status(400).send('params "Id" is invalid or null');
        const id = req.params.id;
        //let manager = await Manager.findById(id).populate('managerimg').exec();

        const manager = await Manager.findOne({ _id: id }).populate('managerimg')

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

};


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
}



export default controller;