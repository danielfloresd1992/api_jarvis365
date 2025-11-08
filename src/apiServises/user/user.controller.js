const controller = {};
import bcrypt from 'bcrypt';
import colors from 'colors';
import User from './user.model.js';




controller.login = async (req, res, next) => {
    try{
        const body = req.body;

        if(!body.user || !body.password) return res.status(400).json({ error: 'the name or password property is undefined in the body' })

        const user = await User.findOne({ user: body.user }) ;
        
        if(!user) return res.status(404).json({ error : 'user not found'});


        //if (body.password !== user.password) return res.status(401).json({ error: 'Invalid password'});

        const isMatch = await bcrypt.compare(body.password, user.password);
        if(!isMatch) return res.status(401).json({ error: 'password invalid', message: 'Your account will be blocked after the third attempt.', status: 401 });

        if(user.inabilited) return res.status(403).json({ error: 'Banned User', message: 'El usuario fue inabilitado por el Administrador', status: 401 });
        

        delete user.password;
        delete user.user;
        req.credentialForUser = user;
        
        next();
    }
    catch(err){
        console.log(err);
    }
};



controller.signup = async (req, res) => {
    try{
        const body = req.body;
        const user = await User.findOne({ user: body.user });
        if(user !== null) return res.status(409).send("That user already exisits!");
        const saltRounds = 10; // Número de rondas de sal (puedes ajustar esto según tus necesidades)
        const hashedPassword = await bcrypt.hash(body.password, saltRounds);
        const userNew = new User({
            user: body.user,
            password: hashedPassword,
            name: body.name,
            surName: body.surName,
            //number: body.telCel, DEPRECATED
            mail: body.mail,
            phone: body.phone,
            admin: body.admin,
            super: body.super
        });
        
        const userResult = await userNew.save();
        console.log(colors.bgBlue(`Usuario ${userResult.name} creado con exito`.white));
        return res.status(201).json(user);
        
    }
    catch(err){
        console.log(err);
        return res.status(500);
    }
};



controller.get = async (req, res) => {
    try{
        if (!req.session.idSession) {
            return res.status(401).json({ message: 'Autenticación requerida' });
        }
        const userSessionId = req.session.userId.toString();
        const user = await User.findById( userSessionId ) ;
        user.password = null;
        user.user = null;
        res.status(200).json(user);
    }
    catch(err){
        console.log(err);
        return res.status(500);
    }
};



controller.logout = (req, res) => {
    console.log(colors.bgBlue(`${req.session.name} a cerrado session ${new Date()}`.white));
    req.session.destroy(err => {
        if(err) console.log(err);
        
    });
    return res.send('200 ok');
};


controller.getUser = async (req, res) => {
    try{
        const users = await User.find({}).select('-password -user');
        res.json(users);
    }
    catch(err){
        console.log(err);
        return res.status(500);
    }
}


export default controller;
