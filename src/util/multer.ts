import multer, { Multer, diskStorage, FileFilterCallback } from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import * as url from 'url';
import { Request } from 'express';


let baseDrive: string | undefined;

try {
    fs.accessSync('D:\\', fs.constants.R_OK | fs.constants.W_OK);
    baseDrive = process.env.DEBUG === 'true' ? '\\\\72.68.60.254\\d' : 'D:\\';
} catch (error: any) {
    baseDrive = process.env.DEBUG === 'true' ? '\\\\72.68.60.254\\d' :'C:\\';
}

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));



const dirPath = path.join(baseDrive, 'imagen_clientApp');
const dirConfigImgReport = path.join(dirPath, 'config_document_report');
const dirPageImgReport = path.join(dirPath, 'document_report_page');
const dirPathImageNovelty = path.join(dirPath, 'imageNovelty');
const dirPathVideo = path.join(dirPath, 'video');


// Crear directorios si no existen
[dirPath, dirPathImageNovelty, dirPathVideo, dirConfigImgReport, dirPageImgReport].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});


// Tipo personalizado para el callback de Multer
type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void



// Función de filtrado de archivos genérica
const createFileFilter = (extensions: string[]) => {
    return (req: Request, file: Express.Multer.File, callback: FileFilterCallback) => {
        const ext = file.mimetype.toLowerCase().split('/')[1];
        if (!extensions.includes(ext)) {
            return callback(new Error(`Solo se permiten los siguientes formatos: ${extensions.join(', ')}`));
        }
        callback(null, true);
    }
}


// Configuración común de almacenamiento
const commonStorage = (prefix: string, folder?: string) => diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: DestinationCallback) => {
        cb(null, folder || dirPath);
    },
    filename: (req: Request, file: Express.Multer.File, cb: FileNameCallback) => {
        const ext = file.mimetype.toLowerCase().split('/')[1];
        cb(null, `${prefix}_${Date.now()}.${ext}`);
    }
});

// Configuraciones de subida
const uploadLocal: Multer = multer({
    storage: commonStorage('establishment'),
    fileFilter: createFileFilter(['png', 'jpg', 'jpeg'])
});



const uploadManager: Multer = multer({
    storage: commonStorage('manager'),
    fileFilter: createFileFilter(['png', 'jpg', 'jpeg'])
});



const uploadNoveltie: Multer = multer({
    storage: diskStorage({
        destination: (req: Request, file: Express.Multer.File, cb: DestinationCallback) => {

            const isVideo = ['video/mp4', 'video/avi'].includes(file.mimetype.toLowerCase());
            const { resource } = req.query;
            let pathSave: string | undefined;

            if (isVideo) pathSave = dirPathVideo;
            else if (resource === 'manager') pathSave = path.join(dirPath, 'manager')
            else pathSave = dirPathImageNovelty;

            cb(null, pathSave);
        },
        filename: (req: Request, file: Express.Multer.File, cb: FileNameCallback) => {
            const ext = file.mimetype.toLowerCase().split('/')[1];
            console.log(ext)
            cb(null, `novelty_${Date.now()}.${ext}`);
        }
    }),
    fileFilter: createFileFilter(['png', 'jpg', 'jpeg', 'mp4', 'avi'])
});



const uploadAlert: Multer = multer({
    storage: diskStorage({
        destination: (req: Request, file: Express.Multer.File, cb: DestinationCallback) => {
            const isVideo = ['.mp4', '.avi'].includes(path.extname(file.originalname).toLowerCase());
            cb(null, isVideo ? dirPathVideo : dirPath);
        },
        filename: (req: Request, file: Express.Multer.File, cb: FileNameCallback) => {

            const ext = file.mimetype.toLowerCase().split('/')[1];
            cb(null, `alert_${Date.now()}.${ext}`);
        }
    }),
    fileFilter: createFileFilter(['png', 'jpg', 'jpeg', 'mp4', 'avi'])
});



const uploadConfigReport: Multer = multer({
    storage: commonStorage('config', dirConfigImgReport),
    fileFilter: createFileFilter(['png', 'jpg', 'jpeg', 'mp4', 'avi'])
});

const uploadReportDocument: Multer = multer({
    storage: commonStorage('page', dirPageImgReport),
    fileFilter: createFileFilter(['png', 'jpg', 'jpeg', 'mp4', 'avi'])
});


export {
    uploadLocal,
    uploadManager,
    uploadNoveltie,
    uploadAlert,
    uploadConfigReport,
    uploadReportDocument,
    dirConfigImgReport,
    dirPageImgReport
};