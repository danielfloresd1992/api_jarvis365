import { Schema, model } from 'mongoose';



let manager = new Schema({

    burden: {
        type: String,
        required: true,
        trim: true
    },
    name: {
        type: String,
        default: null
    },
    numberManager: {
        type: Number,
        required: true
    },
    
    characteristic: {
        type: String,
        required: true,
        trim: true
    },

    status: {
        type: Boolean,
        default: true
    },


    img: [{
        type:String,
        default: [],
        trim: true
    }],

    
});

export default model('Manager', manager);