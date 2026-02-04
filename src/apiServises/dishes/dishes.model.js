import { Schema, model } from "mongoose";


const DishesSchema = new Schema({

    nameDishe: {
        type: String,
        required: true
    },

    category: {
        type: String,
        required: true,
        enum: ['desserts_and_sweets', 'food', 'drinks']
    },

    allDay: {
        type: Boolean,
        default: true
    },

    timeLimit: {
        day: {
            type: String,
            require: true
        },
        night: {
            type: String,
            require: true
        }
    },


    timeLimitSeconds: {
        day: {
            type: Number,
            require: true
        },
        night: {
            type: Number,
            require: true
        }
    },


    showDelaySubtraction: {
        type: Boolean,
        default: false
    },

    
    idLocalRef: {
        type: String,
        require: true
    },

    requiresTableNumber: {
        type: Boolean
    }
});


export default model('Dishes', DishesSchema);