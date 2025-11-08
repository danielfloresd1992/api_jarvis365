import express, { Request, Response, NextFunction, Express } from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import colors from 'colors';
import { join } from 'path';
import cors from 'cors';
import session, { SessionOptions, Store } from 'express-session';
import connectDB from './config/db_connect.js'
import { rejectInsecureConnections } from './middleware/secure_connection.js';
import origins from './config/origins.js';

import * as url from 'url';

const __dirname: string = url.fileURLToPath(new URL('.', import.meta.url));



const app: Express = express();

console.log(process.env)
import './services/socket/io.js';


app.set('view engine', 'pug');
app.set('views', join(__dirname, './view'));

//Mongo conection
import { store } from './config/MongoDBStore.js';
connectDB();



app.use(rejectInsecureConnections);

app.use(cors({
    origin: origins,
    optionsSuccessStatus: 200,
    credentials: true,
}
));


app.use(bodyParser.json({

}));


app.use(cookieParser(process.env.SECRET_SERVER || 'Secreto_montaña365.*'));


app.set('trust proxy', 1);

const sessionOptions: SessionOptions = {
    secret: process.env.SECRET_SERVER || 'Secreto_montaña365.*',
    saveUninitialized: true,
    resave: true,
    cookie: {
        httpOnly: false,
        maxAge: undefined, // 30 * 60 * 1000,
        secure: true,
        sameSite: 'none',
    },
    store: store as Store, // Asegurar que store sea del tipo correcto
};


app.use(session(sessionOptions));



import { routerView } from './services/view/view.routes.js';
import { routerPublisher } from './services/publisher/publisher.routes.js'
import { routerFranchise } from './apiServises/franchise/franchise.routes.js';
import { routerLocal } from './apiServises/local/local.routes.js';
import { routerManager } from './apiServises/manager/manager.routes.js';
import { routerCorte } from './apiServises/corte/corte.routes.js';
import { routerMenu } from './apiServises/menu/menu.routes.js';
import { routerAlert } from './apiServises/alert/alert.routes.js';
import { routerNoveltie } from './apiServises/noveltie/novelties.routes.ts';
import { routerSchedule } from './apiServises/schedules/schedule.routes.js';
import { routesTimer } from './apiServises/time/time.routes.js'
import { routesFailed } from './apiServises/failed/failed.routes.js';
import { routesDishes } from './apiServises/dishes/dishes.router.js';
import { authRouter } from './apiServises/auth/auth.routes.js';
import { routerDocument } from './apiServises/documentsAndAnalytics/document.routes.js';
import { routerChat } from './apiServises/chat/router.js';
import { routerUser } from './apiServises/user/user.routes.js';
import routerMultimedia from './apiServises/multimedia/routes.index.ts'



app.get('/apiVersion5.5/status', (req: Request, res: Response) => {
    res.status(200).send('200 ok');
});



app.get('/.well-known/pki-validation/AA16A519A39B28B1D06DCCAD9C255BCB.txt', (req: Request, res: Response) => {
    return res.sendFile(join(__dirname, './cert/AA16A519A39B28B1D06DCCAD9C255BCB.txt'))
});


app
    .use(routerMultimedia)
    .use(routerPublisher)
    .use(routerFranchise)
    .use(routerLocal)
    .use(routerCorte)
    .use(routerMenu)
    .use(routerManager)
    .use(routerNoveltie)
    .use(routerAlert)
    .use(routerSchedule)
    .use(routesTimer)
    .use(routesFailed)
    .use(routesDishes)
    .use(authRouter)
    .use(routerDocument)
    .use(routerChat)
    .use(routerView)
    .use(routerUser);




app.use(express.static(join(__dirname, '../public')));


app.use((req: Request, res: Response, next: NextFunction): void => {
    res.status(404).json({ error: 'route not found', status: 404 });
});


export { app };