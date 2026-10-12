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



// PEOPLE = «las personas que viajan con cada rotación», con su nombre y su foto: quién la guardó y
// quién hizo cada corrección (Jarvis-express365 las enseña en «Creador», «Edición» y la lista de
// cambios). Lo usan el GET, el PUT y el aviso en vivo, para que las tres den la misma forma.
export const PEOPLE = [
    { path: 'createdBy', select: 'name surName img' },
    { path: 'changes.user', select: 'name surName img' },
];



// ROTATION_METHODS = «lo que se avisa en vivo»: que se guardó una rotación (post) o que se corrigió (put)
export const ROTATION_METHODS = ['post', 'put'];

// rotationEvent = «el nombre del evento en vivo de un local»: '<nombre del local>-post' o
// '<nombre del local>-put' ('Francisca Doral-post'). Con el nombre del local dentro, cada pantalla escucha
// solo el suyo (el nombre es único en Local, y es con lo que Jarvis-express365 pide las rotaciones guardadas).
export const rotationEvent = (method, localName) => `${localName}-${method}`;



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
