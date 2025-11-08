import { model, Schema } from 'mongoose';
import { ObjectId } from 'mongodb';

export default model('Chat', new Schema({

    message: {  
        type: String,
        require: true
    },


    submittedByUser: {
        name: {
            type: String,
            require: true
        },
        userId: {
            type: ObjectId,
            require: true
        }
    },

    establishment: {
        name: {
            type: String,
        },
        establishmentId: {
            type: ObjectId,
        }
    },

    date: { type: Date, default: Date.now }

}));