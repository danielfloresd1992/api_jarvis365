import { io } from '../../services/socket/io.js';
import RotationModel from './rotation.model.js';
import LocalModel from '../local/local.model.js';
import { PEOPLE, ROTATION_METHODS, rotationEvent, SYNC_ACTIONS, rotationSyncEvent } from './rotation.lib.js';



// ══════════════════════════════════════════════════════════════════════
// LAS ROTACIONES EN VIVO
// ══════════════════════════════════════════════════════════════════════
// Cuando alguien guarda una rotación (POST) o corrige una guardada (PUT), los
// demás que tienen abierta la pestaña «Registros» de ese local la ven al
// momento, sin recargar. El evento lleva el nombre del local (rotationEvent):
//
//     '<nombre del local>-post'   la rotación nueva            ('Francisca Doral-post')
//     '<nombre del local>-put'    la rotación entera, corregida ('Francisca Doral-put')
//
// El payload es la rotación con la MISMA forma que un documento del GET
// —con PEOPLE y en objeto plano—, así la pantalla la mete en su tabla tal cual.
//
// Va a todos los clientes (io.emit), como el resto de avisos de esta API: no
// hay salas por local, y cada pantalla escucha solo el evento de su local.



// emitRotation = «avisar en vivo de una rotación guardada o corregida»
// Recibe: method ('post' | 'put', ROTATION_METHODS) y rotation (el documento recién guardado).
// NUNCA lanza: el aviso es un extra, y si falla la rotación ya está guardada. Por eso los endpoints la
// llaman sin esperarla, después de guardar.
export async function emitRotation(method, rotation) {
    try {
        if (!ROTATION_METHODS.includes(method)) throw new Error(`método desconocido «${method}»`);

        // local = «el establecimiento de la rotación», por su nombre, que va en el evento
        // payload = «la rotación como la devuelve el GET»: se vuelve a leer para no tocar la que responde el endpoint
        const [local, payload] = await Promise.all([
            LocalModel.findById(rotation.establishment).select('name').lean(),
            RotationModel.findById(rotation._id).populate(PEOPLE).lean(),
        ]);

        //  Una abierta no se avisa a Registros: es de Mesas, y Mesas tiene su propio aviso (emitRotationSync)
        if (!local?.name || !payload || payload.status === 'open') return;

        io.emit(rotationEvent(method, local.name), payload);
    }
    catch (error) {
        console.log(`[rotation] No se pudo avisar en vivo (${method}):`, error?.message ?? error);
    }
}



// ── MESAS EN VIVO ─────────────────────────────────────────────────────
// Cada vez que Mesas sube una rotación (PUT /rotation/client=) o quita una abierta (DELETE), los demás equipos
// de ese local —otra Mesas, las verificaciones de Client365— lo ven al momento, con quién la creó y quién hizo
// el último cambio:
//
//     'rotation-sync:<_id del local>'   { action: 'upsert', clientId, rotation }   la rotación entera, como el GET
//                                       { action: 'remove', clientId }             se quitó de Mesas sin guardar
//
// La que se cierra con el disquete llega como 'upsert' con status 'closed', y ADEMÁS como '<local>-post', el aviso
// de siempre de una rotación guardada, para que la pestaña «Registros» la meta en su lista sin cambiar nada.
// El equipo que la subió también recibe su propio aviso: lo reconoce por clientUpdatedAt y no hace nada.

// emitRotationSync = «avisar en vivo de una rotación de Mesas»
// Recibe: action ('upsert' | 'remove', SYNC_ACTIONS) y { establishment, clientId, rotationId } (rotationId, el
// _id del documento, solo con 'upsert'). NUNCA lanza, como emitRotation: se llama sin esperarla, después de guardar.
export async function emitRotationSync(action, { establishment, clientId, rotationId = null }) {
    try {
        if (!SYNC_ACTIONS.includes(action)) throw new Error(`acción desconocida «${action}»`);

        const event = rotationSyncEvent(establishment);
        if (action === 'remove') {
            io.emit(event, { action, clientId });
            return;
        }

        // rotation = «la rotación como la devuelve el GET», con quién la creó y quién la cambió (PEOPLE)
        const rotation = await RotationModel.findById(rotationId).populate(PEOPLE).lean();
        if (!rotation) return;

        io.emit(event, { action, clientId, rotation });
    }
    catch (error) {
        console.log(`[rotation] No se pudo avisar en vivo a Mesas (${action}):`, error?.message ?? error);
    }
}
