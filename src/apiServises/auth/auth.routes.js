import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import UserModel from '../user/user.model.js';
import bcrypt from 'bcrypt';
import addCredentials from '../../middleware/addCredential.js';
import userController from '../user/user.controller.js';
import { userSchema, userSchemaMinime, userSchemaLegacy } from '../../libs/schema/user.schema.js'
import SMU_MODEl from '../auth/auth.model.js';
import nameApi from '../../libs/name_api.js';
import validateSecurityPass from '../../libs/validation/passwordValidation.js';
import { accessOfUser } from '../access/access.session.js';
import { config } from 'dotenv';


config();



const authRouter = Router();



authRouter.get(`${nameApi}/auth/existPhone=:phone`, async (req, res) => {
    try{
        const { phone } = req.params;
        if(!phone) return res.status(400).json({ error: 'Bad request', status: 400, message: 'the phone property is undefined in the params' });

        const existPhone = await UserModel.exists({ phone });
        return res.status(200).json({ error: null, status: 200, exist: existPhone ? true : false });
    }   
    catch(error){
        console.log(error);
        return res.status(500).json({ error: error.message, status: 500, message: 'server internal' });
    }
});





authRouter.post(`${nameApi}/auth/preUpdate`, async (req, res, next) => {
    try{
        const body = req.body;
        console.log(typeof body);
        if(!body.user || !body.password) return res.status(400).json({ error: 'Bad request', status: 400, message: 'the name or password property is undefined in the body'})
        const user = await UserModel.findOne({ user: body.user }, '+password');
        if(!user) return res.status(404).json({ error: 'Not found', status: 404, message : 'User not found'});
        if (body.password !== user.password) return res.status(400).json({ error: 'Bad request', status: 400, message: 'Invalid password'});
        if(user.inabilited) return res.status(401).json({ error: 'Unauthorized', status: 401, message: 'Banned user'});
        if(user.email)  return res.status(409).json({ error: 'Conflict', status: 409, message: 'The user is updated' });

        delete user.password;
        delete user.user;
        req.credentialForUser = user;
        
        next();
    }
    catch(err){
        console.log(err);
    }
}, addCredentials);




authRouter.get(`${nameApi}/auth/isAuth`, async (req, res) => {

    if (!req.session.dataUser) return res.status(401).json({ error: 'Requered auth', status: 401, message: 'Your session has expired' });

    // Responde lo mismo de siempre (la sesión guardada al entrar) y además `access`, leído de la base en cada llamada y
    // no de esa foto: lo que un administrador asigne en Client365 llega aquí sin volver a entrar. Si no se puede leer,
    // la sesión sigue valiendo, con access null
    const dataUser = typeof req.session.dataUser.toJSON === 'function' ? req.session.dataUser.toJSON() : req.session.dataUser;
    let access = null;
    try { access = await accessOfUser(req.session.userId ?? dataUser?._id); }
    catch (error) { console.log('[access] no se pudo leer el acceso de la sesión', error); }
    return res.status(200).json({ ...dataUser, access });
});




authRouter.get(`${nameApi}/auth/logout`, (req, res) => {

   // if(!req.session.dataUser) return res.status(401).json({ error: 'Requered auth', status: 401, message: 'Your session has expired' });

    req.session.destroy(err => {
        if(err) console.log(err);
        return res.status(200).json({ error: null, message: 'Session detroy', status: 200 });
    });
   
});




