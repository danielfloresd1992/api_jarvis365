import mongoo from 'mongoose';
const { Schema , model } = mongoo;

const Franchise = new Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    location: {
        type: String
    }
});


export default model('Franchise', Franchise);