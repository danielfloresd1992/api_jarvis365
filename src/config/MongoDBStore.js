import { join } from 'path';
import colors from 'colors';
import session from 'express-session';
import { default as connectMongoDBSession } from 'connect-mongodb-session';
import { config } from 'dotenv';
import * as url from 'url';



const MongoDBStore = connectMongoDBSession(session);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))


const CONNECTION = (process.env.NODE_ENV === 'development') ? process.env.DEV_URL_DATABASE : process.env.PROD_URL_DATABASE_STORE

process.env.DEV_URL_DATABASE  //`mongodb://${process.env.USERNAME_DATABASE}:${process.env.PASSWORD_DATABASE}@${process.env.URL_DATABASE}:${process.env.PORT_DATABASE}/connect_mongodb_session_test?authSource=${process.env.AUTH_SOURSE}&authMechanism=${process.env.AUTH_MECHANISM}`;

const store = new MongoDBStore({
    uri: CONNECTION,
    databaseName: 'connect_mongodb_session_test',
    collection: 'mySessions'
},
    err => {
        if (!err) return console.log(colors.green('connect-mongodb-session precess'));
        console.log(err)
        throw 'connect-mongodb-session rejected'.red;
    });

store.on('error', err => console.log(err));

export { store };