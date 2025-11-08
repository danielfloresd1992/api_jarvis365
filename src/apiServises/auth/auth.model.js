import { Types } from 'mongoose';
import { Schema, model } from 'mongoose';
import { type } from 'os';



export default model('SMU_MODEL', new Schema({ //////////// SUJETO A CAMBIOS!!!! 4141089785
    idUser: {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true
    },
    idDocument: {
        type: Schema.Types.ObjectId,
        required: true
    },
    SMU: {
        type: Schema.Types.Mixed,
        required: true
    }
}));