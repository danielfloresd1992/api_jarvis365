const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/Cortes365', {
    useNewUrlParser: true,
})
.catch(err => {
    throw 'Conexión fallida a MongoDB'.red;
});

mongoose.connection.on('open', () => {
    console.log('Conexión exitosa a MongoDB desde monoose'.green);
});