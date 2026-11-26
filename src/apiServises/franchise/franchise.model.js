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
    },
    // La foto de la franquicia: la URL que devuelve POST /multimedia, como el logo
    // de un local. Se cambia con PUT /franchise/:id (ver franchise.lib.ts).
    image: {
        type: String,
        default: null
    }
});


export default model('Franchise', Franchise);