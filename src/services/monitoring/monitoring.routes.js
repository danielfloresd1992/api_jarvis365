import express from 'express';
import { Types } from 'mongoose';
import { extendSession, validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { io } from '../socket/io.js';
import MonitoringStateModel from './monitoringState.model.js';
import DvrFailureModel from '../../apiServises/dvrFailure/dvrFailure.model.js';
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
 * El aviso de silencio tampoco viaja si el local está EXENTO o si tiene una
 * CAÍDA DE DVR abierta. Es la misma regla que aplica el corte horario, aplicada
 * también al indicador: si solo se comprobara en el corte, entre uno y otro
 * —hasta una hora— la pantalla mostraría en rojo a un local que se quedó sin
 * cámaras hace diez minutos, y las dos cosas dirían cosas distintas.
 *
 * El front lo usa para SEMBRAR sus indicadores "en vivo"; los cambios
 * posteriores llegan por los eventos 'monitoring-start' / 'monitoring-end'.
 *
 * Respuesta: [{ idLocal, name, activeTypes, usingWinter, lastStartAt,
 * lastEndAt, noveltyCheck, silenceExempt, dvrDown }] (solo los que están dentro
 * de su ventana ahora).
 */
routerMonitoring.get(`${nameApi}/monitoring/status`, extendSession, validateSession, async (req, res) => {
    try {
        const [timeDoc, schedules, activeLocals, states, caidasAbiertas] = await Promise.all([
            IsDaylightSavingTimeBoolean.findOne(),
            Schedules.find(),
            LocalModel.find({ isActive: true }).select('_id name').lean(),
            MonitoringStateModel.find().select('idLocal noveltyCheck lastStartAt lastEndAt silenceExempt').lean(),
            DvrFailureModel.find({ active: true }).select('local failedAt localName').lean(),
        ]);
        const isWinter = Boolean(timeDoc?.usWinterActive);
        const nameById = new Map(activeLocals.map(l => [String(l._id), l.name]));
        const stateById = new Map(states.map(s => [s.idLocal, s]));

        // Los que no tienen cámaras AHORA. Se consulta en cada petición, que es
        // lo que hace que el indicador esté al día: un local se cae o se
        // restablece entre dos refrescos y la pantalla lo refleja enseguida.
        const sinCamaras = new Map(caidasAbiertas.map(c => [String(c.local), c]));

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
                    // El aviso de silencio SOLO viaja si el local de verdad
                    // podía reportar. Se comprueba acá y no solo en el corte
                    // horario porque un flag durable puede tener hasta una hora
                    // de antigüedad: entre dos cortes el local pudo quedarse sin
                    // cámaras o un administrador pudo eximirlo, y la pantalla
                    // seguiría mostrándolo en rojo todo ese rato.
                    //
                    // Es la MISMA regla del corte, aplicada al indicador, para
                    // que las dos cosas no puedan decir cosas distintas.
                    flagged: Boolean(st?.noveltyCheck?.flagged)
                        && status.types.includes('analytical')
                        && !st?.silenceExempt?.active
                        && !sinCamaras.has(id),
                },

                // Sin cámaras ahora mismo, y desde cuándo. Va acá para que
                // cualquier pantalla que ya lea este endpoint pueda mostrarlo
                // sin pedir nada más.
                dvrDown: sinCamaras.has(id)
                    ? { failedAt: sinCamaras.get(id).failedAt, localName: sinCamaras.get(id).localName ?? name }
                    : null,

                // Para pintar el interruptor en el panel. Viaja siempre: el
                // front decide con `admin` si además deja tocarlo.
                silenceExempt: {
                    active: Boolean(st?.silenceExempt?.active),
                    byName: st?.silenceExempt?.byName ?? '',
                    at: st?.silenceExempt?.at ?? null,
                    reason: st?.silenceExempt?.reason ?? '',
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

// ══════════════════════════════════════════════════════════════════════
// EXIMIR DEL CORTE DE SILENCIO
// ══════════════════════════════════════════════════════════════════════

/**
 * PUT /monitoring/silence-exempt — saca (o devuelve) un establecimiento de la
 * lista "ESTABLECIMIENTOS SIN REPORTAR AL GRUPO". Solo administradores.
 *
 *     { idLocal: '<id>', active: true, reason?: 'texto' }
 *
 * QUÉ APAGA Y QUÉ NO. Solo el aviso horario. El local sigue contando sus
 * alertas, sigue anunciando inicio y fin de monitoreo, y sigue apareciendo si
 * se le cae el DVR. Lo único que deja de hacer es salir en ese corte.
 *
 * Al apagarlo, el flag de silencio que tuviera se limpia en el acto en vez de
 * esperar al corte siguiente: si no, un local recién eximido seguiría en rojo
 * hasta una hora después de haberlo eximido, y parecería que el botón no hizo
 * nada.
 *
 * Al volver a activarlo NO se lo señala: se lo devuelve a la evaluación normal
 * y el corte siguiente decide. Marcarlo de entrada sería juzgarlo por una hora
 * en la que estaba exento.
 *
 * `upsert` porque un local que todavía no tuvo ninguna transición de monitoreo
 * no tiene documento de estado, y aun así se lo tiene que poder eximir.
 */
routerMonitoring.put(`${nameApi}/monitoring/silence-exempt`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { idLocal, active, reason } = req.body ?? {};

    if (!idLocal || !Types.ObjectId.isValid(String(idLocal))) {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'Falta un idLocal válido' });
    }

    if (typeof active !== 'boolean') {
        return res.status(400).json({ status: 400, error: 'Bad request', message: 'El campo `active` debe ser true o false' });
    }

    const exento = {
        active,
        by: req.session?.userId ?? null,
        byName: [req.session?.name, req.session?.surName].filter(Boolean).join(' ').trim(),
        at: new Date(),
        reason: typeof reason === 'string' ? reason.trim().slice(0, 300) : '',
    };

    const cambios = { silenceExempt: exento };

    // Al eximir, se apaga el aviso que tuviera puesto. Ver la nota de arriba.
    if (active) cambios['noveltyCheck.flagged'] = false;

    const estado = await MonitoringStateModel.findOneAndUpdate(
        { idLocal: String(idLocal) },
        { $set: cambios },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    // En vivo para todas las salas de control abiertas: el que lo tocó ve el
    // cambio, y los demás también, sin recargar.
    io.emit('monitoring-silence-exempt', {
        idLocal: String(idLocal),
        active,
        byName: exento.byName,
        at: exento.at,
        reason: exento.reason,
    });

    return res.status(200).json({
        status: 200,
        message: 'ok',
        idLocal: String(idLocal),
        silenceExempt: estado?.silenceExempt ?? exento,
    });
}));


export { routerMonitoring };
