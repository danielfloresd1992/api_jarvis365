import os from 'os';
import { Router, Request, Response } from 'express';
import { uploadNoveltie } from '../../util/multer';
import nameApi from '../../libs/name_api';
import { validateSession } from '../../middleware/validateSessionAndUser';
import { join } from 'path';
import * as url from 'url';
import fs from 'fs';
import { config } from 'dotenv';



const __dirname: string = url.fileURLToPath(new URL('.', import.meta.url));
const documentsPath: string = join(os.homedir(), 'Documents');

const routerMultimedia = Router();



routerMultimedia.get(`${nameApi}/multimedia`, async (req: Request, res: Response): any => {
    try {
        const nameFile = req.query.filename;
        const resource = req.query.resource;
        let pathFile: string | undefined;

        if (!nameFile) return res.status(400).json({ error: 'filename is undefined', status: 400 });

        if (resource && resource === 'manager') pathFile = join(documentsPath, `/imagen_clientApp/manager/${nameFile}`);

        else pathFile = join(documentsPath, `/imagen_clientApp/imageNovelty/${nameFile}`);

        const result = await fs.promises.access(pathFile, fs.constants.F_OK);

        return res.status(200).sendFile(pathFile);
    }
    catch (error) {
        console.log(error);
        res.status(404).json({ error: 'File not found', status: 404 });
    }
});





routerMultimedia.post(`${nameApi}/multimedia`, validateSession, uploadNoveltie.fields([{ name: 'video', maxCount: 1 }, { name: 'img', maxCount: 1 }]), async (req: Request, res: Response): Promise<void> => {
    try {
        const file = req.files ? req.files : null;
        if (!file) res.status(400).json({ error: 'No files uploaded' });

        const url: string = process.env.NODE_ENV === 'development' ? `https://amazona365.ddns.net:3006${nameApi}/novelty/img=${file.img[0].filename}` : `https://amazona365.ddns.net${nameApi}/novelty/img=${file.img[0].filename}`
        res.status(200).json({ url })
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Error server intenal', status: 404, error: error });
    }
});




export default routerMultimedia;