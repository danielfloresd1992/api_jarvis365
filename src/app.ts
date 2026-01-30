import express, { Request, Response, NextFunction, Express } from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import colors from 'colors';
import { join } from 'path';
import cors from 'cors';
import session, { SessionOptions } from 'express-session';
import connectDB from './config/db_connect.js'
import { rejectInsecureConnections } from './middleware/secure_connection.js';
import origins from './config/origins.js';
import config from './config/index.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import compression from 'compression';

import * as url from 'url';

const __dirname: string = url.fileURLToPath(new URL('.', import.meta.url));



const app: Express = express();

console.log(process.env)
import './services/socket/io.js';


app.set('view engine', 'pug');
app.set('views', join(__dirname, './view'));

//Mongo conection

connectDB();



// --- HTTP hardening / security middlewares ---
app.use(helmet());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

app.use(hpp());
app.use(mongoSanitize());
app.use(xss());
app.use(compression());

app.use(rejectInsecureConnections);

app.use(cors({
    origin: config.CORS_ORIGINS && config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : origins,
    optionsSuccessStatus: 200,
    credentials: true,
}
));


app.use(bodyParser.json({}));



app.use(cookieParser(config.SECRET_SERVER || 'Secreto_montaña365.*'));


app.set('trust proxy', 1);

const sessionOptions: SessionOptions = {
    secret: config.SECRET_SERVER || 'lkjgklIUT456487miohVBUTV-,..*',
    saveUninitialized: true,
    resave: true,
    cookie: {
        httpOnly: false,
        maxAge: undefined, // 30 * 60 * 1000,
        secure: config.COOKIE_SECURE,
        sameSite: 'none',
    }
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
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './docs/swagger.js';



app.get('/apiVersion5.5/status', (req: Request, res: Response) => {
    res.status(200).send('200 ok');
});



app.get('/.well-known/pki-validation/AA16A519A39B28B1D06DCCAD9C255BCB.txt', (req: Request, res: Response) => {
    return res.sendFile(join(__dirname, './cert/AA16A519A39B28B1D06DCCAD9C255BCB.txt'))
});


// Group all API routers under /api/v1
const apiRouter = express.Router();

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



// Swagger UI for API documentation
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));




app.use(express.static(join(__dirname, '../public')));


app.use((req: Request, res: Response, next: NextFunction): void => {
    res.status(404).json({ error: 'route not found', status: 404 });
});


export { app };