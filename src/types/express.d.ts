import { Request } from 'express';
import { Multer } from 'multer';

declare global {
    namespace Express {
        interface Request {
            file?: Multer.File;
            files?: {
                [fieldname: string]: Multer.File[]
            } | Multer.File[];
        }
    }
}

/**
 * Lo que el login deja en la sesión.
 *
 * Sin esto `req.session.userId` no existe para TypeScript: express-session solo
 * declara sus propios campos, y los que agrega la aplicación hay que anunciarlos
 * acá.
 *
 * Están los que se usan y de los que se conoce el tipo. Los demás campos de
 * sesión del repo (`dataUser`, `laboralEntry`, `idSession`…) se irán sumando a
 * medida que se tipen los recursos que los leen: declararlos ahora con un tipo
 * adivinado sería peor que no declararlos, porque el error dejaría de aparecer
 * sin que nadie lo haya comprobado.
 */
declare module 'express-session' {
    interface SessionData {
        userId: string;
        name: string;
        surName: string;
        admin: boolean;
        super: boolean;
    }
}