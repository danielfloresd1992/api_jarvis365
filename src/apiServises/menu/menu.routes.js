import controller from './menu.controller.js';
import express from 'express';
import menuSchema from './menu.schema.js'
import MenuModel from './menu.model.js';
import { extendSession, validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';
const routerMenu = express.Router();



routerMenu.get(`${nameApi}/menu`, extendSession, validateSession, controller.getAllMenu);

routerMenu.get(`${nameApi}/menu/category=:category`, extendSession, validateSession, controller.getCategory);

routerMenu.get(`${nameApi}/menu/id=:id`, extendSession, validateSession, controller.getMenuById);




routerMenu.post(`${nameApi}/menu`, extendSession, validateSessionAndUserSuper, async ( req, res ) => {
    try{
        const body = req.body;
        const menuValiate = await menuSchema.validate(body);
       
        const menu = new MenuModel(menuValiate);
        await menu.save()

        return res.json(menu);
    }
    catch(error){
        console.log(error.name)
        if(error.name === 'ValidationError') return res.status(400).json({ error: 'Bad reques', status:400, message: error.errors});
        if(error.name === 'MongoServerError') return res.status(400).json({ error: 'Bad reques', status:400, message: error});
        return res.status(500).send(error);
    }
});



routerMenu.post(`${nameApi}/menu/put`, extendSession, validateSessionAndUserSuper, controller.putMenu);

routerMenu.delete(`${nameApi}/menu/id=:id`, extendSession, validateSessionAndUserSuper,controller.deleteByIdMenu);



export { routerMenu };