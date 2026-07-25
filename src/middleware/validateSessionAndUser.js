import colors from 'colors';
import { config } from 'dotenv';
config();



const SHOW_CONSOLE = !(process.env.NODE_ENV === 'development');



function validateSession(req, res, next){
    const userAgent = req.get('User-Agent');
    const ip = req.ip;


    if (userAgent === 'node' && (`${ip}` === process.env.SERVER_JARVIS365DEV || `${ip}` === process.env.SERVER_JARVIS365PROD)){
        if(SHOW_CONSOLE) console.log(colors.bgBlue(`Text accessed a resource\norigen: ${req.ip}\nrouter: ${req.originalUrl}\ndate: ${new Date()}\norigin: ${req.headers.origin}\n`.white));
    }

    else {
        if (!req.session.name) {
            if(SHOW_CONSOLE) console.log(colors.bgRed(`unused has requested a resource without signing in\nrouter: ${req.originalUrl}\norigen: ${req.ip}\ndate: ${new Date()}\n`.white));
            return res.status(401).json({ error: 'Unauthorized', status: 401, message: 'Unauthorized, you must log in' });
        }
        else {
            if(SHOW_CONSOLE) console.log(colors.bgBlue(`The user ${req.session.name} accessed a resource\norigen: ${req.ip}\nrouter: ${req.originalUrl}\ndate: ${new Date()}\n`.white));
        }
    }
    next();
}




function validateSessionAndUserSuper(req, res, next) {
    const userAgent = req.get('User-Agent');
    const ip = req.ip;
    const port = req.socket.remotePort;
    

    if (userAgent === 'node' && (`${ip}:${port}` === process.env.SERVER_JARVIS365DEV || `${ip}:${port}` === process.env.SERVER_JARVIS365PROD)){
        if(SHOW_CONSOLE)  console.log(colors.bgBlue(`Text accessed a resource\norigen: ${req.ip}\nrouter: ${req.originalUrl}\ndate: ${new Date()}\norigin: ${req.headers.origin}\n`.white));
    }
    else {
        if (!req.session.name) {
            if(SHOW_CONSOLE) console.log(colors.bgRed(`unused has requested a resource without signing in\nrouter: ${req.originalUrl}\norigen: ${req.ip}\ndate: ${new Date()}\n`.white));
            return res.status(401).json({ error: 'Unauthorized', status: 401, message: 'Unauthorized, you must log in' });
        }
        if (!req.session.super || !req.session.admin) {
            if(SHOW_CONSOLE) console.log(colors.bgRed(`The user ${req.session.name} accessed a resource without authorization and was denied\norigen: ${req.ip}\nrouter: ${req.originalUrl}\ndate: ${new Date()}\n`.white));
            return res.status(403).json({ error: 'Forbidden', status: 403, message: 'Forbidden, unprivileged user' });
        }

        if(SHOW_CONSOLE) console.log(colors.bgBlue(`The user ${req.session.name} accessed a resource\norigen: ${req.ip}\nrouter: ${req.originalUrl}\ndate: ${new Date()}\n`.white));
    }
    next();
}



function extendSession(req, res, next){
    try{     
        const userAgent = req.get('User-Agent');
        const ip = req.ip;
        const port = req.socket.remotePort;

        if (req.get('source-application') === 'Reporte Express' || userAgent === 'node' && (`${ip}:${port}` === process.env.SERVER_JARVIS365DEV || `${ip}:${port}` === process.env.SERVER_JARVIS365PROD)){
            if(SHOW_CONSOLE) console.log(colors.bgBlue(`Text accessed a resource\norigen: ${req.ip}\nrouter: ${req.originalUrl}\ndate: ${new Date()}\norigin: ${req.headers.origin}\n`.white));
            next();
        }

        else {
            if (req.session.idSession && process.env.NODE_ENV !== 'development') {
                const dateNow = new Date().getTime();
                const lastActivity = req.session.lastActivity;
                const timeLimit = 100300000;
    
                if(dateNow - lastActivity > timeLimit){
                    if(SHOW_CONSOLE) console.log(colors.bgRed(`Session caducada ${req.session.name}\n`.white));
                    req.session.destroy();
                    return res.status(401).json({ message: 'Your session has expired', status: 401, error: 'Unauthorized' });
                }
                else {
                    req.session.lastActivity = new Date().getTime();
                    if(SHOW_CONSOLE) console.log(colors.bgBlue(`session extended to 5 min ${req.session.name}\napp:${req.get('source-application')}`.white));
    
                }
            }
            next();
        }
    }
    catch(error){
        console.log(error); 
        next()
    }
}




// Requiere que el usuario tenga 'super' === true. La propiedad se evalúa desde
// req.session.super, que addCredential.js setea en el login (req.session.super =
// user.super). Devuelve 401 si no hay sesión y 403 (con {status, error, message})
// si el usuario NO es super. A diferencia de validateSessionAndUserSuper, aquí
// NO se exige 'admin': la condición es únicamente 'super'.
function validateSuperUser(req, res, next) {
    const userAgent = req.get('User-Agent');
    const ip = req.ip;
    const port = req.socket.remotePort;

    // Bypass servidor-a-servidor (mismo patrón que los otros middlewares)
    if (userAgent === 'node' && (`${ip}:${port}` === process.env.SERVER_JARVIS365DEV || `${ip}:${port}` === process.env.SERVER_JARVIS365PROD)) {
        return next();
    }

    if (!req.session.name) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'No autenticado: debe iniciar sesión' });
    }

    if (req.session.super !== true) {
        if (SHOW_CONSOLE) console.log(colors.bgRed(`El usuario ${req.session.name} intentó una acción de super sin permiso\nrouter: ${req.originalUrl}\norigen: ${req.ip}\ndate: ${new Date()}\n`.white));
        return res.status(403).json({ status: 403, error: 'Forbidden', message: 'Se requiere permiso de super usuario para esta acción' });
    }

    next();
}



// Requiere que el usuario tenga 'admin' === true (req.session.admin, seteado en
// el login por addCredential). 401 sin sesión; 403 con {status, error, message}
// si no es admin. A diferencia de validateSessionAndUserSuper, NO exige 'super':
// la política es admin → modifica propiedades, super → deja comentarios.
function validateAdminUser(req, res, next) {
    const userAgent = req.get('User-Agent');
    const ip = req.ip;
    const port = req.socket.remotePort;

    // Bypass servidor-a-servidor (mismo patrón que los otros middlewares)
    if (userAgent === 'node' && (`${ip}:${port}` === process.env.SERVER_JARVIS365DEV || `${ip}:${port}` === process.env.SERVER_JARVIS365PROD)) {
        return next();
    }

    if (!req.session.name) {
        return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'No autenticado: debe iniciar sesión' });
    }

    if (req.session.admin !== true) {
        if (SHOW_CONSOLE) console.log(colors.bgRed(`El usuario ${req.session.name} intentó una acción de admin sin permiso\nrouter: ${req.originalUrl}\norigen: ${req.ip}\ndate: ${new Date()}\n`.white));
        return res.status(403).json({ status: 403, error: 'Forbidden', message: 'Se requiere permiso de administrador para esta acción' });
    }

    next();
}



export { validateSession, validateSessionAndUserSuper, extendSession, validateSuperUser, validateAdminUser };