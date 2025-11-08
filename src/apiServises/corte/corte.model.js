import mongoo from 'mongoose';
const { Schema , model } = mongoo;

const Corte = new Schema({
    corte: [],
    date: String,
    userId: {
        type: String,
        require: true
    }
});

export default model('Corte', Corte);