const controller = {};
import os from 'os';
import fs from 'fs';
import path from 'path';
import * as url from 'url';
import Local, { TimeServicesModel } from './local.model.js';
import { localValidateComplete, timeServicesValidate } from './local.schema.js'
import { ValidationError } from 'yup';
import localLayer from './local.layer.js';
import Franchise from '../franchise/franchiseImg.model.js';
import colors from 'colors';
import mongoose from 'mongoose';
import convertBoolean from '../../script/convertBoolean.js';
import { notify, diffChanges, actorFromSession } from '../notification/notification.service.js';


import { config } from 'dotenv';
config();

// Campos del establecimiento que se vigilan para la notificación, con su
// etiqueta legible. Lo que no esté acá cambia sin generar aviso: la campana es
// para lo que otro necesita enterarse, no para cada propiedad interna.
const ESTABLISHMENT_FIELDS = {
    name: 'Nombre',
    location: 'Ubicación',
    isActive: 'Estado',
    typeMonitoring: 'Tipo de monitoreo',
    lang: 'Idioma',
};

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const documentsPath = path.join(os.homedir(), 'Documents');
const dirPath = path.join(documentsPath, 'imagen_clientApp');
const httpPort = process.env.NODE_ENV === 'development' ? process.env.DEV_PORT : process.env.PROD_PORT;

let local = null;
pathLocal();



controller.getAllLocal = async (req, res) => {
    const locals = await Local.find();
    return res.json(locals).status(200);
};



controller.getAllLocalLigth = async (req, res) => {
    try {
        const allParams = convertBoolean(req.query.all);
        const populateQuery = req.query.populate;
        const query = {};
        if (!allParams) query.isActive = true;
        const local = await Local.find(query).select('-managers -img -touchs').populate(populateQuery);
        return res.json(local);
    }
    catch (error) {
        console.log(error)
        return res.status(500).json({ error: error })
    }
};



controller.getCortLocal = async (req, res) => {
    try {
        const result = await localLayer.getCortLocal();
        return res.json(result);
    }
    catch (err) {
        console.log(err);
        return res.status(500);
    }
};



controller.getlocal = async (req, res) => {
    try {

        const idParams = req.params.id;

        const { populate } = req.query;
        const local = await Local.findById(idParams).populate(populate);

        if (!local) return res.send('not found').status(404);
        return res.json(local).status(200);

    }
    catch (err) {
        console.log(err);
        return res.status(500).send('Error server internal');
    }
};



controller.getlocalAndManager = async (req, res) => {
    try {
        const id = req.params.id;
        const result = await localLayer.getLocalAndManager(id);
        return res.json(result);
    }
    catch (err) {
        console.log(colors.bgRed(`Error al obtener datos relacionados de la colección Local`.black));
        console.log(err);
    }
};



controller.local_cache = (req, res) => {
    const param = req.params.boolean;
    if (Boolean(param)) {
        pathLocal();
    }
    res.status(200).json(local);
};



controller.getImage = async (req, res) => {
    const img = req.params.image;
    const pathImg = path.join(dirPath, img);

    res.sendFile(pathImg, err => {
        if (err) {
            console.log(err);
            res.status(404).json({ error: 'File not found' });
        }
    });
};



controller.getAllLocalManager = async (req, res) => {
    try {
        let locals = await Local.find().populate('managers').exec();
        return res.json(locals);
    }
    catch (err) {
        console.log(err);
        return res.status(500).send('Error server internal');
    }
};



controller.getLocalAndImgByName = async (req, res) => {
    try {
        const name = req.params.name;
        const result = await localLayer.getLocalAndImgByName(name);
        return res.json(result);
    }
    catch (err) {
        console.log(err);
        return res.status(500);
    }
};



controller.setlocal = async (req, res) => {

    try {
        const body = req.body;
        const establishment = body.establishment;
        const TimeServices = body.timeServices;
        
        const validateEstablishment = await localValidateComplete.validate(establishment, { abortEarly: false });
        const isPerimeter = validateEstablishment?.typeMonitoring === 'perimeter';

        if (isPerimeter) {
            delete validateEstablishment.touchs;
            delete validateEstablishment.timeServices;
        }
        else {
            const validatedTimeServices = await timeServicesValidate.validate(TimeServices, { abortEarly: false });
            const configTimeServices = new TimeServicesModel(validatedTimeServices);
            await configTimeServices.save();
            validateEstablishment.timeServices = configTimeServices._id;
        }
        const newLocal = new Local({ ...validateEstablishment });
        const result = await newLocal.save();

        notify({
            type: 'establishment.created',
            actor: actorFromSession(req),
            resource: {
                kind: 'establishment',
                id: result._id,
                name: result.name || '',
                path: '/clients&manasgement',
            },
        });

        return res.status(200).json(result);
    }
    catch (error) {
        console.log(error);
        if (error instanceof ValidationError) {
            return res.status(400).json({
                source: 'yup',
                message: error.message,
                status: 400,
                errors: error.errors,
                path: error.path
            });
        }

        if (error instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                source: 'mongoose',
                status: 400,
                message: error.message,
                errors: Object.keys(error.errors)
            });
        }

        if (error instanceof mongoose.Error) {
            return res.status(400).json({ source: 'mongoose', message: error.message, status: 400 });
        }

        if (error.code === 11000) {
            return res.status(409).json({ source: 'mongodb', message: 'Registro duplicado', fields: error.keyValue, status: 409 });
        }

        return res.status(500).json({ error: error.message, status: 500 });
    }
};





