import SMU_MODEl from '../apiServises/auth/auth.model.js';
import { accessOfUser } from '../apiServises/access/access.session.js';

export default async function addCredentials(req, res, next) {
    try {
        const user = req.credentialForUser;

        const documentReport = await SMU_MODEl.findOne({ idUser: user._id });
       
        const sessionId = `${user._id}-${new Date().getTime()}`;
        req.session.name = `${user.name} ${user.surName}`;
        req.session.admin = user.admin;
        req.session.super = user.super;
        req.session.userId = user._id;
        req.session.idSession = sessionId;
        req.session.lastActivity = new Date().getTime();
        req.session.dataUser = user;


        if (documentReport) req.session.dataUser.activity = documentReport;

        // `access` = qué locales ve, con sus franquicias y locales ya relacionados (access.session.js). Si no se puede
        // leer, se entra igual: la app lo vuelve a pedir con /auth/isAuth
        let access = null;
        try { access = await accessOfUser(user._id); }
        catch (error) { console.log('[access] no se pudo leer el acceso al entrar', error); }
        return res.status(200).json({ ...user, access });
    }
    catch(error){
        console.log(error);
    }

}