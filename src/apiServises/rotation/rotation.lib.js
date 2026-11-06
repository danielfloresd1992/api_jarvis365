import * as yup from 'yup';
import { editableValidate, touchValidate } from './rotation.schema.js';



// ══════════════════════════════════════════════════════════════════════
// CORREGIR UNA ROTACIÓN GUARDADA — lo que no toca la base
// ══════════════════════════════════════════════════════════════════════
// El controlador busca la rotación, llama a applyEdit y la guarda. Lo de en
// medio —qué señala el id, qué se puede corregir ahí y qué cambia de verdad—
// vive aquí, puro, para probarlo sin Mongo (test/rotation.test.ts).



// OPTIONS = «cómo se valida»: todos los errores juntos, y fuera lo que no esté en el esquema
const OPTIONS = { abortEarly: false, stripUnknown: true };



// isTakeOutTable = «la mesa es la de un pedido para llevar»: no es una mesa, es el
// ticket con '#' delante ('#110'). Es la misma regla de Jarvis-express365, que pone
// el ticket en el lugar de la mesa cuando el pedido no la tiene.
export const isTakeOutTable = (tableNumber) => String(tableNumber ?? '').trim().startsWith('#');



// ── UNA ROTACIÓN GUARDADA FUERA DE SU DÍA ──────────────────────────────
// Jarvis-express365 bloquea en Mesas las rotaciones de un día operativo anterior y solo deja guardarlas o
// eliminarlas. Al guardar una, el servidor la marca como abandonada: se quedó sin guardar a tiempo.

// DAY_MS = «los milisegundos de un día»: los días operativos se guardan como medianoche UTC
const DAY_MS = 24 * 3600 * 1000;

// abandonedOf = «la marca de abandonada de una rotación que se guarda», o null si se guarda en su día
// Recibe los dos días operativos ya calculados —el de la rotación y el del momento del guardado, con
// operationalDateOf (dvrFailure.lib.ts)—, quién la guarda y cuándo: así es pura y se prueba sin reloj.
// Una rotación de un día POSTERIOR al del guardado (un reloj mal puesto en el equipo) tampoco se marca.
export function abandonedOf({ operationalDate, savedOperationalDate, savedBy = null, savedAt = new Date() }) {
    const daysLate = Math.round((savedOperationalDate.getTime() - operationalDate.getTime()) / DAY_MS);

    if (!(daysLate >= 1)) return null;
    return { operationalDate, savedOperationalDate, daysLate, savedAt, savedBy };
}



// PEOPLE = «las personas que viajan con cada rotación», con su nombre y su foto: quién la creó, quién hizo
// el último cambio mientras estaba abierta, quién hizo cada corrección y, si se guardó tarde, quién la guardó
// así (Jarvis-express365 las enseña en «Creador», «Edición», el title de la fila de Mesas, la lista de cambios y
// la marca de abandonada). Lo usan el GET, el PUT y los avisos en vivo, para que todos den la misma forma.
export const PEOPLE = [
    { path: 'createdBy', select: 'name surName img' },
    { path: 'updatedBy', select: 'name surName img' },
    { path: 'changes.user', select: 'name surName img' },
    { path: 'abandoned.savedBy', select: 'name surName img' },
];



// ROTATION_METHODS = «lo que se avisa en vivo»: que se guardó una rotación (post) o que se corrigió (put)
export const ROTATION_METHODS = ['post', 'put'];

// rotationEvent = «el nombre del evento en vivo de un local»: '<nombre del local>-post' o
// '<nombre del local>-put' ('Francisca Doral-post'). Con el nombre del local dentro, cada pantalla escucha
// solo el suyo (el nombre es único en Local, y es con lo que Jarvis-express365 pide las rotaciones guardadas).
export const rotationEvent = (method, localName) => `${localName}-${method}`;



// ── MESAS EN VIVO: la rotación abierta que se sube mientras se trabaja ──

