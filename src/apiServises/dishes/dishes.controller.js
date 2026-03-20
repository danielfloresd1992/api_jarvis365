import DishesSchema from './dishes.model.js';
import LocalModel from '../local/local.model.js';
import { dishesSchema } from '../../libs/schema/dish.js';
import { Types } from 'mongoose';

const controller = {};




controller.setDishe = async (req, res) => {
  try {
        const idLocaLQuery = req.query.id;

        const bodyValidate = await dishesSchema.validate(req.body, {
        abortEarly: false
        });

        const createDish = new DishesSchema(bodyValidate);
        await createDish.save();


        const establishment = await LocalModel.findById(idLocaLQuery);
        establishment.dishes ? establishment.dishes.push(createDish.id) : establishment.dishes = [createDish.id];

        const establishmentUpdate = await establishment.save();
        return res.status(200).json({
        message: 'The resource was successfully create',
        newDish: createDish,
        establishment: establishmentUpdate
        });


    } 
    catch (error) {
        if (error.name === 'ValidationError') return res.status(400).json({errors: error.errors}) 
        if(error.code === 11000) return res.status(409).json({ error: error.message });
        return res.status(500).send('Error server internal');
    }
}, 






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



controller.getDishById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!Types.ObjectId.isValid(id)) return res.status(400).json({
            error: 'The objectId of the dish parameter is invalid'
        });

        const result = await DishesSchema.findById(id);
        if(result) return res.json({data: result, status: 200});
        return res.status(404).json({error: 'Document not found', status: 404});
    } 
    catch (a) {
        return console.log(a), res.status(500).json({
        error: a
        });
    }
}, 






controller.putDish = async (req, res) => {
    try {
        const { id } = req.params;

        if (!Types.ObjectId.isValid(id)) return res.status(400).json({
            error: 'The objectId of the dish parameter is invalid'
        });


        const dataValidate = await dishesSchema.validate(req.body, {
            abortEarly: false
        });

        const result = await DishesSchema.findByIdAndUpdate(id, dataValidate);

        if(!result) return res.json({ data: result,status: 200 });
        return res.status(404).json({error: 'Document not found',status: 404});
    } 
    catch(error){
        if(error.name === 'ValidationError') return res.status(400).json({errors: error.errors});
        return res.status(500).json({ error: error});
    }
}, 



controller.deleteDishComplete = async (req, res) => {
  try {
        const idEstablishment = req.query.id;
        const dish = req.query.dish;

        if (!Types.ObjectId.isValid(dish)) return res.status(400).json({
            error: 'The objectId of the dish parameter is invalid'
        });


        const dishDataValidate = await DishesSchema.findById(dish);

        if (dishDataValidate === null) return res.status(404).json({
            error: 'There is no resource related to the dish id'
        });


        const establishment = await LocalModel.findById(idEstablishment).select('-img');

        const dishSeleted = establishment.dishes.filter(a => a.toString() !== dish);
        establishment.dishes = dishSeleted;

        const result = await establishment.save();

        return res.status(200).json({
            message: 'The resource was successfully deleted',
            resultDish: result.dishes
        });
    } 
    catch (error) {
        return console.log(error), res.status(500).json({error: error});
    }
};




export default controller;