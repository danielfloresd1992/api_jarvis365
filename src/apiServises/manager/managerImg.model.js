import mongoose, { Schema, model } from 'mongoose';

let ManagerImg = new Schema({

    img: [{
        data: Buffer,
        contentType: String,
        name: String
    }]
});

export default mongoose.models['ManagerImg'] || model('ManagerImg', ManagerImg);