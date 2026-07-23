import controller from './menu.controller.js';
import express from 'express';
import menuSchema from './menu.schema.js'
import MenuModel from './menu.model.js';
import { extendSession, validateSession, validateSessionAndUserSuper, validateSuperUser } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';
const routerMenu = express.Router();



routerMenu.get(`${nameApi}/menu`, extendSession, validateSession, controller.getAllMenu);

routerMenu.get(`${nameApi}/menu/category=:category`, extendSession, validateSession, controller.getCategory);

routerMenu.get(`${nameApi}/menu/id=:id`, extendSession, validateSession, controller.getMenuById);




routerMenu.post(`${nameApi}/menu`, extendSession, validateSuperUser, async ( req, res ) => {
    try{
        const body = req.body;
        const menuValiate = await menuSchema.validate(body);

        // El autor sale de la sesión (nunca del body). Docs antiguos sin createdBy.
        const menu = new MenuModel({ ...menuValiate, createdBy: req.session.userId });
        await menu.save();
        await menu.populate('createdBy', 'name surName img');

        return res.json(menu);
    }
    catch(error){
        console.log(error.name)
        if(error.name === 'ValidationError') return res.status(400).json({ error: 'Bad reques', status:400, message: error.errors});
        if(error.name === 'MongoServerError') return res.status(400).json({ error: 'Bad reques', status:400, message: error});
        return res.status(500).send(error);
    }
});



routerMenu.put(`${nameApi}/menu/put`, extendSession, validateSuperUser, controller.putMenu);

routerMenu.delete(`${nameApi}/menu/id=:id`, extendSession, validateSessionAndUserSuper,controller.deleteByIdMenu);



export { routerMenu };