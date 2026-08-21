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
 *     status{reportaron,sinReportar,sinConexion},
 *     dvr{downNow,affectedToday,downtimeMinutes,episodes,locals[]},
 *     localsInSchedule,
 *     franchises[{name, totals, dvr, status, locals[{name, ...conteos, dvr, status}]}] }
 *
 * CÁMARAS CAÍDAS. Cada local trae `dvr` con la hora de la falla y los minutos
 * que estuvo ciego en la jornada, y un `status` de tres valores: 'reportaron',
 * 'sinReportar' o 'sinConexion'. Un local con el DVR caído sale como
 * 'sinConexion' y NO cuenta como omisión — no podía monitorear. En cuanto se
 * registra el restablecimiento vuelve a la cuenta normal.
 *
 * En vivo sin refrescar todo: el recurso de caídas emite
 * `noveltyReport:dvr-changed` por socket cada vez que un establecimiento cae o
 * vuelve, con lo justo para parchear esa fila.
 *
 * Query params:
 *   ?final=true          → evalúa la ventana COMPLETA del día (como el reporte
 *                          de las 07:00) en lugar de cortar en el instante actual.
 *   ?category=           → solo las novedades de esa categoría OPERATIVA
 *   ?bonusCategory=      → solo las de esa categoría de BONIFICACIÓN
 *
 * Los dos filtros son opcionales y se combinan. Sin ellos la respuesta es la
 * de siempre, que es la que usan el job de WhatsApp y el PDF.
 */
routerNoveltyReport.get(`${nameApi}/noveltyReport/today`, extendSession, validateSession, async (req, res) => {
    try {
        const isFinal = req.query.final === 'true';

        // Se aceptan solo como cadena: cualquier otra cosa (el parámetro
        // repetido, que llega como array) se descarta en lugar de ir a la
        // consulta.
        const category = typeof req.query.category === 'string' && req.query.category.trim()
            ? req.query.category.trim() : undefined;
        const bonusCategory = typeof req.query.bonusCategory === 'string' && req.query.bonusCategory.trim()
            ? req.query.bonusCategory.trim() : undefined;

        const report = await buildNoveltyCountReport({ isFinal, category, bonusCategory });
        return res.json(report);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal' });
    }
});

export { routerNoveltyReport };