// ══════════════════════════════════════════════════════════════════════
// QUÉ LOCALES VE CADA USUARIO (user.access) — funciones puras
// ══════════════════════════════════════════════════════════════════════
// Lo asigna un administrador desde Client365 (en el local o en la franquicia) y lo hace cumplir la API en lo que lee
// insights365, con la sesión de la cookie: el permiso se lee de la base en cada petición (loadAccess), no de la foto
// que se guarda al entrar, para que un cambio valga sin cerrar sesión.
//
//   mode 'all'   ve todos los locales. Es lo que tiene todo usuario que no tiene nada asignado (también los de antes
//                de existir el campo): el equipo de Jarvis365 no pierde nada.
//   mode 'only'  ve solo los locales de sus franquicias (`franchises`: la franquicia entera, también los locales que
//                se abran después) y sus locales sueltos (`locals`). Sin ninguno, no ve nada.



// ACCESS_MODES = «cómo puede ver un usuario»
export const ACCESS_MODES = ['all', 'only'];

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).filter(Boolean).map(String))];

// normalizeAccess = «el permiso de un usuario, siempre con la misma forma». Sin campo, o con uno raro, ve todo
export function normalizeAccess(access) {
    if (!access || access.mode !== 'only') return { mode: 'all', franchises: [], locals: [] };
    return { mode: 'only', franchises: ids(access.franchises), locals: ids(access.locals) };
}

// localFilterOf = «qué locales puede ver, como filtro de Mongo sobre Local». null es «todos»; con 'only' y nada
// asignado, un filtro que no encuentra ninguno
export function localFilterOf(access) {
    const { mode, franchises, locals } = normalizeAccess(access);
    if (mode === 'all') return null;
    return { $or: [{ _id: { $in: locals } }, { 'franchiseReference.franchise': { $in: franchises } }] };
}

// franchiseOf = «el _id de la franquicia de un local», poblado o no
const franchiseOf = (local) => {
    const reference = local?.franchiseReference?.franchise;
    return reference ? String(reference._id ?? reference) : null;
};

// canSeeLocal = «este usuario puede ver este local» (un local con _id y franchiseReference)
export function canSeeLocal(access, local) {
    const { mode, franchises, locals } = normalizeAccess(access);
    if (mode === 'all') return true;
    if (!local) return false;
    if (locals.includes(String(local._id))) return true;
    const franchise = franchiseOf(local);
    return franchise !== null && franchises.includes(franchise);
}

// grantOf = «cómo ve un usuario un local»: 'local' (asignado suelto), 'franchise' (por su franquicia), o null si no
// lo ve por ninguna de las dos. Con 'all' no hay asignación: null también
export function grantOf(access, local) {
    const { mode, franchises, locals } = normalizeAccess(access);
    if (mode === 'all' || !local) return null;
    if (locals.includes(String(local._id))) return 'local';
    const franchise = franchiseOf(local);
    return franchise !== null && franchises.includes(franchise) ? 'franchise' : null;
}

// withItem = «el permiso con un local o una franquicia más». Dar algo a quien veía todo lo pasa a 'only': desde ese
// momento ve solo lo que se le asigne
export function withItem(access, kind, id) {
    const current = normalizeAccess(access);
    const key = kind === 'franchise' ? 'franchises' : 'locals';
    const base = current.mode === 'all' ? { mode: 'only', franchises: [], locals: [] } : current;
    return { ...base, [key]: ids([...base[key], id]) };
}

// withoutItem = «el permiso sin ese local o esa franquicia». Sigue en 'only' aunque quede vacío: quitarle lo último a
// alguien no puede darle de golpe todos los locales
export function withoutItem(access, kind, id) {
    const current = normalizeAccess(access);
    if (current.mode === 'all') return current;
    const key = kind === 'franchise' ? 'franchises' : 'locals';
    return { ...current, [key]: current[key].filter(item => item !== String(id)) };
}

// insightsScope = «qué locales enseña insights365 a quien entra». insights365 es el portal de los clientes, así que
// ahí «sin nada asignado» no puede ser «todo», como en Client365:
//   'assigned'  tiene accesos ('only'): sus franquicias y sus locales sueltos, nada más (si se le quitó todo, nada)
//   'staff'     sin restricción y es administrador o super, o no hay usuario (el propio servidor): todos, para soporte
//   'none'      sin restricción y no es del equipo: ninguno, hasta que un administrador le asigne locales en Client365
// `user` = { admin, super } del usuario de la sesión, o null si la petición no trae usuario.
export function insightsScope(access, user) {
    if (normalizeAccess(access).mode === 'only') return 'assigned';
    if (!user || user.admin === true || user.super === true) return 'staff';
    return 'none';
}
