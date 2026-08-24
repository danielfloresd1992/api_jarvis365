import express from 'express';
import moment from 'moment-timezone';
import { Types } from 'mongoose';
import nameApi from '../../libs/name_api.js';
import { validateSession } from '../../middleware/validateSessionAndUser.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { io } from '../../services/socket/io.js';
import DvrFailureModel from './dvrFailure.model.js';
import LocalModel from '../local/local.model.js';
import { operationalDateOf, downtimeMinutesBetween } from './dvrFailure.lib.js';
import { avisarCaidaAlGrupo } from './dvrAlert.service.js';
import { dvrFailureSchema, dvrRestoreSchema, dvrQuerySchema } from './dvrFailure.schema.js';

const routerDvrFailure = express.Router();


/** Cómo validar un cuerpo: todos los errores juntos y sin claves de más. */
const OPCIONES_VALIDACION = { abortEarly: false, stripUnknown: true };


// ══════════════════════════════════════════════════════════════════════
// LOS NOMBRES NUEVOS
// ══════════════════════════════════════════════════════════════════════
// Este recurso reemplaza a `/failed`, que decía qué fallaba pero no qué:
//
//   POST   /failed                        →  POST /dvr-failure
//   DELETE /failed?idLocal&localName       →  PUT  /dvr-failure/restore
//   GET    /failed/all                     →  GET  /dvr-failure/active
//                                          +  GET  /dvr-failure/history
//                                          +  GET  /dvr-failure/stats
//
// Los viejos siguen respondiendo desde `failed.routes.js` mientras la aplicación
// de reporte no se actualice — no se apagan hasta entonces, porque apagarlos
// dejaría de registrar caídas sin dar ningún error.
//
// Todos piden sesión. El recurso anterior no pedía nada, así que cualquiera que
// alcanzara el puerto podía declarar caído un establecimiento; y además hace
// falta para saber QUIÉN la pasó, que es la mitad de lo que se quiere medir.


/** Lo que se le muestra al panel de un episodio. */
const paraElPanel = {
    path: 'local',
    select: 'name franchiseReference',
};


// ══════════════════════════════════════════════════════════════════════
// EL AVISO AL REPORTE DE NOVEDADES
// ══════════════════════════════════════════════════════════════════════
// El reporte del día (`/noveltyReport/today`) marca cada establecimiento como
// 'reportaron', 'sinReportar' o 'sinConexion', y un local caído queda fuera de
// la cuenta de omisiones. Ese estado tiene que cambiar EN EL MOMENTO en que se
// registra la caída o el restablecimiento, no en el próximo refresco.
//
// Se emite un evento chico y no el reporte entero: rearmarlo son seis consultas
// —novedades, horarios, guardias, DVR—, y hacerlo en cada caída para todas las
// pantallas conectadas es trabajo repetido. Con esto, quien tenga el reporte
// abierto parchea la fila del local y ajusta los contadores; quien no lo tenga,
// lo ignora.
const avisarAlReporte = (episodio: any, tz = process.env.MONITORING_TZ || 'America/Caracas') => {
    io.emit('noveltyReport:dvr-changed', {
        idLocal: String(episodio.local),
        name: episodio.localName,

        // Caído o no. El `status` del reporte no viaja acá a propósito: cuando
        // la conexión VUELVE, el local pasa a 'reportaron' o a 'sinReportar'
        // según cuántas novedades lleve, y ese número lo tiene el cliente en la
        // fila que ya está mostrando. Mandar un estado calculado sin saberlo
        // obligaría a consultar las novedades para poder avisar de un DVR.
        down: Boolean(episodio.active),

        failedAt: episodio.failedAt,
        failedAtLabel: moment.tz(episodio.failedAt, tz).format('HH:mm'),
        restoredAt: episodio.restoredAt ?? null,
        restoredAtLabel: episodio.restoredAt ? moment.tz(episodio.restoredAt, tz).format('HH:mm') : null,

        downtimeMinutes: episodio.downtimeMinutes ?? null,
        reportedByName: episodio.reportedByName ?? '',
        restoredByName: episodio.restoredByName ?? '',
    });
};


