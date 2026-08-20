import NoveltieModel from '../noveltie/noveltie.model.js';
import { buildPipeline, filtro, LedgerParams, LedgerFila } from './bonusLedger.pipeline.js';

// ══════════════════════════════════════════════════════════════════════
// EL LIBRO DE BONOS — LA EJECUCIÓN
// ══════════════════════════════════════════════════════════════════════
// La consulta se arma en bonusLedger.pipeline.ts, que es puro y se prueba sin
// Mongo. Acá solo se corre. La división es la misma que entre resolveBonus y
// bonusSeal, y por el mismo motivo: lo que decide se prueba, lo que va a la
// base se mira.

/**
 * El libro del rango pedido.
 *
 * `allowDiskUse` no es opcional: un $group sobre tres meses pasa el límite de
 * 100 MB en memoria que Mongo aplica por etapa, y sin esto la consulta no
 * devuelve datos parciales —tira, y el endpoint responde 500 justo cuando el
 * rango es grande, que es cuando más se necesita—.
 */
export const buildBonusLedger = async (params: LedgerParams): Promise<LedgerFila[]> =>
    NoveltieModel.aggregate<LedgerFila>(pipeline(params)).allowDiskUse(true);


/**
 * Cuántas novedades hay en el rango, sin agrupar nada.
 *
 * Sirve para decidir ANTES de agrupar: si el rango trae medio millón de
 * documentos, es mejor devolver un 413 con el número que dejar que la
 * agregación corra diez minutos y se caiga sola.
 */
export const countNovelties = (params: LedgerParams) =>
    NoveltieModel.countDocuments(filtro(params));

export default buildBonusLedger;
