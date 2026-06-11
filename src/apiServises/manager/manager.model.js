import { Schema, model } from 'mongoose';



let manager = new Schema({

    burden: {
        type: String,
        required: true
    },
    name: {
        type: String,
    },
    numberManager: {
        type: Number,
        required: true
    },
    
    characteristic: {
        type: String,
        required: true
    },

    status: {
        type: Boolean,
        default: true
    },


    otherLocals: []  //DEPRECATED
});

export default model('Manager', manager);