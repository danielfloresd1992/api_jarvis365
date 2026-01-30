import express from 'express';
const routerUser = express.Router();
import addCredentials from '../../middleware/addCredential.js';
import controller from './user.controller.js';

import nameApi from '../../libs/name_api.js';



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