import mongoo from 'mongoose';
const { Schema , model } = mongoo;



const userSchema = new Schema({

    user:{
        type: String,
        unique: true,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    email: {
        type: String,
        unique: true,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    surName: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        unique: true,
        required: true
    },

    admin: {
        type: Boolean,
        default: false
    },

    super: {
        type: Boolean,
        default: false
    },

    inabilited: {
        type: Boolean,
        default: false
    },
    date: {
        type: Date,
        default: new Date()
    },
    createdOn: {
        type: Date,
        default: new Date()
    }
});


export default model('user', userSchema);