import { Router } from 'express';
import UserModel from '../user/user.model.js';
import bcrypt from 'bcrypt';
import addCredentials from '../../middleware/addCredential.js';
import userController from '../user/user.controller.js';
import { userSchema, userSchemaMinime, userSchemaLegacy } from '../../libs/schema/user.schema.js'
import SMU_MODEl from '../auth/auth.model.js';
import nameApi from '../../libs/name_api.js';
import validateSecurityPass from '../../libs/validation/passwordValidation.js';
import { config } from 'dotenv';


config();



const authRouter = Router();



authRouter.post(`${nameApi}/auth/preUpdate`, async (req, res, next) => {
    try{
        const body = req.body;
        if(!body.user || !body.password) return res.status(400).json({ error: 'Bad request', status: 400, message: 'the name or password property is undefined in the body'})
        const user = await UserModel.findOne({ user: body.user }) ;
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




authRouter.get(`${nameApi}/auth/isAuth`, (req, res) => {
    
    if(req.session.dataUser) return res.status(200).json(req.session.dataUser);
    else res.status(401).json({ error: 'Requered auth', status: 401, message: 'Your session has expired' });
});




authRouter.get(`${nameApi}/auth/logout`, (req, res) => {

   // if(!req.session.dataUser) return res.status(401).json({ error: 'Requered auth', status: 401, message: 'Your session has expired' });

    req.session.destroy(err => {
        if(err) console.log(err);
        return res.status(200).json({ error: null, message: 'Session detroy', status: 200 });
    });
   
});




authRouter.post(`${nameApi}/auth/login`, async (req, res, next) => {
    try{

        if(req.session?.dataUser){
            return res.status(200).json({ message: 'User already authenticated', result: req.session.user, status: 200 });
        }
        const dateValidate = await userSchemaMinime.validate(req.body);

        const searchedUserByEmail = await UserModel.findOne({ email: dateValidate.email });
        if(!searchedUserByEmail) return res.status(404).json({ error: 'User not found', message: `The following email: "${dateValidate.email}"  does not exist` , status: 404 });

        const isMatch = await bcrypt.compare(dateValidate.password, searchedUserByEmail.password);
        if(!isMatch) return res.status(401).json({ error: 'password invalid', message: 'Your account will be blocked after the third attempt.', status: 401 });

        if(searchedUserByEmail.inabilited) return res.status(403).json({ error: 'User banned', message: 'el usuario fue banneado por el administrador', status: 403});

        const userResponse = {...searchedUserByEmail}._doc;
        delete userResponse.password;
        delete userResponse.user;
        req.credentialForUser = userResponse;

        next();
    }
    catch(error){
        if(error.name === 'ValidationError'){
            return res.status(400).json({ error: 'Bad request', message: error.message, status: 400  });
        }
        return res.status(500).json({ error: error.message, message: 'server internal', status: 500 });
    }       
}, addCredentials);





authRouter.post(`${nameApi}/auth/singin`, async (req, res) => {
    try {
        const dateValidate = await userSchema.validate(req.body);
        const findEmail = await UserModel.findOne({ email: dateValidate.email });

        if(findEmail) return res.status(409).json({ error: 'Conflict', status: 409, message: 'The email is not available.' });

      
        if(!validateSecurityPass(dateValidate.password).pass) return res.status(400).json({ error: 'Bad request', status: 400, message: 'The password entered does not meet the requirements!' });
        dateValidate.password = await bcrypt.hash(dateValidate.password, 10);


        const newUser = new UserModel(dateValidate);
        const resultCreateUser = await newUser.save();

        const resData = { ...resultCreateUser._doc }
        
        
        delete resData.password;
        delete resData._id;
        delete resData.user;
        return res.json({ data: resData, status: 200, message: "User registered successfully"});
    } 
    catch(error){
        if(error.name === 'ValidationError'){
            return res.status(400).json({ error: error.message, stautus: 400, message: 'Bad request' });
        }
        return res.status(500).json({ error: error.message, status: 500, message: 'server internal' });
    }       
});




authRouter.put(`${nameApi}/auth/update-user-data`, async (req, res) => {
    try {
        console.log(req.body);
        const { user, password, newPassword, email, phone } = await userSchemaLegacy.validate(req.body);
       

        const userExists = await UserModel.findOne({ user: user });

        if(!userExists) return res.status(404).json({ error: 'User not found', status: 404, message: 'the susuary does not exist!' });

        if(userExists.email) return res.status(403).json ({ error: 'Forbidden', status: '403', message: 'the user is already updated' });

        if(password !== userExists.password)  return res.status(401).json({ error: 'Unauthorized', status: 404, message: 'Password invalid!' });

        if(!validateSecurityPass(newPassword).pass) return res.status(400).json({ error: 'Bad request', status: 400, message: 'The password entered does not meet the requirements!' });
        
        const emailExists =  await UserModel.exists({ email });
        if(emailExists) return res.status(409).json({ error: 'Conflict', status: 409, message: 'The email is not available.' });
      
        const passwordEncript = await bcrypt.hash(newPassword, 10);
    
        userExists.email = email;
        userExists.phone = phone;
        userExists.password = passwordEncript
        const saveDateUser = await userExists.save();
        delete saveDateUser.password;
        return res.status(200).json({ error: null, status: '200', result: userExists, messsage: 'User updated successfully' });
    } 
    catch(error){
        console.log(error);
        if(error.name === 'ValidationError'){
            return res.status(400).json({ error: error.message, stautus: 400, message: 'Bad request' });
        }
        return res.status(500).json({ error: error.message, status: 500, message: 'server internal' });
    }       
});





export { authRouter }; 