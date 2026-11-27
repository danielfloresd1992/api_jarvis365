import UserModel from '../user/user.model.js';
import '../local/local.model.js';
import '../franchise/franchise.model.js';
import { insightsScope } from './access.lib.js';

// ══════════════════════════════════════════════════════════════════════
// EL ACCESO DE UN USUARIO, PARA SU SESIÓN
// ══════════════════════════════════════════════════════════════════════
// Lo que devuelven /auth/login y /auth/isAuth en `access`: qué ve ese usuario, con los nombres de sus franquicias y
// sus locales ya relacionados (user.access → Franchise y Local), para que la app (insights365) sepa desde la sesión
// qué es suyo y luego pida la información de esos establecimientos.
//
//   {
//     mode:       'all' | 'only'                 sin restricción, o solo lo asignado
//     scope:      'assigned' | 'staff' | 'none'  qué le enseña insights365 (insightsScope en access.lib.js)
//     franchises: [{ _id, name }]                franquicias enteras asignadas
//     locals:     [{ _id, name, franchise, franchiseName }]   locales sueltos asignados
//     updatedAt:  fecha del último cambio, o null
//   }
//
// Se lee de la base en cada llamada, no de la foto que la sesión guarda al entrar: así un cambio que haga un
// administrador en Client365 vale en el siguiente /auth/isAuth, sin volver a entrar. null si no hay usuario.

const idOf = (value) => (value?._id ?? value ? String(value?._id ?? value) : null);

export async function accessOfUser(userId) {
    if (!userId) return null;
    const user = await UserModel.findById(userId)
        .select('access admin super')
        .populate({ path: 'access.franchises', select: '_id name' })
        .populate({ path: 'access.locals', select: '_id name franchiseReference' })
        .lean();
    if (!user) return null;

    const mode = user.access?.mode === 'only' ? 'only' : 'all';
    // Una referencia a algo borrado llega como null al poblar: se quita
    const franchises = mode === 'only' ? (user.access?.franchises ?? []).filter(Boolean) : [];
    const locals = mode === 'only' ? (user.access?.locals ?? []).filter(Boolean) : [];

    return {
        mode,
        scope: insightsScope({ mode }, user),
        franchises: franchises.map(franchise => ({ _id: idOf(franchise), name: franchise.name ?? null })),
        locals: locals.map(local => ({
            _id: idOf(local),
            name: local.name ?? null,
            franchise: idOf(local.franchiseReference?.franchise),
            franchiseName: local.franchiseReference?.name_franchise ?? null,
        })),
        updatedAt: user.access?.updatedAt ?? null,
    };
}