/**
 * Los nombres con los que quedará registrado el episodio.
 *
 * El del local se resuelve de la base si el cliente no lo mandó; el del operador
 * sale siempre de la sesión. Se guardan copiados —ver el modelo— para que el
 * historial siga diciendo lo que decía aunque después se renombre el local.
 */
const resolverNombres = async (localId: string, localName: string, session: any) => {
    const nombreLocal = localName || (
        await LocalModel.findById(localId).select('name').lean()
    )?.name || '';

    const nombreOperador = [session?.name, session?.surName].filter(Boolean).join(' ').trim();

    return { nombreLocal, nombreOperador };
};


/**
 * El operador de la sesión, como ObjectId.
 *
 * La sesión guarda el id como CADENA. Al crear un documento Mongoose la castea
 * sola, pero al asignarla a un campo de un documento ya cargado no: ahí el tipo
 * es `ObjectId` y una cadena no entra. Se convierte una vez acá en lugar de
 * repetir el casteo en cada endpoint.
 *
 * Devuelve null si no hay sesión o si el id no es válido, que es lo mismo que
 * "no sabemos quién": preferible a que falle el registro entero de la caída.
 */
const operadorDeLaSesion = (session: any): Types.ObjectId | null => {
    const id = session?.userId;
    return id && Types.ObjectId.isValid(id) ? new Types.ObjectId(String(id)) : null;
};


// ══════════════════════════════════════════════════════════════════════
// REGISTRAR UNA CAÍDA
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /dvr-failure — el establecimiento se quedó sin cámaras.
 *
 * Abre un episodio y lo deja activo. Quién lo pasa sale de la sesión, no del
 * cuerpo.
 *
 * Responde 409 si el local ya tenía un episodio abierto. No es un error del que
 * reporta: es lo correcto cuando dos estaciones ven la misma caída. Quien lo
 * reciba puede tratarlo como "ya estaba avisado" y seguir.
 *
 * El 409 lo produce el índice parcial único del modelo y lo traduce
 * `asyncHandler`. No se comprueba antes a propósito: entre la comprobación y la
 * escritura hay una ventana, y dos estaciones reportando a la vez entran de
 * sobra en ella.
 */
routerDvrFailure.post(`${nameApi}/dvr-failure`, validateSession, asyncHandler(async (req, res) => {
    const datos = await dvrFailureSchema.validate(req.body, OPCIONES_VALIDACION);

    const failedAt = datos.failedAt ?? new Date();
    const { nombreLocal, nombreOperador } = await resolverNombres(datos.local!, datos.localName, req.session);

    const episodio = await DvrFailureModel.create({
        local: datos.local,
        localName: nombreLocal,

        reportedBy: operadorDeLaSesion(req.session),
        reportedByName: nombreOperador,
        shift: datos.shift,

        failedAt,
        operationalDate: operationalDateOf(failedAt),

        active: true,

        noveltie: datos.noveltie,
        alert: datos.alert,
        alertName: datos.alertName,
        evidence: datos.evidence,
        note: datos.note,
    });

    // ── Aviso a las pantallas ─────────────────────────────────────────
    // Dos eventos y no uno: `dvr-failure:down` es el nuevo, con el episodio
    // entero; `failed-connection` es el que Client365 ya escucha hoy, con la
    // forma vieja. Se emiten los dos hasta que ese panel se actualice — dejar de
    // emitir el viejo apagaría el aviso en la pantalla que lo usa.
    io.emit('dvr-failure:down', episodio.toObject());
    io.emit('failed-connection', {
        nameItem: `${datos.local}-${nombreLocal}`,
        idLocal: datos.local,
        localName: nombreLocal,
        date: failedAt,
        title: datos.alertName,
    });
    avisarAlReporte(episodio.toObject());

    // El aviso al grupo «Información importante»: la foto de la falla con el
    // establecimiento y la hora. No se espera a propósito —ver la nota en
    // `dvrAlert.service.ts`—: un bot lento no puede volver un 500 un registro
    // que ya quedó bien guardado.
    avisarCaidaAlGrupo(episodio.toObject());

    return res.status(201).json({ status: 201, message: 'ok', failure: episodio });
}));


