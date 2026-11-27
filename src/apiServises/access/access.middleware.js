import UserModel from '../user/user.model.js';
import LocalModel from '../local/local.model.js';
import { localFilterOf, normalizeAccess } from './access.lib.js';

// loadAccess = «el permiso de quien llama, recién leído de la base», en req.access (normalizeAccess).
// Va DESPUÉS de validateSession. Con la sesión de la cookie (req.session.userId) se lee su user.access en cada
// petición: así un cambio que haga un administrador vale en el acto, sin volver a entrar. Lo que no trae usuario
// (una API key, el propio servidor) ve todo, como hasta ahora.
export async function loadAccess(req, res, next) {
    try {
        const userId = req.session?.userId;
        if (!userId) {
            req.access = normalizeAccess(null);
            return next();
        }
        const user = await UserModel.findById(userId).select('access').lean();
        req.access = normalizeAccess(user?.access);
        return next();
    }
    catch (error) {
        return next(error);
    }
}

// allowedLocalIds = «los _id de los locales que puede ver», como Set de textos; null es «todos»
export async function allowedLocalIds(access) {
    const filter = localFilterOf(access);
    if (!filter) return null;
    const locals = await LocalModel.find(filter).select('_id').lean();
    return new Set(locals.map(local => String(local._id)));
}

// canSeeLocalId = «puede ver el local de ese _id». Vale también el local ya poblado (un `?populate=` del documento)
export async function canSeeLocalId(access, id) {
    const allowed = await allowedLocalIds(access);
    return allowed === null || allowed.has(String(id?._id ?? id));
}

// canSeeLocalName = «puede ver el local de ese nombre» (Local.name es único)
export async function canSeeLocalName(access, name) {
    const filter = localFilterOf(access);
    if (!filter) return true;
    return Boolean(await LocalModel.exists({ $and: [{ name }, filter] }));
}

// FORBIDDEN = «la respuesta a quien pide un local que no puede ver»
export const forbidden = (res) => res.status(403).json({ status: 403, error: 'Forbidden', message: 'No tienes acceso a este establecimiento' });
