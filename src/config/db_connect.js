import mongoose from 'mongoose';
import colors from 'colors';
import { join } from 'path';
import { config as configDoten } from 'dotenv';
import config from './index';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

configDoten();

export default async function connectDB(){
    try {
        const db = await mongoose.connect(config.MONGO_URI, { useNewUrlParser: true });
        console.log(colors.green('connect-mongodb proccess'));
    } 
    catch(error){
        console.log(colors.red('connect-mongodb rejected'));
        throw error;
    }
}