// ══════════════════════════════════════════════════════════════════════
// RESTABLECER
// ══════════════════════════════════════════════════════════════════════

/**
 * PUT /dvr-failure/restore — volvió la conexión.
 *
 * Cierra el episodio abierto del establecimiento y le sella cuánto duró. Es PUT
 * y no DELETE porque no borra nada: el episodio es justamente lo que se quiere
 * conservar. El recurso anterior usaba DELETE y era literal — la caída
 * desaparecía de la caché y con ella el registro de que había ocurrido.
 *
 * Se identifica por el local, no por el _id del episodio: quien reporta que
 * volvió la conexión está mirando el establecimiento, no un identificador que
 * nunca vio.
 *
 * Responde 404 si no había ninguna caída abierta. Puede pasar sin que nadie se
 * haya equivocado —el reinicio que la resolvió no se reportó como caída— así que
 * conviene que el cliente lo trate como un aviso y no como un fallo.
 */
routerDvrFailure.put(`${nameApi}/dvr-failure/restore`, validateSession, asyncHandler(async (req, res) => {
    const datos = await dvrRestoreSchema.validate(req.body, OPCIONES_VALIDACION);

    const episodio = await DvrFailureModel.findOne({ local: datos.local, active: true });

    if (!episodio) {
        return res.status(404).json({
            status: 404,
            error: 'Not found',
            message: 'Ese establecimiento no tiene ninguna caída abierta',
        });
    }

    const restoredAt = datos.restoredAt ?? new Date();
    const nombreOperador = [req.session?.name, req.session?.surName].filter(Boolean).join(' ').trim();

    episodio.active = false;
    episodio.restoredAt = restoredAt;
    episodio.restoredBy = operadorDeLaSesion(req.session);
    episodio.restoredByName = nombreOperador;
    episodio.downtimeMinutes = downtimeMinutesBetween(episodio.failedAt, restoredAt);

    // La nota del restablecimiento se agrega, no reemplaza: la de la caída
    // explica por qué se cayó y perderla al cerrarla sería perder la mitad.
    if (datos.note) {
        episodio.note = episodio.note ? `${episodio.note} · ${datos.note}` : datos.note;
    }

    await episodio.save();

    io.emit('dvr-failure:restored', episodio.toObject());
    io.emit('failed-connection-deleteItem', {
        idLocal: String(episodio.local),
        localName: episodio.localName,
    });
    avisarAlReporte(episodio.toObject());

    return res.status(200).json({ status: 200, message: 'ok', failure: episodio });
}));


// ══════════════════════════════════════════════════════════════════════
// QUÉ HAY CAÍDO AHORA
// ══════════════════════════════════════════════════════════════════════

/**
 * GET /dvr-failure/active — los establecimientos ciegos en este momento.
 *
 * Reemplaza a `GET /failed/all`, que leía la caché en memoria dentro de un
 * worker_thread. El worker sobraba: levantar un hilo para mapear un arreglo
 * cuesta más que el mapeo. Acá es una consulta con índice.
 *
 * Devuelve además cuántos minutos lleva caído cada uno, calculado al vuelo —
 * mientras el episodio sigue abierto no hay una duración que sellar.
 */
routerDvrFailure.get(`${nameApi}/dvr-failure/active`, validateSession, asyncHandler(async (req, res) => {
    const activas = await DvrFailureModel
        .find({ active: true })
        .populate(paraElPanel)
        .sort({ failedAt: -1 })
        .lean();

    const ahora = Date.now();

    return res.status(200).json({
        status: 200,
        total: activas.length,
        failures: activas.map(episodio => ({
            ...episodio,
            elapsedMinutes: downtimeMinutesBetween(episodio.failedAt, new Date(ahora)),
        })),
    });
}));


