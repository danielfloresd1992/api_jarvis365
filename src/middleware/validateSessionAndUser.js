import colors from 'colors';
import { config } from 'dotenv';
import AttendanceModel from '../apiServises/user/attendance.model.js';
import { getOperationalDay } from '../services/noveltyReport/noveltyReport.service.js';
import ApiKeyModel from '../apiServises/apiKey/apiKey.model.js';
import { parsearApiKey, secretoCoincide } from '../apiServises/apiKey/apiKey.lib.js';
import appConfig from '../config/index.js';
config();



const SHOW_CONSOLE = !(process.env.NODE_ENV === 'development');



// ══════════════════════════════════════════════════════════════════════
// LA SEGUNDA FORMA DE ENTRAR: UNA API KEY
// ══════════════════════════════════════════════════════════════════════
// La sesión con cookie es para PERSONAS con un navegador. Un programa —el
// asistente de IA, un panel, un script— no tiene dónde guardar una cookie ni a
// quién pedirle la contraseña, así que necesita otra puerta.
//
// Esta función NO decide nada por su cuenta: responde «esta petición trae una
// llave válida, o no». Quien decide es el middleware que la llama.
//
// Devuelve la llave si es buena, y `null` en cualquier otro caso. Nunca lanza
// por una cabecera rara: una llave mal escrita es un 401, no un 500.
async function autenticarPorApiKey(req) {

    // Se aceptan las dos cabeceras. `Authorization: Bearer …` es la estándar y
    // la que usa cualquier cliente HTTP serio; `x-api-key` está porque hay
    // herramientas que solo saben mandar ésa.
    const cabecera = req.get('authorization') || req.get('x-api-key');

    const partes = parsearApiKey(cabecera);

    // Sin una cabecera CON FORMA DE LLAVE no se toca la base. Esto es lo que
    // hace que abrir esta puerta no cambie en nada el camino de las sesiones:
    // una petición de las de siempre sale por acá sin una consulta extra.
    if (!partes) return null;

    const llave = await ApiKeyModel.findOne({ keyId: partes.keyId }).select('+secretHash');

    if (!llave) return null;
    if (llave.active !== true) return null;
    if (llave.expiresAt && llave.expiresAt.getTime() <= Date.now()) return null;

    if (!secretoCoincide(partes.secreto, llave.secretHash, appConfig.API_KEY_SECRET)) return null;

    // El rastro de uso se escribe SIN esperarlo. Es información para auditar, no
    // una condición para entrar: si esa escritura falla o tarda, la petición
    // legítima no tiene por qué pagarlo.
    ApiKeyModel.updateOne(
        { _id: llave._id },
        { $set: { lastUsedAt: new Date() }, $inc: { usageCount: 1 } },
    ).catch(error => console.log(colors.red(`[api-key] no se pudo registrar el uso: ${error?.message ?? error}`)));

    return llave;
}


