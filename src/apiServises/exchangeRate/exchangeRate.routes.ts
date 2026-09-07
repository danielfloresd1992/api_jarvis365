import express from 'express';
import nameApi from '../../libs/name_api.js';
import { validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import ExchangeRateModel from './exchangeRate.model.js';
import { getExchangeRateDetail, saveExchangeRate, DEFAULT_EXCHANGE_RATE } from './exchangeRate.lib.js';
import exchangeRateSchema from './exchangeRate.schema.js';

const routerExchangeRate = express.Router();


// ══════════════════════════════════════════════════════════════════════
// LA TASA DE CAMBIO
// ══════════════════════════════════════════════════════════════════════
// Cuántos bolívares vale un dólar. Un número para todo el sistema, con su
// historial.
//
// LO LEE CUALQUIERA CON SESIÓN y lo cambia solo un administrador. Que la
// lectura sea abierta no es un descuido: la nómina y los bonos convierten a
// bolívares en cada pantalla que muestran, y cerrar esta ruta con permiso de
// admin dejaría media aplicación mostrando ceros a todos los demás. El número
// tampoco es secreto — es la tasa del día, la misma que está en el diario.
//
// El HISTORIAL sí es de administrador: eso ya es auditoría, y dice quién tocó
// qué y cuándo.


/** Cómo validar un cuerpo: todos los errores juntos y sin claves de más. */
const OPCIONES_VALIDACION = { abortEarly: false, stripUnknown: true };


/**
 * GET /exchange-rate — la tasa vigente, con de dónde salió y de cuándo es.
 *
 * `configured` en false es "nadie la cargó todavía", y viene con `value: 0`
 * para que la columna de bolívares se vea vacía en vez de mentir con la tasa
 * de otro día. No crea el documento al leer: leer no debería escribir en la
 * base, y un documento creado acá nacería con un cero adentro que el esquema
 * de escritura justamente prohíbe.
 */
routerExchangeRate.get(`${nameApi}/exchange-rate`, validateSession, asyncHandler(async (_req, res) => {
    const tasa = await getExchangeRateDetail();

    return res.status(200).json({
        status: 200,
        value: tasa.value,
        source: tasa.source,
        updatedAt: tasa.updatedAt,
        updatedBy: tasa.updatedBy,
        configured: tasa.configured,
    });
}));


/**
 * PUT /exchange-rate — carga la tasa del día. Solo administradores.
 *
 * Cambia lo que se ve en bolívares en TODO el sistema desde el momento en que
 * se guarda, incluidos los cortes ya cerrados: sus montos sellados están en
 * dólares y los bolívares se derivan al leer. No es un efecto no deseado, es la
 * decisión — el bolívar es una conversión de presentación, no el dato pagado.
 *
 * La anterior queda en el historial con quién la había cargado, que es lo que
 * permite reconstruir después a qué tasa se pagó cada corte.
 */
routerExchangeRate.put(`${nameApi}/exchange-rate`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const validado = await exchangeRateSchema.validate(req.body, OPCIONES_VALIDACION);

    const tasa = await saveExchangeRate(validado.value, validado.source, {
        nameUser: req.session.name,
        _id: req.session.userId,
    });

    return res.status(200).json({
        status: 200,
        message: 'ok',
        value: tasa.value,
        source: tasa.source ?? null,
        updatedAt: tasa.updatedAt,
        updatedBy: tasa.updatedBy ?? null,
    });
}));


/**
 * GET /exchange-rate/history — los cambios, del más reciente al más viejo.
 * Solo administradores: es información de auditoría.
 *
 * Es la ÚNICA forma de responder a qué tasa se pagó un corte cerrado, porque el
 * corte ya no guarda una copia: se cruza su `closedAt` contra estas fechas, y
 * la entrada que manda es la primera cuyo `changedAt` es posterior — cada
 * entrada guarda el valor que rigió HASTA ese momento.
 */
routerExchangeRate.get(`${nameApi}/exchange-rate/history`, validateSession, validateAdminUser, asyncHandler(async (_req, res) => {
    const tasa = await ExchangeRateModel.findOne().lean();

    // Al revés que en la base, donde se apila al final: quien abre la auditoría
    // busca el último cambio, no el primero de la historia.
    const historial = [...(tasa?.history ?? [])].reverse();

    return res.status(200).json({
        status: 200,
        current: { value: tasa?.value ?? DEFAULT_EXCHANGE_RATE },
        history: historial,
    });
}));


export { routerExchangeRate };
