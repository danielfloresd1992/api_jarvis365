import { Types } from 'mongoose';
import { Schema, model } from 'mongoose';



export default model('Document', new Schema({ //////////// SUJETO A CAMBIOS!!!! 4141089785
    shift: {
        type: String,
        require: true
    },

    date: {
        type: String,
        require: true
    },


    establishmentName: {
        type: String,
    },
    establishmentId: {
        type: Schema.Types.ObjectId,
    },


    franchiseName: {
        type: String,
    },
    franchiseId: {
        type: Schema.Types.ObjectId,
    },


    createdDocument: {
        nameUser: {
            type: String,
            require: true
        },
        _id: {
            type: Schema.Types.ObjectId,
            require: true
        }
    },

    editedOrViewedBy: [{
        nameUser: {
            type: String,
            require: true
        },
        _id: {
            type: Schema.Types.ObjectId,
            require: true
        }
    }],

    pages: [{
        type: Schema.Types.ObjectId,
        ref: 'PageDocument'
    }],

    jarvisNewsHydration: {
        type: Boolean,
        default: false
    },

    type: {
        type: String,
        enum: ['complete-shift', 'resume-shift'],
        required: true,
    }
}));