controller.updateImgImage = async (req, res) => {
    try {
        if (req.fileValidationError) return res.status(400).json({ error: req.fileValidationError });

        const id = req.params.id;
        //  const clientUpdate = await User.findOneAndUpdate({ image: })
    }
    catch (error) {

    }
};





controller.putLocal = async (req, res) => {
    try {
       
        const establishment = req.body?.establishment;
        const timeServices = req.body?.timeServices;

        const idParams = req.params.id;
        const populateQuery = req.query.populate;

        if (idParams === 'undefined' || !idParams) return res.status(400).json({ error: 'The id parameter associated with a client must be strictly added' });
        if (!mongoose.Types.ObjectId.isValid(idParams)) return res.status(400).json({ error: `The ObjectId is not valid. id: ${idParams}` });

        const local = await Local.findOne({ _id: idParams });
        if (!local) return res.status(404).json({ error: `There is no record associated with the id: ${idParams}` });

        const validatedEstablishment = establishment;
        const isPerimeter = validatedEstablishment?.typeMonitoring === 'perimeter';

        const update = { $set: validatedEstablishment };
   
        if (isPerimeter) {
            delete validatedEstablishment.touchs;
            delete validatedEstablishment.timeServices;
            update.$unset = { touchs: '', timeServices: '' };

            if (local.timeServices) {
                await TimeServicesModel.findByIdAndDelete(local.timeServices);
            }
        }
        else {
            const validatedTimeServices = await timeServicesValidate.validate(timeServices, { abortEarly: false });
            console.log('validatedTimeServices', validatedTimeServices);

            if (local.timeServices) {
                const resultTimeServices = await TimeServicesModel.findByIdAndUpdate(local.timeServices, validatedTimeServices);
            }
            else {
                const configTimeServices = new TimeServicesModel(validatedTimeServices);
                await configTimeServices.save();
                validatedEstablishment.timeServices = configTimeServices._id;
            }
        }

        const result = await Local.findByIdAndUpdate(idParams, update, { new: true }).populate(populateQuery);

        if (!result) return res.status(404).json({ message: 'Establishment no exist', error: 'Document not fount', status: 404 });

        // ── Notificación ───────────────────────────────────────────────
        // `local` es el documento ANTES del update, leído más arriba: sirve de
        // referencia para el diff sin una segunda consulta.
        //
        // Activar y desactivar salen del "actualizado" genérico porque es el
        // cambio que más se consulta y merece su propio aviso.
        const cambios = diffChanges(local.toObject(), validatedEstablishment, ESTABLISHMENT_FIELDS);
        const cambioEstado = cambios.find(c => c.field === 'isActive');

        const tipo = cambioEstado
            ? (cambioEstado.to ? 'establishment.activated' : 'establishment.deactivated')
            : 'establishment.updated';

        // Sin cambios reales no se notifica: guardar sin tocar nada no es un
        // hecho que nadie necesite saber.
        if (cambios.length > 0) {
            notify({
                type: tipo,
                actor: actorFromSession(req),
                resource: {
                    kind: 'establishment',
                    id: result._id,
                    name: result.name || local.name || '',
                    path: '/clients&manasgement',
                },
                changes: cambios,
            });
        }

        return res.status(200).json({ result: result });
        
    }
    catch (error) {
        console.log(error);
        if (error instanceof ValidationError) {
            return res.status(400).json({
                source: 'yup',
                message: error.message,
                status: 400,
                errors: error.errors,
                path: error.path
            });
        }

        if (error instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                source: 'mongoose',
                status: 400,
                message: error.message,
                errors: Object.keys(error.errors)
            });
        }

        if (error instanceof mongoose.Error) {
            return res.status(400).json({ source: 'mongoose', message: error.message, status: 400 });
        }

        if (error.code === 11000) {
            return res.status(409).json({ source: 'mongodb', message: 'Registro duplicado', fields: error.keyValue, status: 409 });
        }

        return res.status(500).json({ error: error.message, status: 500 });
    }
};





controller.deleteLocal = async (req, res) => {
    if (!req.params.id) return res.status(400).send('params "Id" is invalid or null');
    const id = req.params.id;
    const local = await Local.findById(id).exec();
    if (!local) return res.status(400).send('local in not found');

    Local.deleteOne({ _id: local._id })
        .then(element => {
            fs.unlinkSync(path.join(__dirname, `../../../uploads/${local.img.name}`))

            // El nombre se copia en la notificación: el documento ya no existe
            // y sin la copia el histórico quedaría en blanco.
            notify({
                type: 'establishment.deleted',
                actor: actorFromSession(req),
                resource: {
                    kind: 'establishment',
                    id: local._id,
                    name: local.name || '',
                    path: '/clients&manasgement',
                },
            });

            return res.status(200).send('local eliminado con exito de la collección Local');
        })
        .catch(err => {
            console.log(err);
            return res.status(500).send('Error server internal');
        });
};



async function pathLocal() {
    const findLocal = await Local.find({ status: 'activo' }).populate('managers');
    const result = findLocal.filter(local => local.typeMonitoring !== 'perimetral');
    local = result;
    result.forEach(name => {
        if (name.typeMonitoring === 'perimetral') {

        }
    });
};



export { controller };