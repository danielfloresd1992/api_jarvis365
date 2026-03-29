import mongoose from 'mongoose';
import { logDBSuccess, logDBError } from '../util/logger.js';
import * as url from 'url';



export default async function connectDB(){
    try {
        const f = `mongodb://${process.env.USERNAME_DATABASE}:${process.env.PASSWORD_DATABASE}@${process.env.URL_DATABASE}:${process.env.PORT_DATABASE}/${process.env.AUTH_SOURSE}?authSource=${process.env.AUTH_SOURSE}&authMechanism=${process.env.AUTH_MECHANISM}`;
        const db = await mongoose.connect(f, { useNewUrlParser: true });
        logDBSuccess(process.env.AUTH_SOURSE);
    }
    catch(error){
        logDBError(error);
        throw error;
    }
}


