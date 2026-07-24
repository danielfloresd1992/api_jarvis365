import express from 'express';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser.js';
import MonitoringStateModel from './monitoringState.model.js';
import nameApi from '../../libs/name_api.js';

const routerMonitoring = express.Router();

/**
 * GET /monitoring/status — Estado ACTUAL del monitoreo por establecimiento.
 *
 * Lee el estado durable del watcher (colección monitoringstates): qué locales
 * están dentro de su ventana ahora mismo y con qué tipos. El front lo usa para
 * SEMBRAR sus indicadores "en vivo"; los cambios posteriores llegan por los
 * eventos de socket 'monitoring-start' / 'monitoring-end'.
 *
 * Respuesta: [{ idLocal, name, activeTypes, usingWinter, lastStartAt, lastEndAt }]
 * (solo los que tienen algún tipo activo).
 */
routerMonitoring.get(`${nameApi}/monitoring/status`, extendSession, validateSession, async (req, res) => {
    try {
        const docs = await MonitoringStateModel.find({ active: true })
            .select('idLocal name activeTypes usingWinter lastStartAt lastEndAt noveltyCheck')
            .lean();
        return res.json(docs);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal' });
    }
});

export { routerMonitoring };