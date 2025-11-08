import { Schema , model } from 'mongoose';

const IsDaylightSavingTimeBoolean =  model('isDaylightSavingTime', Schema({
    isDaylightSavingTime: {
        type: Boolean,
        require: true,
        default: false
    },
    editBy: {
        name: String,
    }
}));


export { IsDaylightSavingTimeBoolean };