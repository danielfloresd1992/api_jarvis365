import express from 'express';
import nameApi from '../../libs/name_api.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { io } from '../../services/socket/io.js';
import DvrFailureModel from '../dvrFailure/dvrFailure.model.js';
import LocalModel from '../local/local.model.js';
import { operationalDateOf, downtimeMinutesBetween } from '../dvrFailure/dvrFailure.lib.js';

const routesFailed = express.Router();

// ══════════════════════════════════════════════════════════════════════
// PUENTE — LOS NOMBRES VIEJOS
// ══════════════════════════════════════════════════════════════════════
// Este recurso quedó reemplazado por `dvrFailure`. Sigue acá por una sola razón:
// la aplicación de reporte que está INSTALADA en las estaciones llama a estas
// rutas, y apagarlas dejaría de registrar caídas sin dar ningún error visible
// —el operador seguiría viendo "Novedad enviada"—. Se apagan cuando
// Jarvis-express365 apunte a las nuevas y esa versión esté desplegada.
//
//   POST   /failed                    →  POST /dvr-failure
//   DELETE /failed?idLocal&localName  →  PUT  /dvr-failure/restore
//   GET    /failed/all                →  GET  /dvr-failure/active
//
//
// QUÉ CAMBIÓ POR DEBAJO
//
// Ya no hay caché en memoria: los tres endpoints escriben y leen la colección
// `dvrfailures`, igual que los nuevos. Eso arregla el problema de fondo —no
// quedaba historial, y un reinicio del servidor borraba lo que estuviera caído—
// sin tocar el cliente instalado.
//
//
// QUÉ NO SE PUEDE ARREGLAR DESDE ACÁ
//
// QUIÉN reportó. Estas rutas no piden sesión porque el cliente instalado las
// llama con `axios` pelado, sin credenciales; exigirla ahora devolvería 401 y
// dejaría de registrarse todo. Los episodios que entren por acá quedan con
// `reportedBy: null`, y así se distinguen en el historial de los que entren por
// el recurso nuevo. Es la razón principal para migrar el cliente.


/** Un episodio con la forma que espera el cliente viejo y el panel de Client365. */
const formaVieja = (episodio) => ({
    nameItem: `${episodio.local}-${episodio.localName}`,
    idLocal: String(episodio.local),
    localName: episodio.localName,
    date: episodio.failedAt,
    title: episodio.alertName,
});


// Los dos eventos, siempre juntos: el nuevo lleva el episodio entero; el viejo
// es el que Client365 ya escucha hoy. Dejar de emitir el viejo apagaría el aviso
// en la pantalla que lo usa.
const avisarCaida = (episodio) => {
    io.emit('dvr-failure:down', episodio);
    io.emit('failed-connection', formaVieja(episodio));
};

const avisarRestablecida = (episodio) => {
    io.emit('dvr-failure:restored', episodio);
    io.emit('failed-connection-deleteItem', formaVieja(episodio));
};


/**
 * GET /failed/all — qué hay caído ahora. Equivale a GET /dvr-failure/active.
 *
 * La versión anterior levantaba un `worker_thread` para mapear la caché. El
 * worker sobraba: arrancar un hilo cuesta más que el mapeo que hacía. Acá es una
 * consulta con índice.
 */
routesFailed.get(`${nameApi}/failed/all`, asyncHandler(async (req, res) => {
    const activas = await DvrFailureModel
        .find({ active: true })
        .sort({ failedAt: -1 })
        .lean();

    // Arreglo pelado, como antes: es lo que el cliente instalado espera.
    return res.status(200).json(activas.map(formaVieja));
}));


/**
 * POST /failed — se cayó la conexión. Equivale a POST /dvr-failure.
 *
 * Acepta el cuerpo viejo: `idLocal`, `localName`, `date`, `title`, `buffer_img`.
 *
 * `buffer_img` se DESCARTA. Llegaba como data URL en base64 —la imagen entera
 * dentro del JSON— y guardarlo haría que un historial de meses no entre en un
 * documento de Mongo. El recurso nuevo recibe en su lugar `evidence`, la URL que
 * multimedia ya devolvió al subir la foto.
 */
routesFailed.post(`${nameApi}/failed`, asyncHandler(async (req, res) => {
    const { idLocal, localName, date, title } = req.body ?? {};

    if (!idLocal) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Falta idLocal' });
    }

    // Se comprueba acá además del índice único del modelo para poder responder
    // el 409 sin que quede un error de escritura en el log. La carrera la sigue
    // cubriendo el índice.
    const abierta = await DvrFailureModel.findOne({ local: idLocal, active: true }).lean();

    if (abierta) {
        return res.status(409).json({
            status: 409,
            error: 'conflict',
            message: 'Ese establecimiento ya está registrado como caído',
        });
    }

    const failedAt = date ? new Date(date) : new Date();
    const nombreLocal = localName || (await LocalModel.findById(idLocal).select('name').lean())?.name || '';

    const episodio = await DvrFailureModel.create({
        local: idLocal,
        localName: nombreLocal,

        // Sin sesión no hay operador. Ver la nota de la cabecera.
        reportedBy: null,
        reportedByName: '',

        failedAt,
        operationalDate: operationalDateOf(failedAt),
        active: true,

        alertName: title ?? '',
    });

    avisarCaida(episodio.toObject());

    // 200 y `{ text: 'ok' }`, como antes: el cliente instalado comprueba el 200.
    return res.status(200).json({ text: 'ok' });
}));


/**
 * DELETE /failed — volvió la conexión. Equivale a PUT /dvr-failure/restore.
 *
 * Ya no borra nada: cierra el episodio abierto y le sella cuánto duró. El verbo
 * queda porque lo usa el cliente instalado; el nombre nuevo dice lo que pasa.
 *
 * `localName` ya no es obligatorio. Antes hacía falta para armar la clave de la
 * caché; ahora el episodio se busca por establecimiento, así que exigirlo solo
 * agregaría una forma de fallar.
 */
routesFailed.delete(`${nameApi}/failed`, asyncHandler(async (req, res) => {
    const { idLocal } = req.query;

    if (!idLocal) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Param idLocal is undefined' });
    }

    const episodio = await DvrFailureModel.findOne({ local: idLocal, active: true });

    if (!episodio) {
        return res.status(404).json({
            status: 404,
            error: 'Not found',
            message: 'Ese establecimiento no tiene ninguna caída abierta',
        });
    }

    const restoredAt = new Date();

    episodio.active = false;
    episodio.restoredAt = restoredAt;
    episodio.downtimeMinutes = downtimeMinutesBetween(episodio.failedAt, restoredAt);
    await episodio.save();

    avisarRestablecida(episodio.toObject());

    return res.status(200).json({ text: 'ok' });
}));


export { routesFailed };
