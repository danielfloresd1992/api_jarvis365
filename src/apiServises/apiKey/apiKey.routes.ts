import express from 'express';
import { Types } from 'mongoose';
import nameApi from '../../libs/name_api.js';
import { validateAdminSessionOnly } from '../../middleware/validateSessionAndUser.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import ApiKeyModel from './apiKey.model.js';
import { generarApiKey, pistaDeLlave } from './apiKey.lib.js';
import { crearApiKeySchema } from './apiKey.schema.js';
import appConfig from '../../config/index.js';

// ══════════════════════════════════════════════════════════════════════
// LA GESTIÓN DE LAS LLAVES DE INTEGRACIÓN
// ══════════════════════════════════════════════════════════════════════
// Emitir, listar y revocar las credenciales con las que un programa —el
// asistente de IA, un panel, un script— consulta esta API.
//
// LAS TRES RUTAS VAN CON `validateAdminSessionOnly`, QUE NO ACEPTA API KEYS.
// Es la regla que sostiene todo lo demás: una llave no puede fabricar otra
// llave. Si pudiera, robar una sería robarlas todas para siempre, porque el
// ladrón se emitiría repuestos antes de que nadie revoque la original.
//
// Para tocar esto hace falta una persona administradora con sesión iniciada,
// desde el navegador. Ni siquiera vale el atajo servidor-a-servidor que sí
// tienen los demás middlewares del proyecto — ver la nota en
// `validateSessionAndUser.js`.

const routerApiKey = express.Router();


/** Cómo validar un cuerpo: todos los errores juntos y sin claves de más. */
const OPCIONES_VALIDACION = { abortEarly: false, stripUnknown: true };


/**
 * La forma en la que una llave sale al cliente.
 *
 * Nunca incluye `secretHash`. El modelo ya lo marca `select: false`, así que
 * haría falta pedirlo a propósito para que apareciera; esto es el segundo
 * cinturón, y está porque el precio de olvidarse es filtrar la firma de todas
 * las llaves del sistema en una respuesta JSON.
 */
const formaPublica = (llave: any) => ({
    _id: String(llave._id),
    name: llave.name,
    keyId: llave.keyId,
    pista: pistaDeLlave(llave.keyId),
    scopes: llave.scopes ?? [],
    active: llave.active,
    createdByName: llave.createdByName ?? '',
    createdAt: llave.createdAt,
    expiresAt: llave.expiresAt ?? null,
    lastUsedAt: llave.lastUsedAt ?? null,
    usageCount: llave.usageCount ?? 0,
});


// ══════════════════════════════════════════════════════════════════════
// EMITIR
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /api-key — emite una llave nueva.
 *
 * LA RESPUESTA TRAE EL SECRETO EN TEXTO PLANO, Y ES LA ÚNICA VEZ QUE VA A
 * VIAJAR. En la base solo queda su firma, y de una firma no se puede volver
 * atrás. Si el administrador no lo copia, no hay forma de recuperarlo: hay que
 * revocar la llave y emitir otra.
 *
 * Eso es deliberado. La alternativa —guardar el secreto para poder mostrarlo
 * después— convierte la colección entera en una lista de credenciales
 * utilizables, y el día que alguien lea esa colección se las lleva todas.
 */
routerApiKey.post(`${nameApi}/api-key`, validateAdminSessionOnly, asyncHandler(async (req: any, res: any) => {

    const datos = await crearApiKeySchema.validate(req.body, OPCIONES_VALIDACION);

    // Si `API_KEY_SECRET` falta o es corta, esto lanza acá y no deja emitir nada.
    // Es lo correcto: una llave firmada con una cadena vacía sería falsificable
    // por cualquiera, y el sistema quedaría abierto sin que nadie lo note.
    const { keyId, plaintext, secretHash } = generarApiKey(appConfig.API_KEY_SECRET);

    const idAdmin = req.session?.userId;

    const llave = await ApiKeyModel.create({
        name: datos.name,
        keyId,
        secretHash,
        scopes: datos.scopes,
        expiresAt: datos.expiresAt ?? null,
        active: true,

        // Quién la emite sale de la SESIÓN, nunca del cuerpo: del cuerpo
        // permitiría emitir una llave a nombre de otro administrador.
        createdBy: idAdmin && Types.ObjectId.isValid(idAdmin) ? new Types.ObjectId(String(idAdmin)) : null,
        createdByName: req.session?.name ?? '',
    });

    console.log(`[api-key] «${llave.name}» emitida por ${llave.createdByName || 'desconocido'}`);

    return res.status(201).json({
        status: 201,
        message: 'Llave creada. Cópiala ahora: no se vuelve a mostrar.',
        apiKey: formaPublica(llave),
        plaintext,
    });
}));


// ══════════════════════════════════════════════════════════════════════
// LISTAR
// ══════════════════════════════════════════════════════════════════════

/**
 * GET /api-key — las llaves emitidas.
 *
 * Sin secretos: lo que se devuelve alcanza para administrarlas —para qué es
 * cada una, quién la creó, si se usa— y no para usarlas.
 *
 * `lastUsedAt` y `usageCount` son los que de verdad sirven: una llave que nunca
 * se usó o que lleva meses quieta es una que conviene revocar, y sin ese dato no
 * hay forma de distinguirla de la que sostiene una integración viva.
 */
routerApiKey.get(`${nameApi}/api-key`, validateAdminSessionOnly, asyncHandler(async (_req: any, res: any) => {

    const llaves = await ApiKeyModel.find()
        .sort({ active: -1, createdAt: -1 })
        .lean();

    return res.status(200).json({
        status: 200,
        message: 'ok',
        apiKeys: llaves.map(formaPublica),
    });
}));


// ══════════════════════════════════════════════════════════════════════
// REVOCAR
// ══════════════════════════════════════════════════════════════════════

/**
 * DELETE /api-key/:id — borra una llave.
 *
 * Se borra de verdad, y el efecto es inmediato: la verificación busca la fila
 * por `keyId` y, al no encontrarla, la siguiente petición que use esa llave
 * recibe un 401. No hay caché ni ventana de gracia.
 *
 * Se eligió borrar en lugar de marcarla apagada porque es lo que espera quien
 * aprieta «eliminar»: la llave desaparece de la lista. El precio es perder el
 * rastro de uso de esa llave; si algún día hiciera falta conservarlo para
 * auditoría, esto pasa a ser `active: false` y la lista aprende a mostrar las
 * revocadas aparte.
 */
routerApiKey.delete(`${nameApi}/api-key/:id`, validateAdminSessionOnly, asyncHandler(async (req: any, res: any) => {

    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'El identificador no es válido' });
    }

    const llave = await ApiKeyModel.findByIdAndDelete(id);

    if (!llave) {
        return res.status(404).json({ status: 404, error: 'Not found', message: 'Esa llave no existe o ya fue eliminada' });
    }

    console.log(`[api-key] «${llave.name}» revocada por ${req.session?.name ?? 'desconocido'}`);

    return res.status(200).json({
        status: 200,
        message: 'Llave eliminada. Deja de funcionar de inmediato.',
        apiKey: formaPublica(llave),
    });
}));


export { routerApiKey };
export default routerApiKey;
