import { ObjectId } from 'mongodb';
import { model, Schema } from 'mongoose';


const FileNoveltie = new Schema({
    files:  [{
        data: Buffer,
        contentType: String,
        name: String,
        caption: String
    }],
    local: {
        type: String
    },
    image_index: Number,


    collection_status: {
        is_deprecated: {
            type: Boolean,
            default: true  
        },
        message_description: {
            type: String,
            default: 'This collection is deprecated, use the "imageUrl" property of the novelty collection'
        }
    }
});



export const FileImgToadPos = model('FileImgToadPos', new Schema({
    url: {
        type: String,
        require: true
    },
    path: {
        type: String,
        require: true
    },
    idEstablishment: {
        type: ObjectId,
        require: true
    },
    
    submittedByUser: {
        type: String,
        require: true
    },

    date: { type: Date, default: Date.now }
}));


export default model('FileNoveltie', FileNoveltie);