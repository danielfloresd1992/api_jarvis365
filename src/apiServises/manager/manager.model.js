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
    status: {
        type: String,
        required: true
    },
    characteristic: {
        type: String,
        required: true
    },

    local: {
        type: Schema.Types.ObjectId,
        ref: 'Local'
    },
    franchise: {
        type: Schema.Types.ObjectId,
        ref: 'Franchise'
    },
    localName: {
        type: String,
        required: true
    },

    managerimg: {
        type: Schema.Types.ObjectId,
        ref: 'ManagerImg',
        default: null
    },

    otherLocals: []
});

export default model('Manager', manager);