authRouter.post(`${nameApi}/auth/login`, asyncHandler(async (req, res, next) => {

    if(req.session?.dataUser){
        return res.status(200).json({ message: 'User already authenticated', result: req.session.user, status: 200 });
    }
    const dateValidate = await userSchemaMinime.validate(req.body);

    const searchedUserByEmail = await UserModel.findOne({ email: dateValidate.email }, '+password');
    if(!searchedUserByEmail) return res.status(404).json({ error: 'User not found', message: `The following email: "${dateValidate.email}"  does not exist` , status: 404 });

    const isMatch = await bcrypt.compare(dateValidate.password, searchedUserByEmail.password);
    if(!isMatch) return res.status(401).json({ error: 'password invalid', message: 'Your account will be blocked after the third attempt.', status: 401 });

    if(searchedUserByEmail.inabilited) return res.status(403).json({ error: 'User banned', message: 'el usuario fue banneado por el administrador', status: 403});

    const userResponse = {...searchedUserByEmail}._doc;
    delete userResponse.password;
    delete userResponse.user;

    // Quien entra por /auth/login (insights365, Client365) recibe además `access`: qué locales ve, con sus franquicias
    // y locales ya relacionados (access.session.js). Va aquí y no en addCredentials, que también usa /user/login
    // (Jarvis-express365) y queda como estaba. Si no se puede leer, se entra igual con access null
    try { userResponse.access = await accessOfUser(userResponse._id); }
    catch (error) {
        console.log('[access] no se pudo leer el acceso al entrar', error);
        userResponse.access = null;
    }
    req.credentialForUser = userResponse;

    next();
}), addCredentials);





authRouter.post(`${nameApi}/auth/singin`, asyncHandler(async (req, res) => {
    // El registro es anónimo: solo entra lo que declara el esquema. Sin
    // stripUnknown, yup deja pasar cualquier clave y un body con
    // `admin: true, super: true` creaba una cuenta con todos los permisos.
    const dateValidate = await userSchema.validate(req.body, { stripUnknown: true });
    const findEmail = await UserModel.findOne({ email: dateValidate.email });
    if(findEmail) return res.status(409).json({ error: 'Conflict', status: 409, message: 'The email is not available.' });

    const findPhone = await UserModel.findOne({ phone: dateValidate.phone });
    if(findPhone) return res.status(409).json({ error: 'Conflict', status: 409, message: 'The phone number is not available.' });

  
    if(!validateSecurityPass(dateValidate.password).pass) return res.status(400).json({ error: 'Bad request', status: 400, message: 'The password entered does not meet the requirements!' });
    dateValidate.password = await bcrypt.hash(dateValidate.password, 10);


    // Los permisos los da un administrador después, nunca el propio registro.
    const newUser = new UserModel({ ...dateValidate, admin: false, super: false });
    const resultCreateUser = await newUser.save();

    const resData = { ...resultCreateUser._doc }
    
    
    delete resData.password;
    delete resData._id;
    delete resData.user;
    return res.json({ data: resData, status: 200, message: "User registered successfully"});
}));




authRouter.put(`${nameApi}/auth/update-user-data`, asyncHandler(async (req, res) => {
    const { user, password, newPassword, email, phone } = await userSchemaLegacy.validate(req.body);
   

    const userExists = await UserModel.findOne({ user: user }, '+password');

    if(!userExists) return res.status(404).json({ error: 'User not found', status: 404, message: 'the susuary does not exist!' });

    if(userExists.email) return res.status(403).json ({ error: 'Forbidden', status: '403', message: 'the user is already updated' });

    if(password !== userExists.password)  return res.status(401).json({ error: 'Unauthorized', status: 404, message: 'Password invalid!' });

    if(!validateSecurityPass(newPassword).pass) return res.status(400).json({ error: 'Bad request', status: 400, message: 'The password entered does not meet the requirements!' });
    
    const emailExists = await UserModel.exists({ email });
    if(emailExists) return res.status(409).json({ error: 'Conflict', status: 409, message: 'The email is not available.' });

    const phoneExists = await UserModel.exists({ phone });
    if(phoneExists) return res.status(409).json({ error: 'Conflict', status: 409, message: 'The phone number is not available.' });

    const passwordEncript = await bcrypt.hash(newPassword, 10);

    userExists.email = email;
    userExists.phone = phone;
    userExists.password = passwordEncript
    const saveDateUser = await userExists.save();
    delete saveDateUser.password;
    return res.status(200).json({ error: null, status: '200', result: userExists, messsage: 'User updated successfully' });
}));





export { authRouter }; 