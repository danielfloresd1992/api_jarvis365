import mongoose from 'mongoose';
import color from 'colors';
import { join } from 'path';
import { config } from 'dotenv';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
config({ path: join(__dirname, '../../../.env') });
const CONNECTION = process.env.NODE_ENV === 'development' ? process.env.DEV_URL_DATABASE : process.env.PROD_URL_DATABASE;


mongoose.connect(CONNECTION, {
    useNewUrlParser: true,
})
.catch(err => {
    throw 'Conexión fallida a MongoDB'.red;
});

mongoose.connection.on('open', () => {
    console.log('Conexión exitosa a MongoDB desde monoose'.green);
});