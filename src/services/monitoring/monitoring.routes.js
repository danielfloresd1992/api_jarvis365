import express from 'express';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser.js';
import MonitoringStateModel from './monitoringState.model.js';
import Schedules from '../../apiServises/schedules/schedule.model.js';
import LocalModel from '../../apiServises/local/local.model.js';
import { IsDaylightSavingTimeBoolean } from '../../apiServises/time/time.model.js';
import { getActiveMonitoringNow } from '../../apiServises/schedules/schedule.logic.js';
import nameApi from '../../libs/name_api.js';

const routerMonitoring = express.Router();

/**
 * GET /monitoring/status — Estado ACTUAL del monitoreo por establecimiento.
 *
 * La verdad EN TIEMPO REAL sale del HORARIO (modelos Schedules/MonitoringRange):
 * para cada local activo se evalúa getActiveMonitoringNow —día de hoy
 * (dayMonitoring) y rango start/end vigente, invierno incluido— en el momento
 * de la petición. El estado durable del watcher (monitoringstates) solo aporta
 * los metadatos: noveltyCheck (corte de silencio) y últimas transiciones.
 *
 * Así, aunque el watcher esté caído o el flag de silencio haya quedado viejo,
 * un local FUERA de su ventana nunca llega al front como activo ni señalado:
 * el flag de silencio solo viaja si el monitoreo ANALÍTICO del local está
 * dentro de su rango en este instante.
 *
 * El front lo usa para SEMBRAR sus indicadores "en vivo"; los cambios
 * posteriores llegan por los eventos 'monitoring-start' / 'monitoring-end'.
 *
 * Respuesta: [{ idLocal, name, activeTypes, usingWinter, lastStartAt,
 * lastEndAt, noveltyCheck }] (solo los que están dentro de su ventana ahora).
 */
routerMonitoring.get(`${nameApi}/monitoring/status`, extendSession, validateSession, async (req, res) => {
    try {
        const [timeDoc, schedules, activeLocals, states] = await Promise.all([
            IsDaylightSavingTimeBoolean.findOne(),
            Schedules.find(),
            LocalModel.find({ isActive: true }).select('_id name').lean(),
            MonitoringStateModel.find().select('idLocal noveltyCheck lastStartAt lastEndAt').lean(),
        ]);
        const isWinter = Boolean(timeDoc?.usWinterActive);
        const nameById = new Map(activeLocals.map(l => [String(l._id), l.name]));
        const stateById = new Map(states.map(s => [s.idLocal, s]));

        const docs = [];
        for (const doc of schedules) {
            const id = String(doc.idLocal);
            const name = nameById.get(id);
            if (!name) continue;                 // local inactivo o inexistente
            const status = getActiveMonitoringNow(doc, isWinter);
            if (!status.active) continue;        // fuera de su ventana AHORA

            const st = stateById.get(id);
            docs.push({
                idLocal: id,
                name,
                activeTypes: status.types,
                usingWinter: status.usingWinter,
                lastStartAt: st?.lastStartAt ?? null,
                lastEndAt: st?.lastEndAt ?? null,
                // El aviso de silencio es un concepto ANALÍTICO: solo viaja si
                // ese tipo está en ventana en este momento. Un flag durable
                // viejo (local que ya cerró) muere aquí y no llega al front.
                noveltyCheck: {
                    ...(st?.noveltyCheck ?? {}),
                    flagged: Boolean(st?.noveltyCheck?.flagged) && status.types.includes('analytical'),
                },
            });
        }
        return res.json(docs);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal' });
    }
});

export { routerMonitoring };
