import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ══════════════════════════════════════════════════════════════════════
// UN ENVOLTORIO PARA LOS MANEJADORES ASÍNCRONOS
// ══════════════════════════════════════════════════════════════════════
// Envuelve un manejador de ruta y traduce lo que falle. Hace dos cosas, y las dos
// hacen falta:
//
// 1. EVITA QUE EL PROCESO SE CAIGA. En Express 4 un rechazo dentro de un handler
//    `async` NO llega a Express —eso es Express 5—: queda como
//    `unhandledRejection`, y desde Node 15 eso mata el proceso. Como el deploy de
//    esta API es manual, un hipo de Mongo la deja caída hasta que alguien entre
//    al servidor a levantarla.
//
// 2. TRADUCE EL ERROR AL CÓDIGO QUE CORRESPONDE. Un cuerpo mal formado es culpa
//    del cliente y sale 400; un nombre repetido es un conflicto y sale 409; la
//    base inalcanzable es 503. Sin esto todo sale 500, y un 500 le dice al front
//    "el servidor está roto" cuando en realidad faltaba un campo.
//
// Eso segundo es lo que permite que los endpoints dejen de escribir códigos de
// error a mano: la validación vive en los archivos .schema, y el código sale de
// acá.
//
//
// POR QUÉ NO ES UN MIDDLEWARE DE ERRORES DE EXPRESS
//
// Porque en Express 4 no serviría: un middleware `(err, req, res, next)` solo
// recibe lo que le pasen por `next(err)`, y un `async` que rechaza nunca llega
// ahí. Cuando el proyecto suba a Express 5 esto se puede convertir en uno solo,
// global, y sacar el envoltorio de cada endpoint — pero el middleware hay que
// escribirlo igual, así que la lógica ya está separada en `describeError` para
// poder mudarla sin reescribirla.


/** El cuerpo de una respuesta de error. `message` es lo que lee Client365. */
export interface ApiErrorBody {
    status: number;
    error: string;
    message: string;

    /** Datos extra según el caso, p. ej. qué campo estaba duplicado. */
    [extra: string]: unknown;
}


/** Lo que se le puede leer a un error sin haberlo identificado todavía. */
interface UnknownFailure {
    name?: string;
    message?: string;
    code?: number | string;
    errors?: unknown;
    keyValue?: Record<string, unknown>;
    path?: string;
}


/**
 * El texto de un error de entrada.
 *
 * yup deja los suyos en `errors` como arreglo de cadenas —con `abortEarly: false`
 * vienen todos— y ahí se juntan para que quien lo lea arregle todo de una vez en
 * lugar de descubrir un problema por intento.
 *
 * Mongoose también llama `errors` a lo suyo, pero es un objeto indexado por
 * campo, no un arreglo; de ahí el `isArray` antes de tocarlo. Para ésos alcanza
 * el `message`, que Mongoose ya arma legible.
 */
const inputMessage = (failure: UnknownFailure): string => (
    Array.isArray(failure.errors) && failure.errors.length
        ? failure.errors.join('. ')
        : failure.message ?? 'Entrada inválida'
);


/**
 * Qué responder ante un error.
 *
 * Función pura y exportada a propósito: es la regla de traducción, y poder
 * probarla sin levantar Express es lo que importa cuando de ella depende que un
 * fallo se vea como 400 o como 500.
 */
