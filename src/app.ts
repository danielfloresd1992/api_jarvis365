import express, { Request, Response, NextFunction, Express } from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import colors from 'colors';
import { join } from 'path';
import cors from 'cors';
import session, { SessionOptions } from 'express-session';
import connectDB from './config/db_connect.js'
import redisStore from './config/redis_cache.js'
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

import './services/socket/io.js';


app.set('view engine', 'pug');
app.set('views', join(__dirname, './view'));

//Mongo conection

connectDB();

// --- HTTP hardening / security middlewares ---

// CORS va PRIMERO, antes que cualquier parser. Cuando el cuerpo excede el límite,
// body-parser corta con `next(err)` y eso salta TODO el middleware normal que
// venga después. Con cors() registrado detrás, la respuesta 413 salía sin
// Access-Control-Allow-Origin, el navegador la bloqueaba (net::ERR_FAILED) y el
// front se quedaba sin poder leer `error.response.status`. Registrado aquí, el
// 413 llega al cliente como un 413 legible.
app.use(cors({
    origin: origins,
    optionsSuccessStatus: 200,
    credentials: true,
}));


// Sin `limit`, body-parser aplica su default de 100kb. Una página de reporte con
// las novedades embebidas lo cruza a partir de unas 29 alertas, que es lo que
// producía el 413 en PUT /document/addpage. Se mide sobre bytes YA
// descomprimidos: `inflate` viene activo, así que comprimir no lo evita.
app.use(bodyParser.json({ limit: config.BODY_LIMIT }));


const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30000
});


app.use(limiter);
app.use(hpp());
app.use(mongoSanitize());
app.use(xss());
app.use(compression());
app.use(rejectInsecureConnections);



app.set('view engine', 'pug');
app.set('views', join(__dirname, './view'));




/*
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Importante para imágenes
    contentSecurityPolicy: false // O configúrala específicamente
}));
*/


app.use(cookieParser(config.SECRET_SERVER || 'Secreto_montaña365.*'));

app.set('trust proxy', 1);



const sessionOptions: SessionOptions = {
    secret: config.SECRET_SERVER || 'lkjgklIUT456487miohVBUTV-,..*',
    saveUninitialized: false,
    resave: false,
    store: await redisStore,
    cookie: {
        httpOnly: true,
        maxAge: undefined, // 30 * 60 * 1000,
        secure: config.COOKIE_SECURE,
        sameSite: 'none',
    }
};
//app.use(morgan(':method :url :status :res[content-length] - :response-time ms'))

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
import { routerNoveltyReport } from './services/noveltyReport/noveltyReport.routes.js';
import { routerMonitoring } from './services/monitoring/monitoring.routes.js';
import { routesTimer } from './apiServises/time/time.routes.js'
import { routesFailed } from './apiServises/failed/failed.routes.js';
import { routerDvrFailure } from './apiServises/dvrFailure/dvrFailure.routes.js';
import { routesDishes } from './apiServises/dishes/dishes.router.js';
import { authRouter } from './apiServises/auth/auth.routes.js';
import { routerDocument } from './apiServises/documentsAndAnalytics/document.routes.js';
import { routerChat } from './apiServises/chat/router.js';
import { routerAiChat } from './apiServises/aiChat/aiChat.routes.js';
import { routerUser } from './apiServises/user/user.routes.js';
import { routerNotification } from './apiServises/notification/notification.routes.js';
import { routerBonus } from './apiServises/bonus/bonus.routes.js';
import { routerTabulador } from './apiServises/tabulador/tabulador.routes.js';
import { routerApiKey } from './apiServises/apiKey/apiKey.routes.js';
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
    .use(routerUser)
    .use(routerNotification)
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
    .use(routerNoveltyReport)
    .use(routerBonus)
    .use(routerTabulador)
    .use(routerApiKey)
    .use(routerMonitoring)
    .use(routesTimer)
    .use(routerDvrFailure)
    .use(routesFailed)
    .use(routesDishes)
    .use(authRouter)
    .use(routerDocument)
    .use(routerChat)
    .use(routerAiChat)
    .use(routerView);






app.use(express.static(join(__dirname, '../public')));



// Swagger UI for API documentation
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));




app.use((req: Request, res: Response, next: NextFunction): void => {
    res.status(404).json({ error: 'route not found', status: 404 });
});




// ── Manejador de errores ───────────────────────────────────────────────────
// Va al final y con firma de CUATRO argumentos: así es como Express distingue un
// manejador de errores de un middleware normal. Sin esto, todo `next(err)` caía
// en el finalhandler por defecto, que responde HTML — el front recibía una
// página en lugar del { status, error, message } que espera.
//
// El caso que importa es el 413 de body-parser: ocurre ANTES del router, así que
// ni asyncHandler ni los try/catch de las rutas pueden verlo. Solo se atrapa aquí.
app.use((err: any, req: Request, res: Response, next: NextFunction): void => {

    const status: number = err?.status ?? err?.statusCode ?? 500;

    if (res.headersSent) {
        next(err);
        return;
    }

    if (status === 413) {
        const received = req.headers['content-length'] ?? 'desconocido';
        console.error(`[413] ${req.method} ${req.originalUrl} — límite ${config.BODY_LIMIT}, recibido ${received} bytes`);

        res.status(413).json({
            status: 413,
            error: 'Payload Too Large',
            message: `El cuerpo de la petición supera el límite de ${config.BODY_LIMIT}.`,
            limit: config.BODY_LIMIT,
            received,
        });
        return;
    }

    // Multer no pone `status` en sus errores, así que sin esto un archivo
    // demasiado grande salía como 500 opaco.
    if (err?.name === 'MulterError') {
        console.error(`[400] ${req.method} ${req.originalUrl} — MulterError ${err.code}`);
        res.status(400).json({
            status: 400,
            error: 'Bad request',
            message: err.message,
            code: err.code,
        });
        return;
    }

    console.error(`[${status}] ${req.method} ${req.originalUrl}:`, err);
    res.status(status).json({
        status,
        error: err?.name ?? 'Internal Server Error',
        message: err?.message ?? 'Error server internal',
    });
});




export { app };