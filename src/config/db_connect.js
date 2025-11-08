import mongoose from 'mongoose';
import colors from 'colors';
import { join } from 'path';
import { config } from 'dotenv';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

config();

export default async function connectDB(){
    try {
        const CONNECTION = (process.env.NODE_ENV === 'development') ? process.env.DEV_URL_DATABASE : 
        `mongodb://${process.env.USERNAME_DATABASE}:${process.env.PASSWORD_DATABASE}@${process.env.URL_DATABASE}:${process.env.PORT_DATABASE}/${process.env.AUTH_SOURSE}?authSource=${process.env.AUTH_SOURSE}&authMechanism=${process.env.AUTH_MECHANISM}`
        const db = await mongoose.connect(CONNECTION, { useNewUrlParser: true });
        console.log(colors.green('connect-mongodb proccess'));
    } 
    catch(error){
        console.log(colors.red('connect-mongodb rejected'));
        throw error;
    }
}