// ══════════════════════════════════════════════════════════════════════
// EL HISTORIAL
// ══════════════════════════════════════════════════════════════════════

/**
 * GET /dvr-failure/history — todas las caídas, con filtros y paginado.
 *
 * Filtra por rango de días operativos, establecimiento y turno. Sin filtros
 * devuelve las últimas, no todas: el historial crece sin parar.
 *
 *     ?from=2026-08-01&to=2026-08-21&local=<id>&shift=Nocturno&page=0&limit=50
 */
routerDvrFailure.get(`${nameApi}/dvr-failure/history`, validateSession, asyncHandler(async (req, res) => {
    const filtros = await dvrQuerySchema.validate(req.query, OPCIONES_VALIDACION);

    const query: Record<string, unknown> = {};

    // El rango se compara contra el DÍA OPERATIVO, no contra `failedAt`: pedir
    // "el 20" tiene que traer la madrugada del 21, que operativamente es del 20.
    if (filtros.from || filtros.to) {
        const rango: Record<string, Date> = {};
        if (filtros.from) rango.$gte = operationalDateOf(filtros.from);
        if (filtros.to) rango.$lte = operationalDateOf(filtros.to);
        query.operationalDate = rango;
    }

    if (filtros.local) query.local = new Types.ObjectId(filtros.local);
    if (filtros.shift) query.shift = filtros.shift;

    const [episodios, total] = await Promise.all([
        DvrFailureModel
            .find(query)
            .populate(paraElPanel)
            .sort({ failedAt: -1 })
            .skip(filtros.page * filtros.limit)
            .limit(filtros.limit)
            .lean(),
        DvrFailureModel.countDocuments(query),
    ]);

    return res.status(200).json({
        status: 200,
        page: filtros.page,
        limit: filtros.limit,
        total,
        pages: Math.ceil(total / filtros.limit),
        failures: episodios,
    });
}));


// ══════════════════════════════════════════════════════════════════════
// LA ESTADÍSTICA
// ══════════════════════════════════════════════════════════════════════

/**
 * GET /dvr-failure/stats — qué establecimiento se cae más y cuánto estuvo ciego.
 *
 * Agrupa por establecimiento dentro del rango pedido. Acepta los mismos filtros
 * que el historial salvo el paginado.
 *
 * Se resuelve con una agregación y no trayendo los documentos para sumarlos en
 * Node: un trimestre son miles de episodios, y traerlos para contar es mover
 * todo eso por la red para tirarlo enseguida.
 *
 * Los episodios TODAVÍA ABIERTOS cuentan en `failures` pero no suman minutos:
 * su duración no está sellada, y sumar la de "hasta ahora" daría un total que
 * cambia solo entre dos consultas del mismo rango.
 *
 * Devuelve DOS cortes del mismo rango:
 *
 *   byLocal  el ranking — qué establecimiento se cae más
 *   byDay    una fila por día operativo, para el mapa de calor. Trae el conteo
 *            de establecimientos y también sus NOMBRES: el mapa los muestra al
 *            pasar por encima, y "3 establecimientos" no dice cuáles.
 *
 * Los días SIN caídas no salen en `byDay`: la agregación solo ve lo que
 * ocurrió. Es el cliente el que arma la rejilla completa del mes y pinta en
 * cero lo que falte — así el hueco es una decisión de la vista y no una
 * consulta que devuelve treinta ceros.
 */
