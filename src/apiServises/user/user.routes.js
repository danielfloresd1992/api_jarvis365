import express from 'express';
const routerUser = express.Router();
import UserModel, {UpdateByUserSchema} from './user.model.js';
import {userUpdateSchema} from './user.schema.js'
import addCredentials from '../../middleware/addCredential.js';
import controller from './user.controller.js';

import nameApi from '../../libs/name_api.js';
import { ObjectId } from 'mongodb';  //   validateSessionAndUser.js
import { validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';



//  FOR USER MANAGEMENT
routerUser.get(`${nameApi}/user`, validateSessionAndUserSuper, async (req, res) => {
    try{

        // --- Validación: debe venir id O pag ---
        if (!req.query?.id && !req.query?.pag) { 
            return res.status(400).json({ 
                error: 'Bad request', 
                status: 400, 
                message: 'You must provide either "id" to search a user by ID or "pag" to get paginated results.' 
            }); 
        }


        // VALIDACIÓN DE PARAMETRO DE CONSULTA POR ID
        if(req?.query?.id){
            const {id} = req.query;
            if(!ObjectId.isValid(id)) return res.status(400).json({ error: 'Bad request', status: 400, messaje: 'ID is not valid' })
            const user = await UserModel.findById(id).select('+updateByUser').populate('updateByUser.idRef');
            
            if(!user) return res.status(404).json({ error: 'Not found', status:404, mmesage: 'The user does not exist.' })

            return res.json({status: 200, result: user})
        }

        const pag = req.query?.pag;

        // VALICACIÓN DE PARAMERO DE CONSULTA POR PAGINACIÓN
        if (!pag)  return res.status(400).json({ error: 'Bad request', status: 400, message: 'The "pag" query param is required when no ID is provided.' });

        const page = Number(pag);

        // VALIDACIÓN QUE EL PARAMETRO DE PAGINACIÓN SEA ENTERO POSITIVO
        if (isNaN(page) || page < 1) return res.status(400).json({ error: 'Bad request', status: 400, message: '"pag" must be a valid positive number.' }); 
        if (!Number.isInteger(page))  return res.status(400).json({ error: 'Bad request', status: 400, message: '"pag" must be an integer number (no decimals).' }); 
        if (page < 1) return res.status(400).json({ error: 'Bad request', status: 400, message: '"pag" must be greater than or equal to 1.' }); 

        const limit = 10;
        const skip = (page - 1) * limit;

        const users = await UserModel.find({}).select('+updateByUser').populate('updateByUser.idRef').sort({ createdOn: -1 }).skip(skip).limit(limit);

        const totalUser = await UserModel.countDocuments();
        const totalPages = Math.ceil(totalUser / limit);

        return res.json({ status: 200, page, result: {
            status: 200,
            reuslt: users,
            totalUser: totalUser,
            totalPages: totalPages,
            currentPage: page
        } });

    }   
    catch(error){
        console.log(error);
        return res.status(500).json({ error: 'Error server internal', status: 500, error: error });
    }
});




routerUser.put(`${nameApi}/user/:id`, validateSessionAndUserSuper,  async (req, res) => {
    try{
        const { id } = req.params;  
        const idUserQuiery = req.session.userId;

        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Bad request', status:400, message: 'ID is not valid' });

        const body = req.body;
        const dataValidate = await userUpdateSchema.validate(body);
        const dataUserChange ={idRef: idUserQuiery, change: Object.keys(dataValidate)}

        const userUpdate = await UserModel.findByIdAndUpdate(id, {$set: dataValidate, $push: { updateByUser: dataUserChange }}, {new: true, runValidators: true});

        if(!userUpdate) return res.status(404).json({ error: 'Not found', status:404, mmesage: 'The user does not exist.' })
        
        return res.json({userUpdate});
    }
    catch(error){
        console.log(error);
        if(error.name === 'ValidationError') return res.status(400).json({ error: 'Bad request', status: 400, message: error.errors })
        return res.status(500).json({ error: 'Error server internal', status: 500, error: error });
    }
});







// THIS ENDPOIND IS DEPRECATED 👇

routerUser.post(`/user/login`, controller.login, addCredentials);   //legace
routerUser.get(`/user/protected`, controller.get); 
routerUser.post(`/user/signup`, controller.signup);
routerUser.get(`/user/logout`, controller.logout);
routerUser.get(`/user/getUser`, controller.getUser);

routerUser.post(`${nameApi}/user/login`, controller.login, addCredentials);

routerUser.get(`${nameApi}/user/protected`, controller.get); 

routerUser.post(`${nameApi}/user/signup`, controller.signup);

routerUser.get(`${nameApi}/user/logout`, controller.logout);

routerUser.get(`${nameApi}/user/getUser`, controller.getUser);



routerUser.get(`${nameApi}/userStore`, (req, res) => {
    return res.status(403)
    /*
    store.all((err, sessions) => {
        if (err) {
            console.error('Error al obtener las sesiones:', err);
            res.status(500).send('Error del servidor');
        } 
        else{
            
            const authenticatedUsers = [];
            for(let i = 0; i < sessions.length;  i++){
            
                if(sessions[i].session.name !== undefined){
                    
                    authenticatedUsers.push(sessions[i]);
                }
            }
      
            return res.json(authenticatedUsers);
        }
    })
        */
});



export { routerUser }; 