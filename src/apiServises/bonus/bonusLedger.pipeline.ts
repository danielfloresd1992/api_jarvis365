import { Types } from 'mongoose';
// `PipelineStage` es solo un tipo: importarlo como valor rompe en tiempo de
// ejecución, porque mongoose no lo exporta.
import type { PipelineStage } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// EL LIBRO DE BONOS — CÓMO SE ARMA LA CONSULTA
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


/**
 * POR QUÉ SE PUEDE ELEGIR EL AGRUPADO
 *
 * La misma consulta responde preguntas de tamaños muy distintos:
 *
 *     agrupadoPor=operador               ~60 filas    el resumen general
 *     agrupadoPor=alerta                 ~84 filas    el top de alertas
 *     agrupadoPor=dia,operador          ~5.000 filas  la serie del período
 *     (todas)                           ~9.000 filas  el detalle, como Op_DataBase
 *
 * Pedir el detalle para después sumarlo en el navegador es mover nueve mil
 * filas para mostrar sesenta. Agrupar es lo que Mongo ya está haciendo: hacerlo
 * al nivel que se va a mostrar no cuesta nada más y ahorra todo lo demás.
 */
export const DIMENSIONES = ['dia', 'turno', 'local', 'operador', 'alerta'] as const;

export type Dimension = typeof DIMENSIONES[number];

// La misma lista está en bonusLedger.schema.ts, que es quien la valida. Este
// test lo hace notar si alguna vez se separan.

export interface LedgerParams {
    desde: Date;
    hasta: Date;
    operador?: string | null;
    establecimiento?: string | null;
    /** `true` solo las aprobadas, `false` solo las rechazadas, `null` todas. */
    aprobadas?: boolean | null;
    /** Por qué columnas agrupar. Vacío = todas, o sea el detalle completo. */
    agrupadoPor?: Dimension[] | null;
}

/** Una fila trae las dimensiones que se pidieron, más siempre las sumas. */
export type LedgerFila = Partial<Record<Dimension, string | null>> & {
    alertas: number;        // cuántas novedades hay detrás de esta fila
    bonos: number;          // suma de bonus.bonusPerAlert, ya sellado
    selladas: number;       // cuántas de esas traen sello
};


// ── El armado ─────────────────────────────────────────────────────────

const id = (v?: string | null) => (v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null);

/**
 * El $match. Va primero y es lo único que puede usar índice, así que todo lo
 * que se pueda filtrar acá NO se filtra después.
 */
export const filtro = ({ desde, hasta, operador, establecimiento, aprobadas }: LedgerParams) => {
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

/** De dónde sale cada dimensión en el documento. */
const ORIGEN: Record<Dimension, unknown> = {
    dia: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
    turno: '$shift',
    // Los dos lugares donde puede estar el local, según la edad del documento.
    local: { $ifNull: ['$establishment', '$local.idLocal'] },
    operador: '$sharedByUser.user.id',
    alerta: '$menuRef',
};

/** Las pedidas, en el orden declarado y sin repetidas. */
export const dimensionesDe = (pedidas?: Dimension[] | null): Dimension[] => {
    const set = new Set(pedidas ?? []);
    const usadas = DIMENSIONES.filter(d => set.has(d));
    return usadas.length ? usadas : [...DIMENSIONES];
};

export const buildPipeline = (params: LedgerParams): PipelineStage[] => {
    const dims = dimensionesDe(params.agrupadoPor);
    /** Las mismas claves en las dos formas que las nombra el pipeline. */
    const claves = (prefijo: string) => Object.fromEntries(dims.map(d => [d, `${prefijo}${d}`]));

    return [
        { $match: filtro(params) },

        // Proyección temprana: de acá en adelante Mongo mueve un puñado de
        // campos por documento en vez del documento entero, imágenes incluidas.
        // Y solo las dimensiones pedidas: agrupar por operador no necesita
        // calcular la fecha de cien mil documentos.
        {
            $project: {
                _id: 0,
                ...Object.fromEntries(dims.map(d => [d, ORIGEN[d]])),
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
                _id: claves('$'),
                alertas: { $sum: 1 },
                bonos: { $sum: '$bono' },
                selladas: { $sum: '$sellada' },
            },
        },

        // El orden se decide acá y no en el cliente: ordenar miles de filas en
        // el navegador es trabajo que Mongo ya tiene hecho sobre el $group.
        { $sort: Object.fromEntries(dims.map(d => [`_id.${d}`, 1])) as Record<string, 1> },

        {
            $project: {
                _id: 0,
                ...claves('$_id.'),
                alertas: 1, bonos: 1, selladas: 1,
            },
        },
    ];
};



export default buildPipeline;
