import { Schema, model } from "mongoose";


const DishesSchema = new Schema({
    nameDishe: { 
        type: String,
        required: true,
    },

    category: {
        type: String
    },

    dayActivate: {
        type: Schema.Types.Mixed,
        required: true
    },

    idLocalRef: {
        type: String,
        require: true
    }
});


export default model('Dishes', DishesSchema);