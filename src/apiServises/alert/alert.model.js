import { Schema, model } from  'mongoose';

const AlertModel = model('Alert', new Schema({
    date: {
        type: Date,
        require: true
    },
    shift: {
        type: String
    },
    img: {
        data: Buffer,
        contentType: String,
        name: String
    }
}));



const RecordsLiveModel = model('RecordsLive', new Schema({
    createdAt: { 
        type: String, 
        require: true,
    },
    shift: {
        type: String,
        require: true,
        enum: ['diurno', 'nocturno']
    },
    goalDay: {
        type: Number
    },
    data: []
}));


export { AlertModel, RecordsLiveModel };