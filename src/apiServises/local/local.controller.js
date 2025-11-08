const controller = {};
import os from 'os';
import fs  from 'fs';
import path from 'path';
import * as url from 'url';
import Local from './local.model.js';
import { localValidateComplete } from '../../libs/localValidate.js'
import localLayer from './local.layer.js';
import Franchise from '../franchise/franchiseImg.model.js';
import colors from 'colors';
import mongoose from 'mongoose';
import convertBoolean from '../../script/convertBoolean.js';


import { config } from 'dotenv';
config();

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
        if(!allParams) query.status = 'activo';
        const local = await Local.find(query).select('-managers -img -touchs').populate(populateQuery);
        return res.json(local);
    } 
    catch(error){
        console.log(error)
        return res.status(500).json({ error: error })
    }
};



controller.getCortLocal = async (req, res) => {
    try{
        const result = await localLayer.getCortLocal();
        return res.json(result);
    }
    catch(err){
        console.log(err);
        return res.status(500);
    }
};



controller.getlocal = async (req, res) => {
    try {
      
        const idParams = req.params.id;
       
        const { populate } = req.query;
        const local = await Local.findById(idParams).populate(populate);
        
        if(!local) return res.send('not found').status(404);
        return res.json(local).status(200);

    } 
    catch(err){
        console.log(err);
        return res.status(500).send('Error server internal');
    }
};



controller.getlocalAndManager = async (req, res) => {
    try{
        const id = req.params.id;
        const result = await localLayer.getLocalAndManager(id);
        return res.json(result);
    }
    catch(err){
        console.log(colors.bgRed(`Error al obtener datos relacionados de la colección Local`.black));
        console.log(err);
    }
};



controller.local_cache = (req, res) => {
    const param = req.params.boolean;
    if(Boolean(param)){
        pathLocal();
    }
    res.status(200).json(local);
};



controller.getImage = async (req, res) => {
    const img = req.params.image;
    const pathImg = path.join(dirPath, img);
    
    res.sendFile(pathImg, err => {
        if(err){
            console.log(err);
            res.status(404).json({ error: 'File not found' });
        }
    });
};



controller.getAllLocalManager = async (req, res) => {
    try{
        let locals = await Local.find().populate('managers').exec();
        return res.json(locals);
    }
    catch(err){
        console.log(err);
        return res.status(500).send('Error server internal');
    }
};



controller.getLocalAndImgByName = async (req, res) => {
    try{
        const name = req.params.name;
        const result = await localLayer.getLocalAndImgByName(name);
        return res.json(result);
    }   
    catch( err ){
        console.log(err);
        return res.status(500);
    }
};



controller.setlocal = async (req, res) => {
    try {
       
        const body = req.body;
        const dominiun = req.ip.split(':')[req.ip.split(':').length-1];
     
      //  const route_image = req.file ? `https://${dominiun}:${httpPort}/local/image=${ req.file.filename }` :
        
        const validate = await localValidateComplete.validate(body);
       
        try{
            const newLocal = new Local({ ...validate, image: `https://${dominiun}:${httpPort}/local/image=${ 'default.jpg' }` });
            const result = await newLocal.save();
            return res.status(200).json(result);
        }
        catch(err){
            console.log(err);
            return res.status(500).send('Error server internal');
        }
        
    
     
    } 
    catch(error) {
        console.log(error);
        return res.status(400).json({ error: error });
    }
};


controller.updateImgImage = async (req, res) =>{
    try {
        if(req.fileValidationError) return res.status(400).json({ error: req.fileValidationError });

        const id = req.params.id;
      //  const clientUpdate = await User.findOneAndUpdate({ image: })
    } 
    catch(error){
        
    }
};





controller.putLocal = async (req, res) => {
    try{
        const body = req.body;
        const idParams = req.params.id;
        const populateQuery = req.query.populate;

        if(idParams === 'undefined' || !idParams) return res.status(400).json({ error: 'The id parameter associated with a client must be strictly added' });
        if(!mongoose.Types.ObjectId(idParams))  return res.status(400).json({ error: `The ObjectId is not valid. id: ${ idParams }` });


        const local = await Local.findOne({ _id: idParams });
        if(!local) return res.status(404).json({ error: `There is no record associated with the id: ${idParams}` });

        const name = local.img.name;
        const update = req.body;

        if(req.file) {
            update.img = {
                data: fs.readFileSync(path.join(__dirname, `../../../uploads/${req.file.filename}`)),
                contentType: req.file.mimetype,
                name: req.file.filename
            }
        }
        
        try{
            const result = await Local.findByIdAndUpdate(new mongoose.Types.ObjectId(idParams), update).populate(populateQuery);
            if(req.file) fs.unlinkSync(path.join(__dirname, `../../../uploads/${name}`));
            return res.status(200).json({ result: result });
        }
        catch(errMongo){
            console.log(errMongo);
            return res.status(500).json({ error: errMongo });
        }
       

    }
    catch(err){
        console.log(err);
        return res.status(500).json({ error: err });
    }
};





controller.deleteLocal = async (req, res) => {
    if(!req.params.id) return res.status(400).send('params "Id" is invalid or null');   
    const id = req.params.id;
    const local = await Local.findById(id).exec();
    if(!local) return res.status(400).send('local in not found');

    Local.deleteOne({ _id: local._id })
    .then(element => {
        fs.unlinkSync(path.join(__dirname, `../../../uploads/${local.img.name}`))
        return res.status(200).send('local eliminado con exito de la collección Local');
    })
    .catch(err => {
        console.log(err);
        return res.status(500).send('Error server internal');
    });
};



async function pathLocal(){
    const findLocal = await Local.find({ status: 'activo' }).populate('managers');
    const result = findLocal.filter(local => local.typeMonitoring !== 'perimetral');
    local = result;    
    result.forEach(name => {
       if(name.typeMonitoring === 'perimetral'){
            
       }
    });
};



export { controller };