import express, { Request, Response, NextFunction, Express } from 'express';
import { createServer, Server } from 'https';
import { readFileSync } from 'fs';
import { app } from './app';
import colors from 'colors';
import { config } from 'dotenv';
import { join } from 'path';
import * as url from 'url';


config();


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
const httpPort: string = process.env.NODE_ENV === 'development' ? process.env.DEV_PORT : process.env.PROD_PORT;


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
        res.send(`
            <div style="width: 100%">
                <h1 style="text-align: center;" > Richard es rolo de marikon </h1>
                <img style="width: 100%" src="/IMG-20230411-WA0003.jpg" alt="Descripción de la imagen" width="300"/>
            </div>
            
             `);
    } catch (error) {
        handleError(error as Error, res);
    }
});


app_dev.get('/.well-known/pki-validation/:file_name',
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
    console.log(colors.bgGreen(`\nInit App Manager mode: ${process.env.NODE_ENV} and port ${httpPort}`));
    const httpPortDev: number = 80;
    app_dev.listen(httpPortDev, () => {
        console.log(colors.red(`\nInit App Manager mode: ${process.env.NODE_ENV} and port ${httpPort}, for development`));
    });
});