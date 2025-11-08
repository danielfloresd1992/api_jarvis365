import { Schema, model } from 'mongoose';

let ManagerImg = new Schema({
    local: {
        type: String
    },
    img: [{
        data: Buffer,
        contentType: String,
        name: String
    }]
});

export default model('ManagerImg', ManagerImg);