import { model, Schema } from 'mongoose';

const Publisher = new Schema({
    date :{
        type: Date
    },
    title: String ,

    userPublicate: {
        name: {
            type: String,
        },
        userId: {
            type: String
        }
    },
    validateFor: 
            {
                type: Schema.Types.ObjectId,
                ref: 'User'
            }
    ,
    local: {
        id: Schema.Types.ObjectId,
        localName: String
    },
    share: {
        type: String
    },
    corte: { type: Schema.Types.ObjectId, ref: 'Corte' },
    noveltie: { type: Schema.Types.ObjectId, ref: 'Noveltie' },
    alert: { type: Schema.Types.ObjectId, ref: 'Alert' }
});


Publisher.pre('findByIdAndDelete', function(next){
    // Buscar y eliminar el Noveltie relacionado con el Publisher que se está eliminando
    console.log(this);
    this.model('Noveltie').findByIdAndDelete(this.noveltie, function(err, noveltie) {
        if(err){
            console.log(err);
            return next(err);
        }
        console.log(noveltie);
        // Si se encuentra el Noveltie relacionado, también se elimina el Publisher
        if (noveltie) this.model('Publisher').deleteOne({ _id: this._id }, next);
        else next();

    }.bind(this));
});


export default model('Publisher', Publisher)