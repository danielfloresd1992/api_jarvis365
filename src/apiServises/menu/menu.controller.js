import menu from './menu.js';
import menuModel from './menu.model.js';
import colors from 'colors';

const controller = {};


controller.setMenu = async ( req, res ) => {
    try{
        const newMenu =  await menu.setMenu(req.body);
        return res.json(newMenu);
    }
    catch(err){
        console.log(err)
        return res.status(500).send(err);
    }
};




controller.getAllMenu = async (req, res) => {
    try{
        const { compact, alertLive, alertDocument } = req.query;
        const seletedPropiety = {};
        const query = {};
        if(compact === 'true') seletedPropiety.remove = '_id es';
        if(alertLive !== undefined)  query.useOfLiveAlertForTheCustomer = Boolean(alertLive);
        if(alertDocument !== undefined) query.useOnlyForTheReportingDocument = Boolean(alertDocument);
        const menuAll = await menuModel.find(query).select(seletedPropiety.remove);
        return res.json(menuAll);
    }
    catch(err){
        console.log(err);
        return res.status(500).json({error: err});
    }
};




controller.getMenuById = async (req, res) => {
    try {
        const id = req.params.id;
        const menuFind = await menu.getMenuById(id);
        return res.json(menuFind);
    } 
    catch(err){
        console.log(err);
        return res.status(500).send(err);
    }
};


controller.getCategory = async (req, res) => {
    try{

        const params = req.params.category;

        const menuCategory = await menu.getCategoryMenu(params);
        return res.json(menuCategory);

    }
    catch(err){
        console.log(err);
        return res.status(500).send(err);
    }
};



controller.putMenu = async (req, res) => {
    try {
        const update = await menu.putMenu(req.body);
        return res.json(update);
    } 
    catch(err){
        console.log(err);
        return res.status(500).send(err);
    }
};



controller.deleteByIdMenu = async (req, res) => {
    try{
        
        const id = req.params.id;
        const resultMenu = await menu.getDeleteMenu(id)
       
        if(resultMenu.deletedCount > 0) {
            return res.status(200).json(resultMenu);
        }
        else{
            return res.status(500);
        }
    }
    catch(err){
        console.log(err);
        return res.status(500).send(err);
    }
};



export default controller;