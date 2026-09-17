import mongoose from 'mongoose';
import { logDBSuccess, logDBError } from '../util/logger.js';
import * as url from 'url';

import config from '../config/index.ts';

export default async function connectDB(){
    try {
        console.log(config);
        const f = config.MONGO_URI;
        console.log('Connecting to MongoDB...', f);
        const db = await mongoose.connect(f, { useNewUrlParser: true });
        logDBSuccess(process.env.AUTH_SOURSE);
    }
    catch(error){
        logDBError(error);
        throw error;
    }
}


