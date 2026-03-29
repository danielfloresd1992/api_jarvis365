import express, { Request, Response, NextFunction, Express } from 'express';
import { createServer, Server } from 'https';
import { readFileSync } from 'fs';
import { app } from './app';

import { io } from './services/socket/io.ts'

import { config as dotenvConfig } from 'dotenv';
import { logBanner, logServerStart, logHttpStart, logSocketStart } from './util/logger.js';
import { join } from 'path';
import * as url from 'url';
import appConfig from './config/index.js';


// load .env (db_connect also loads dotenv but ensure env is loaded early)
dotenvConfig();


declare global {
    namespace NodeJS {
        interface ProcessEnv {
            NODE_ENV: 'development' | 'production';
            DEV_PORT: string;
            PROD_PORT: string;
        }
    }
}


const __dirname = url.fileURLToPath(new URL('.', import.meta.url));


const app_dev: Express = express();
const httpPort: number = appConfig.PORT;



const sslOptions = {
    cert: readFileSync(join(__dirname, '../cert/server/amazona365_ddns_net.crt')),
    key: readFileSync(join(__dirname, '../cert/server/privatejarvis.key'))
};

const server: Server = createServer(sslOptions, app);


const handleError = (err: Error, res: Response) => {
    console.error(err);

    res.status(500).json({ error: err.message, status: 500 });
};



app_dev.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
        res.sendFile(join(__dirname, './view/richard.html'));
    } catch (error) {
        handleError(error as Error, res);
    }
});


app_dev.get('/.well-known/pki-validation/:file_name',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { file_name } = req.params;
            const filePath = join(__dirname, `./cert/${file_name}`);
 

            res.sendFile(filePath, (err: Error) => {
                if (err) {
                    return err.message.includes('ENOENT')
                        ? res.status(404).json({ error: 'File not found', status: 404 })
                        : res.status(500).json({ error: err.message, status: 500 });
                }
            });
        } catch (error) {
            handleError(error as Error, res);
        }
    }
);




app_dev.get('/.well-known/acme-challenge/:file_name',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { file_name } = req.params;
            const filePath = join(__dirname, `./cert/${file_name}`);
            console.log(filePath);

            res.sendFile(filePath, (err: Error) => {
                if (err) {
                    return err.message.includes('ENOENT')
                        ? res.status(404).json({ error: 'File not found', status: 404 })
                        : res.status(500).json({ error: err.message, status: 500 });
                }
            });
        } catch (error) {
            handleError(error as Error, res);
        }
    }
);




app_dev.use(express.static(join(__dirname, '../public')));



server.listen(httpPort, () => {
    logBanner();
    logServerStart(appConfig.NODE_ENV, httpPort);
    io.init(server);
    logSocketStart();
    const httpPortDev: number = 80;
    app_dev.listen(httpPortDev, () => {
        logHttpStart(httpPortDev);
    });
});