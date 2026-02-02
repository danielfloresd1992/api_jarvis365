import mongoose from 'mongoose';
import colors from 'colors';
import { join } from 'path';
import { config } from 'dotenv';
//import config_data from './index';
import * as url from 'url';



export default async function connectDB(){
    try {
        const f = `mongodb://${process.env.USERNAME_DATABASE}:${process.env.PASSWORD_DATABASE}@${process.env.URL_DATABASE}:${process.env.PORT_DATABASE}/${process.env.AUTH_SOURSE}?authSource=${process.env.AUTH_SOURSE}&authMechanism=${process.env.AUTH_MECHANISM}`;
        const db = await mongoose.connect(f, { useNewUrlParser: true });
        console.log(colors.green('connect-mongodb proccess'));
    } 
    catch(error){
        console.log(colors.red('connect-mongodb rejected'));
        throw error;
    }
}