routerDvrFailure.get(`${nameApi}/dvr-failure/stats`, validateSession, asyncHandler(async (req, res) => {
    const filtros = await dvrQuerySchema.validate(req.query, OPCIONES_VALIDACION);

    const match: Record<string, unknown> = {};

    if (filtros.from || filtros.to) {
        const rango: Record<string, Date> = {};
        if (filtros.from) rango.$gte = operationalDateOf(filtros.from);
        if (filtros.to) rango.$lte = operationalDateOf(filtros.to);
        match.operationalDate = rango;
    }

    if (filtros.local) match.local = new Types.ObjectId(filtros.local);
    if (filtros.shift) match.shift = filtros.shift;

    // ── Las dos agregaciones, en paralelo ─────────────────────────────
    // Son cortes distintos del mismo conjunto y ninguna depende de la otra, así
    // que van juntas en vez de una detrás de la otra.
    const [porEstablecimiento, porDia] = await Promise.all([

    DvrFailureModel.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$local',
                localName: { $last: '$localName' },
                failures: { $sum: 1 },
                stillDown: { $sum: { $cond: ['$active', 1, 0] } },
                downtimeMinutes: { $sum: { $ifNull: ['$downtimeMinutes', 0] } },
                lastFailedAt: { $max: '$failedAt' },
            },
        },
        {
            $addFields: {
                // El promedio se calcula sobre los episodios CERRADOS: los
                // abiertos no aportaron minutos, y dividir por ellos bajaría el
                // promedio solo por estar todavía caídos.
                closed: { $subtract: ['$failures', '$stillDown'] },
            },
        },
        {
            $addFields: {
                averageDowntimeMinutes: {
                    $cond: [
                        { $gt: ['$closed', 0] },
                        { $round: [{ $divide: ['$downtimeMinutes', '$closed'] }, 1] },
                        0,
                    ],
                },
            },
        },
        // El que más se cae, primero: es la pregunta que se hace siempre.
        { $sort: { failures: -1, downtimeMinutes: -1 } },
    ]),

    // ── Una fila por día operativo, para el mapa de calor ─────────────
    // `locals` es cuántos establecimientos DISTINTOS se cayeron ese día, que no
    // es lo mismo que cuántas caídas hubo: un local que se cae tres veces son
    // tres episodios de un solo establecimiento, y en el mapa la diferencia
    // entre "se cayó todo" y "uno dio guerra" es justamente ésa.
    DvrFailureModel.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$operationalDate',
                failures: { $sum: 1 },
                downtimeMinutes: { $sum: { $ifNull: ['$downtimeMinutes', 0] } },
                locals: { $addToSet: '$local' },

                // Los NOMBRES, además del conteo: el mapa los muestra al pasar
                // por encima, y "3 establecimientos" no dice cuáles. Salen del
                // nombre copiado en el episodio, no de la referencia, para no
                // cruzar una colección entera por un texto de ayuda.
                localNames: { $addToSet: '$localName' },
            },
        },
        {
            $project: {
                _id: 0,
                date: '$_id',
                failures: 1,
                downtimeMinutes: 1,

                // El conteo sale de los IDS y no de los nombres: un local
                // renombrado a mitad del período aporta dos nombres distintos y
                // se contaría dos veces.
                locals: { $size: '$locals' },

                // Sin los vacíos: un episodio cargado por el puente `/failed`
                // sin nombre de local dejaría una cadena en blanco en la lista.
                //
                // El ORDEN se pone en el cliente. `$addToSet` no garantiza
                // ninguno, y `$sortArray` —que sería lo natural— pide MongoDB
                // 5.2, que no es algo que este despliegue pueda dar por sentado.
                localNames: { $filter: { input: '$localNames', as: 'n', cond: { $ne: ['$$n', ''] } } },
            },
        },
        { $sort: { date: 1 } },
    ]),

    ]);

    const totales = porEstablecimiento.reduce((acumulado, fila) => ({
        failures: acumulado.failures + fila.failures,
        stillDown: acumulado.stillDown + fila.stillDown,
        downtimeMinutes: acumulado.downtimeMinutes + fila.downtimeMinutes,
    }), { failures: 0, stillDown: 0, downtimeMinutes: 0 });

    return res.status(200).json({
        status: 200,
        from: filtros.from ? operationalDateOf(filtros.from) : null,
        to: filtros.to ? operationalDateOf(filtros.to) : null,
        totals: { ...totales, locals: porEstablecimiento.length },
        byLocal: porEstablecimiento,
        byDay: porDia,
    });
}));


export { routerDvrFailure };
export default routerDvrFailure;
