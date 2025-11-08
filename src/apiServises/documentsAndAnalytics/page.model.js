import { Schema, Types, model } from 'mongoose';



export default model('PageDocument', new Schema({ //////////// SUJETO A CAMBIOS!!!! 
    numberPage: {
        type: Number,
        require: true
    },
    type: {
        type: String,
        require: true
    },
    name_establishment: {
        type: Schema.Types.Mixed,
        require: true
    },
    data: {
        type: Schema.Types.Mixed
    },
    blocked: {
        type: Boolean,
        require: true
    },
    unique: {
        type: Boolean,
        require: true
    }
}));