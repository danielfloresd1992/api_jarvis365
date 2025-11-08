import DishesSchema from './dishes.model.js';
import LocalModel from '../local/local.model.js';
import { Types } from 'mongoose';

const controller = {};




controller.setDishe = async (req, res) => {
    try {
        const idLocaLQuery = req.query.id;
        const body = req.body;

        const dish = new DishesSchema(body);
        await dish.save();

        const stablishment = await LocalModel.findById(idLocaLQuery);

        if(!stablishment.dishes){
            stablishment.dishes = [ dish.id ];
        }
        else{
            stablishment.dishes.push(dish.id);
        }
        const result = await stablishment.save();

        return res.status(200).json({ message: 'The resource was successfully create', newDish: dish, establishment: result });
    } 
    catch(error) {
        console.log(error);
        if(error.code === 11000) return res.status(409).json({ error: error.message });

        return res.status(500).send('Error server internal');
    }  
};





controller.getDishe = async (req, res) => {
    try {
        const diches = await DishesSchema.find();
        return res.status(200).json(diches);
    } 
    catch(error) {
        console.log(error);
        return res.status(500).json({ error : error });
    }
};



controller.deleteItemDich = async (req, res) => {

}



controller.deleteDishComplete = async (req, res) => {
    try{
        const idLocaLQuery = req.query.id;
        const dishId = req.query.dish;
        
        if(!Types.ObjectId.isValid(dishId)) return res.status(400).json({ error: 'The objectId of the dish parameter is invalid' });
        
        const removeItem = await DishesSchema.findById(dishId);

        if(removeItem === null) return res.status(404).json({ error: 'There is no resource related to the dish id' });

        const stablishment = await LocalModel.findById(idLocaLQuery).select('-img');
        const removeItemForArrDish = stablishment.dishes.filter(id => id.toString() !== dishId);
       
        stablishment.dishes = removeItemForArrDish;
        const result = await stablishment.save();
        
        return res.status(200).json({ message: 'The resource was successfully deleted', resultDish: result.dishes });
    }
    catch(error){
        console.log(error);
        return res.status(500).json({ error: error });
    }
};




export default controller;