export const describeError = (error: unknown): ApiErrorBody => {

    // En modo estricto `catch` entrega `unknown`, y con razón: en JavaScript se
    // puede lanzar cualquier cosa, no solo un Error.
    const failure = (error ?? {}) as UnknownFailure;

    // ── 400 · el cliente mandó algo que no sirve ──────────────────────
    // `ValidationError` lo lanzan yup Y Mongoose, con el mismo nombre.
    if (failure.name === 'ValidationError' || failure.name === 'StrictModeError') {
        return { status: 400, error: 'Bad request', message: inputMessage(failure) };
    }

    // Subida rechazada por multer: archivo muy grande, campo inesperado, de más.
    // Es entrada del cliente, no una falla del servidor. Se reconoce por el
    // nombre y no con `instanceof` para no tener que importar multer acá: esto
    // clasifica errores, no debería arrastrar dependencias de cada capa.
    if (failure.name === 'MulterError') {
        return { status: 400, error: 'Bad request', message: failure.message ?? 'Archivo rechazado' };
    }

    // Un ObjectId que no se puede castear, o un número donde iba texto.
    if (failure.name === 'CastError') {
        return {
            status: 400,
            error: 'Bad request',
            message: failure.path
                ? `El valor de "${failure.path}" no tiene el formato esperado`
                : inputMessage(failure),
            field: failure.path,
        };
    }

    // ── 409 · choca con algo que ya existe ────────────────────────────
    // Índice único violado. Es el error 11000 de MongoDB y hoy sale como 500,
    // que hace parecer roto al servidor cuando el problema es un nombre repetido
    // — `Menu.es` y `Menu.en` son únicos, así que pasa de verdad.
    if (failure.code === 11000) {
        const campo = Object.keys(failure.keyValue ?? {})[0];
        return {
            status: 409,
            error: 'conflict',
            message: campo
                ? `Ya existe un registro con ese valor en "${campo}"`
                : 'Ya existe un registro con esos valores',
            field: campo,
        };
    }

    // Dos ediciones simultáneas sobre el mismo documento. Reintentar suele
    // alcanzar, y por eso conviene que se distinga de un 500.
    if (failure.name === 'VersionError' || failure.name === 'ParallelSaveError') {
        return {
            status: 409,
            error: 'conflict',
            message: 'El documento cambió mientras se editaba. Volvé a cargarlo e intentá de nuevo.',
        };
    }

    // ── 404 ───────────────────────────────────────────────────────────
    if (failure.name === 'DocumentNotFoundError') {
        return { status: 404, error: 'Not found', message: 'El documento no existe' };
    }

    // ── 503 · la base no responde ─────────────────────────────────────
    // No es culpa del cliente ni un bug: es infraestructura. Un 503 le dice al
    // front que reintente; un 500 le dice que se rinda.
    if (failure.name === 'MongooseServerSelectionError' || failure.name === 'MongoNetworkError') {
        return {
            status: 503,
            error: 'Service unavailable',
            message: 'La base de datos no está respondiendo. Intentá de nuevo en unos segundos.',
        };
    }

    // ── 500 · lo que no supimos clasificar ────────────────────────────
    return {
        status: 500,
        error: 'Error server internal',
        message: failure.message ?? 'Error interno',
    };
};


/**
 * Un manejador de ruta que puede fallar.
 *
 * Devuelve `unknown` a propósito: adentro se escribe `return res.status(...)`,
 * que devuelve un `Response`. El envoltorio no usa ese valor, solo necesita poder
 * esperarlo.
 */
export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;


/**
 * Envuelve un manejador `async` para que ningún fallo se escape.
 *
 *     router.get('/ruta', validateSession, asyncHandler(async (req, res) => {
 *         const datos = await miSchema.validate(req.body, { abortEarly: false });
 *         return res.status(200).json({ status: 200, ...datos });
 *     }));
 *
 * Adentro no hace falta ningún try/catch: lo que se lance sale con el código que
 * corresponda. Un `return res.status(...)` explícito sigue funcionando igual,
 * porque lo que sigue al `await` no se ejecuta.
 */
export const asyncHandler = (fn: AsyncRouteHandler): RequestHandler => async (req, res, next) => {
    try {
        // `next` se propaga: hay manejadores que son un paso de una cadena y
        // siguen a otro middleware en vez de responder ellos (el login, por
        // ejemplo, delega en addCredentials).
        await fn(req, res, next);
    }
    catch (error) {
        const body = describeError(error);

        // Solo los 500 van al log: los demás son respuestas previstas, y
        // registrarlas ahoga el log con cosas que no hay que arreglar.
        if (body.status >= 500) console.log(error);

        res.status(body.status).json(body);
    }
};


export default asyncHandler;