function validateSession(req, res, next){
    const userAgent = req.get('User-Agent');
    const ip = req.ip;


    if (userAgent === 'node' && (`${ip}` === process.env.SERVER_JARVIS365DEV || `${ip}` === process.env.SERVER_JARVIS365PROD)){
        if(SHOW_CONSOLE) console.log(colors.bgBlue(`Text accessed a resource\norigen: ${req.ip}\nrouter: ${req.originalUrl}\ndate: ${new Date()}\norigin: ${req.headers.origin}\n`.white));
        return next();
    }

    // La sesión manda y se comprueba PRIMERO: es el camino del 99% de las
    // peticiones —los frontends— y sale de acá sin tocar la base, exactamente
    // igual que antes de que existieran las llaves.
    if (req.session.name) {
        if(SHOW_CONSOLE) console.log(colors.bgBlue(`The user ${req.session.name} accessed a resource\norigen: ${req.ip}\nrouter: ${req.originalUrl}\ndate: ${new Date()}\n`.white));
        return next();
    }

    // Sin sesión se prueba con la llave. Acá antes se devolvía el 401 directo;
    // la única diferencia es que ahora, si trae una llave buena, pasa.
    autenticarPorApiKey(req)
        .then(llave => {
            if (llave) {
                // Queda a mano para quien lo necesite: saber que quien pregunta
                // es un programa, cuál, y qué se le permite.
                req.apiKey = {
                    id: String(llave._id),
                    keyId: llave.keyId,
                    name: llave.name,
                    scopes: llave.scopes ?? [],
                };
                if(SHOW_CONSOLE) console.log(colors.bgBlue(`La integración «${llave.name}» accedió a un recurso\norigen: ${req.ip}\nrouter: ${req.originalUrl}\ndate: ${new Date()}\n`.white));
                return next();
            }

            if(SHOW_CONSOLE) console.log(colors.bgRed(`unused has requested a resource without signing in\nrouter: ${req.originalUrl}\norigen: ${req.ip}\ndate: ${new Date()}\n`.white));
            return res.status(401).json({ error: 'Unauthorized', status: 401, message: 'Unauthorized, you must log in' });
        })
        .catch(error => {
            // Solo se llega acá si la base falló mientras se verificaba una
            // llave. No se puede afirmar que quien llama no tenga permiso, así
            // que se dice la verdad: no se pudo comprobar.
            console.log(colors.red(`[api-key] fallo la verificacion: ${error?.message ?? error}`));
            return res.status(503).json({
                status: 503,
                error: 'Service Unavailable',
                message: 'No se pudo verificar la credencial en este momento.',
            });
        });
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



// Requiere que el usuario tenga un ROL DEL DÍA en la asistencia del día
// operativo ACTUAL (08:00 → 07:00, zona del monitoreo): encargado de turno
// (onDuty) o auxiliar (auxiliary). Se usa el día operativo y no el civil para
// que el turno nocturno siga autorizado después de medianoche con la
// designación de ayer. 401 sin sesión; 403 con {status, error, message} si el
// usuario no tiene ninguno de los dos roles hoy. Mismo bypass
// servidor-a-servidor que el resto de los middlewares.
async function validateDayRoleUser(req, res, next) {
    try {
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

        // Fecha civil (medianoche UTC) del inicio del día operativo — el mismo
        // formato con el que attendance guarda `date`.
        // REGLA OFICIAL: los roles del día valen hasta las 07:59:59 — a las
        // 08:00 arranca el día operativo siguiente y la designación anterior
        // deja de aplicar. El nocturno conserva su rol toda la madrugada.
        const { start } = getOperationalDay();
        const civilDate = new Date(Date.UTC(start.year(), start.month(), start.date()));

        const record = await AttendanceModel.findOne({ userId: req.session.userId, date: civilDate })
            .select('onDuty auxiliary')
            .lean();

        if (record?.onDuty === true || record?.auxiliary === true) return next();

        if (SHOW_CONSOLE) console.log(colors.bgRed(`El usuario ${req.session.name} intentó una acción reservada al rol del día sin designación\nrouter: ${req.originalUrl}\norigen: ${req.ip}\ndate: ${new Date()}\n`.white));
        return res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: 'Acción reservada al encargado de turno o al auxiliar del día. Pide que te designen en el horario de hoy.'
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal', message: 'No se pudo verificar el rol del día.' });
    }
}



// ══════════════════════════════════════════════════════════════════════
// ADMINISTRADOR CON SESIÓN, Y NADA MÁS
// ══════════════════════════════════════════════════════════════════════
// El middleware que protege la gestión de las API keys: crearlas, listarlas y
// revocarlas. Exige una PERSONA administradora con sesión iniciada.
//
// Lo que este middleware NO hace es lo importante, y por eso existe separado en
// lugar de reutilizar `validateAdminUser`:
//
//   1. NO acepta API keys. Una llave no puede fabricar otra llave. Si pudiera,
//      quien se robara una podría emitirse las que quisiera y sobrevivir a que
//      revoquen la original — el robo dejaría de tener vuelta atrás. Con esto,
//      revocar la llave robada termina el incidente.
//
//   2. NO tiene el atajo servidor-a-servidor que sí tienen los demás. Ese atajo
//      se apoya en `User-Agent: node`, que cualquiera puede escribir en una
//      cabecera, y en una IP. Para leer novedades es un riesgo tolerable;
//      para emitir credenciales, no.
//
// Es a propósito el middleware más estricto del archivo. Todo lo que protege
// tiene la forma de «esto le abre la puerta a alguien más».
function validateAdminSessionOnly(req, res, next) {

    if (!req.session.name) {
        if (SHOW_CONSOLE) console.log(colors.bgRed(`Alguien intento gestionar integraciones sin sesion
router: ${req.originalUrl}
origen: ${req.ip}
date: ${new Date()}
`.white));
        return res.status(401).json({
            status: 401,
            error: 'Unauthorized',
            message: 'No autenticado: debe iniciar sesion como administrador',
        });
    }

    if (req.session.admin !== true) {
        if (SHOW_CONSOLE) console.log(colors.bgRed(`El usuario ${req.session.name} intento gestionar integraciones sin ser admin
router: ${req.originalUrl}
origen: ${req.ip}
date: ${new Date()}
`.white));
        return res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: 'Se requiere permiso de administrador para gestionar integraciones',
        });
    }

    next();
}



export { validateSession, validateSessionAndUserSuper, extendSession, validateSuperUser, validateAdminUser, validateDayRoleUser, validateAdminSessionOnly };