// SYNC_ACTIONS = «lo que se avisa de una rotación de Mesas»: que se subió (creada, cambiada o cerrada) o que se quitó
export const SYNC_ACTIONS = ['upsert', 'remove'];

// rotationSyncEvent = «el evento en vivo de las rotaciones de Mesas de un local»: 'rotation-sync:<_id del local>'.
// Por el _id y no por el nombre: lo escuchan Mesas de Jarvis-express365 y las verificaciones de Client365, y las dos
// tienen el _id a mano; un local renombrado no deja a nadie escuchando un evento viejo.
export const rotationSyncEvent = (establishmentId) => `rotation-sync:${establishmentId}`;


// syncOutcome = «qué hacer con una rotación que sube Mesas» (PUT /rotation/client=)
// Recibe la que ya hay (un documento, o null) y la que llega, ya validada (syncValidate). Devuelve:
//   'create'    no existe todavía: se crea
//   'update'    existe, sigue abierta y lo que llega es igual de nuevo o más: se reemplaza (y se cierra, si llega cerrada)
//   'stale'     existe abierta, pero lo que llega cambió ANTES que lo guardado (una subida atrasada de un equipo que
//               estuvo sin internet, o de otro equipo): no se toca, y se responde la del servidor para que la adopte
//   'repeated'  ya está cerrada y lo que llega también la cierra: un reintento del disquete; no se toca
//   'closed'    ya está cerrada y lo que llega la quiere abierta: es de Registros, ya no de Mesas
// Las de antes de existir `status` cuentan como cerradas. Sin clientUpdatedAt en lo que llega, gana lo que llega.
export function syncOutcome(existing, incoming) {
    if (!existing) return 'create';

    if (existing.status !== 'open') return incoming.status === 'closed' ? 'repeated' : 'closed';

    const stored = existing.clientUpdatedAt ? new Date(existing.clientUpdatedAt).getTime() : -Infinity;
    const arriving = incoming.clientUpdatedAt ? new Date(incoming.clientUpdatedAt).getTime() : Infinity;
    return arriving < stored ? 'stale' : 'update';
}


// applySync = «poner en una rotación (un documento de Mongoose) lo que sube Mesas»
// Reemplaza todo lo que se anota —horas, procesos, toques, demoras y avisos…— con lo que llega (ya validado con
// syncValidate) y apunta lo que pone el servidor: su día operativo, quién hizo el cambio (updatedBy) y cuándo cambió
// en el equipo (clientUpdatedAt; sin él, ahora). Si llega cerrada, la cierra: cuándo (closedAt) y la marca de
// abandonada que le toque (null si se cierra en su día). Lo que la identifica —el local, el clientId— y su autor
// no se tocan. Los cálculos con el reloj (operationalDateOf) los hace quien llama: así esto se prueba sin él.
// No guarda, ni anota en `changes`: mientras está abierta se reemplaza entera; el historial de correcciones
// empieza cuando se guarda (applyEdit).
export function applySync(rotation, incoming, { userId, now = new Date(), operationalDate, abandoned = null }) {

    // data = «lo que se anota», sin lo que identifica la rotación ni lo que decide el servidor
    const { establishment, clientId, status, clientUpdatedAt, ...data } = incoming;

    rotation.set({ ...data, operationalDate, status, updatedBy: userId, clientUpdatedAt: clientUpdatedAt ?? now });
    if (status === 'closed') rotation.set({ closedAt: now, abandoned });
    return rotation;
}



// targetOf = «lo que señala un id dentro de una rotación»: la rotación misma,
// uno de sus procesos o uno de sus toques, con su tipo ('rotation' | 'process' |
// 'touch'). null si no es ninguno de ellos.
export function targetOf(rotation, id) {
    if (rotation._id.equals(id)) return { kind: 'rotation', target: rotation };

    for (const kind of ['process', 'touch']) {
        const target = rotation[kind].id(id);
        if (target) return { kind, target };
    }
    return null;
}



