import express from 'express';
import { extendSession, validateSession } from '../../middleware/validateSessionAndUser.js';
import { buildNoveltyCountReport } from './noveltyReport.service.js';
import nameApi from '../../libs/name_api.js';

const routerNoveltyReport = express.Router();

/**
 * GET /noveltyReport/today — Conteo de novedades del día operativo ACTUAL
 * (08:00 → 07:00 del día siguiente, hora fija del monitoreo), en vivo.
 *
 * Misma data que alimenta el PDF/caption del job de WhatsApp:
 *   { dateLabel, weekdayLabel, windowLabel, cutoffLabel, onDuty{diurno,nocturno},
 *     totals{total,positivas,negativas,ignoradas,enviadas,diurno,nocturno},
 *     localsInSchedule, franchises[{name, totals, locals[{name, ...conteos}]}] }
 *
 * Query params:
 *   ?final=true  → evalúa la ventana COMPLETA del día (como el reporte de las
 *                  07:00) en lugar de cortar en el instante actual.
 */
routerNoveltyReport.get(`${nameApi}/noveltyReport/today`, extendSession, validateSession, async (req, res) => {
    try {
        const isFinal = req.query.final === 'true';
        const report = await buildNoveltyCountReport({ isFinal });
        return res.json(report);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal' });
    }
});

export { routerNoveltyReport };