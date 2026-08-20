import { Types, PipelineStage } from 'mongoose';
import NoveltieModel from '../noveltie/noveltie.model.js';

// ══════════════════════════════════════════════════════════════════════
// EL LIBRO DE BONOS
// ══════════════════════════════════════════════════════════════════════
// El equivalente de la hoja `Op_DataBase`, calculado sobre las novedades:
//
//     Fecha · Turno · Local · Operador · Código · Cantidad
//
// LA IDEA CENTRAL: no se devuelven novedades, se devuelve el AGRUPADO. Tres
// meses son del orden de cien mil documentos con imágenes, comentarios y
// validaciones; agrupados por (día, turno, local, operador, alerta) quedan
// unos pocos miles de filas. La hoja de cálculo lleva ~3.000 filas por mes, o
// sea que el resultado real ronda las 9.000 para el rango completo: un par de
// megabytes de JSON en vez de cientos.
//
// Mongo hace el trabajo pesado y Node nunca ve las novedades: no hay un array
// de cien mil objetos que construir, serializar ni recolectar. Es la única
// diferencia que de verdad importa entre un endpoint que aguanta y uno que
// tumba el proceso.
//
//
// COMPATIBILIDAD CON DOCUMENTOS VIEJOS
//
// Se filtra por `date` y no por `createdAt`: aunque el esquema marque `date`
// como deprecado, se sigue escribiendo en cada creación y es el campo que usan
// todas las consultas del repo. El local puede venir en `establishment`
// (vigente) o solo en `local.idLocal` (documentos viejos), así que se
// contemplan los dos —igual que en noveltyReport.service.js—.
//
//
// HACE FALTA UN ÍNDICE
//
// `Noveltie` no declara ninguno. Sin índice sobre `date`, este $match recorre
// la colección entera y ahí sí se cae el servidor. Ver `INDICES_SUGERIDOS`.

/** Ningún rango más largo que esto. Tres meses y un poco de aire. */
export const MAX_DIAS = 92;

/**
 * Lo que hay que crear en Mongo antes de usar esto en serio.
 *
 * No se declaran en el esquema a propósito: `Noveltie` es una colección
 * grande y ya en producción, y un índice que aparece solo porque alguien
 * levantó el server es una construcción sorpresa sobre la base viva. Se
 * crean a mano, mirando.
 *
 *   db.noveltie.createIndex({ date: 1 })
 *   db.noveltie.createIndex({ 'sharedByUser.user.id': 1, date: 1 })
 *   db.noveltie.createIndex({ establishment: 1, date: 1 })
 */
export const INDICES_SUGERIDOS = [
    { date: 1 },
    { 'sharedByUser.user.id': 1, date: 1 },
    { establishment: 1, date: 1 },
] as const;


export interface LedgerParams {
    desde: Date;
    hasta: Date;
    operador?: string | null;
    establecimiento?: string | null;
    /** `true` solo las aprobadas, `false` solo las rechazadas, `null` todas. */
    aprobadas?: boolean | null;
}

export interface LedgerFila {
    fecha: string;          // 'AAAA-MM-DD'
    turno: string | null;   // 'day' | 'night' | null
    local: string | null;
    operador: string | null;
    alerta: string | null;  // Menu.model
    alertas: number;        // cuántas novedades hay detrás de esta fila
    bonos: number;          // suma de bonus.bonusPerAlert, ya sellado
    selladas: number;       // cuántas de esas traen sello
}


// ── El armado ─────────────────────────────────────────────────────────

const id = (v?: string | null) => (v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null);

/**
 * El $match. Va primero y es lo único que puede usar índice, así que todo lo
 * que se pueda filtrar acá NO se filtra después.
 */
const filtro = ({ desde, hasta, operador, establecimiento, aprobadas }: LedgerParams) => {
    const match: Record<string, unknown> = { date: { $gte: desde, $lte: hasta } };

    const idOperador = id(operador);
    if (idOperador) match['sharedByUser.user.id'] = idOperador;

    // Los dos lugares donde puede estar el local, según la edad del documento.
    const idLocal = id(establecimiento);
    if (idLocal) match.$or = [{ establishment: idLocal }, { 'local.idLocal': idLocal }];

    if (aprobadas === true) match['validationResult.isApproved'] = true;
    if (aprobadas === false) match['validationResult.isApproved'] = false;

    return match;
};

const pipeline = (params: LedgerParams): PipelineStage[] => [
    { $match: filtro(params) },

    // Proyección temprana: de acá en adelante Mongo mueve seis campos por
    // documento en vez del documento entero, imágenes incluidas.
    {
        $project: {
            _id: 0,
            fecha: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            turno: '$shift',
            local: { $ifNull: ['$establishment', '$local.idLocal'] },
            operador: '$sharedByUser.user.id',
            alerta: '$menuRef',
            // `applies` en true es el único caso que paga. Un null significa
            // que la novedad no se evaluó todavía, no que valga cero.
            bono: {
                $cond: [{ $eq: ['$bonus.applies', true] }, { $ifNull: ['$bonus.bonusPerAlert', 0] }, 0],
            },
            sellada: { $cond: [{ $eq: [{ $type: '$bonus.applies' }, 'bool'] }, 1, 0] },
        },
    },

    {
        $group: {
            _id: {
                fecha: '$fecha', turno: '$turno', local: '$local',
                operador: '$operador', alerta: '$alerta',
            },
            alertas: { $sum: 1 },
            bonos: { $sum: '$bono' },
            selladas: { $sum: '$sellada' },
        },
    },

    // El orden se decide acá y no en el cliente: ordenar nueve mil filas en el
    // navegador es trabajo que Mongo ya tiene hecho sobre el $group.
    { $sort: { '_id.fecha': 1, '_id.turno': 1, '_id.local': 1, '_id.operador': 1 } },

    {
        $project: {
            _id: 0,
            fecha: '$_id.fecha', turno: '$_id.turno', local: '$_id.local',
            operador: '$_id.operador', alerta: '$_id.alerta',
            alertas: 1, bonos: 1, selladas: 1,
        },
    },
];


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
