import SMU_MODEl from '../apiServises/auth/auth.model.js';

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


        return res.status(200).json(user);
    }
    catch(error){
        console.log(error);
    }

}