// applyEdit = «aplicar una corrección a una rotación (un documento de Mongoose)»
// Valida SOLO las propiedades del body que se pueden corregir en lo señalado
// (editableValidate), las aplica y anota en `changes` una línea por cada una que
// de verdad cambie. No guarda: eso lo hace quien llama, si hubo cambios.
// Devuelve las líneas anotadas ([] si nada cambió). Lanza un ValidationError de
// yup —que asyncHandler responde como 400— si un valor no vale, si el body no
// trae nada que se pueda corregir o si el id no es de esta rotación.
export async function applyEdit(rotation, id, body, userId) {

    const pointed = targetOf(rotation, id);
    if (!pointed) throw new yup.ValidationError('Ese id no es de esta rotación, ni de uno de sus procesos o toques');

    const { kind, target } = pointed;
    const schema = editableValidate[kind];

    // fields = «lo que se pidió corregir»: las propiedades del body que se pueden corregir en eso
    const fields = Object.keys(body ?? {}).filter(field => Object.hasOwn(schema.fields, field));
    if (fields.length === 0) throw new yup.ValidationError('No hay nada que corregir: el body no trae ninguna propiedad que se pueda cambiar');

    const data = await schema.pick(fields).validate(body, OPTIONS);

    // changes = «lo que de verdad cambia», una línea por propiedad
    const changes = fields
        .filter(field => target.get(field) !== data[field])
        .map(field => ({ user: userId, target: id, property: field, oldValue: target.get(field), newValue: data[field] }));

    if (changes.length > 0) {
        target.set(data);
        rotation.changes.push(...changes);
    }

    return changes;
}



// ── AÑADIR Y QUITAR TOQUES DE UNA ROTACIÓN GUARDADA ───────────────────
// applyEdit corrige lo que ya existe; los toques, además, se añaden y se quitan
// después de guardar (la pestaña «Registros» de Jarvis-express365). Cada uno deja
// su línea en `changes`, con la propiedad 'touch' y el toque dicho en una línea
// (touchSummary): de nada al toque al añadirlo, y del toque a nada al quitarlo.
// Ninguna guarda: eso lo hace quien llama.

// touchSummary = «un toque dicho en una línea», para el antes y el después de `changes`: 'Daniel Flores · 10:41:30'
const touchSummary = (touch) => `${touch.name || 'Gerente'} · ${touch.hourTouch || '-'}`;


// addTouchTo = «apuntar un toque nuevo en una rotación guardada» (un documento de Mongoose)
// Se valida como los toques de una rotación al guardarla (touchValidate), y además tiene que traer su hora.
// Sin `createdAt` se toma ahora, el momento real del clic. Devuelve el toque añadido, ya con su _id.
// Lanza un ValidationError —que asyncHandler responde como 400— si el toque no vale o si la rotación es un
// pedido para llevar, que no lleva toques.
export async function addTouchTo(rotation, body, userId) {

    if (isTakeOutTable(rotation.tableNumber)) throw new yup.ValidationError('Un pedido para llevar no lleva toques de gerente');

    const data = await touchValidate.validate(body ?? {}, OPTIONS);
    if (!data.hourTouch) throw new yup.ValidationError('Falta la hora del toque');

    rotation.touch.push({ ...data, createdAt: data.createdAt ?? new Date() });
    const touch = rotation.touch[rotation.touch.length - 1];

    rotation.changes.push({ user: userId, target: touch._id, property: 'touch', oldValue: null, newValue: touchSummary(touch) });
    return touch;
}


// removeTouchFrom = «quitar un toque de una rotación guardada», señalado por su _id
// Devuelve el toque quitado. Lanza un ValidationError (400) si ese toque no es de esta rotación.
export function removeTouchFrom(rotation, touchId, userId) {

    const touch = rotation.touch.id(touchId);
    if (!touch) throw new yup.ValidationError('Ese toque no es de esta rotación');

    rotation.changes.push({ user: userId, target: touch._id, property: 'touch', oldValue: touchSummary(touch), newValue: null });
    rotation.touch.pull(touch._id);
    return touch;
}
