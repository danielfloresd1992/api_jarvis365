import * as yup from 'yup';

/**
 * SIN IMPORTS DE VALOR DESDE `src`, A PROPÓSITO.
 *
 * Los tests corren con `node --test` sobre los .ts, y ahí un
 * `import { x } from './otro.js'` no resuelve: el .js todavía no existe, lo
 * emite Babel al compilar. Los `import type` sí, porque el stripper los borra.
 * Un esquema que dependa de otro módulo de src queda sin poder probarse, y las
 * validaciones son justo lo que hay que probar.
 *
 * Por eso el tope de días y la lista de columnas viven acá: es donde se hacen
 * cumplir. El pipeline y la ruta los leen de este archivo.
 */

/** Ningún rango más largo que esto. Tres meses y un poco de aire. */
export const MAX_DIAS = 92;

/** Por qué columnas se puede agrupar. Lista cerrada: entran al $group. */
export const DIMENSIONES = ['dia', 'turno', 'local', 'operador', 'alerta'] as const;

export type Dimension = typeof DIMENSIONES[number];

const objectId = (nombre: string) => yup.string()
    .matches(/^[0-9a-fA-F]{24}$/, `${nombre} no es un identificador válido`);

/**
 * La consulta del libro de bonos.
 *
 * EL RANGO ES OBLIGATORIO y está acotado. No es una comodidad: sin tope, un
 * `desde=2020` recorre la colección entera y no hay índice que lo salve. El
 * tope se valida acá, antes de tocar Mongo, así que un rango absurdo cuesta
 * una respuesta 400 y cero trabajo de base.
 *
 * Las fechas llegan como 'AAAA-MM-DD' y se expanden al día civil completo:
 * `hasta` incluye su día entero, que es lo que espera quien pide "del 1 al 16"
 * y lo que hace la hoja de cálculo.
 */

/** Un día civil, del primer instante al último. */
const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const finDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const DIA_MS = 24 * 60 * 60 * 1000;

const fecha = (nombre: string) => yup.date()
    .typeError(`${nombre} tiene que ser una fecha`)
    .required(`Falta ${nombre}`);

export const bonusLedgerQuerySchema = yup.object({
    desde: fecha('la fecha inicial').transform((v: Date) => (v instanceof Date && !isNaN(+v) ? inicioDelDia(v) : v)),
    hasta: fecha('la fecha final').transform((v: Date) => (v instanceof Date && !isNaN(+v) ? finDelDia(v) : v)),

    operador: objectId('El operador').nullable().default(null),
    establecimiento: objectId('El establecimiento').nullable().default(null),

    // Tres estados como en el resto del sistema: true, false, y "todas".
    aprobadas: yup.boolean().nullable().default(null),

    /**
     * Por qué columnas agrupar, separadas por coma: `operador`, `alerta`,
     * `dia,operador`… Vacío devuelve el detalle completo.
     *
     * Se valida contra la lista cerrada porque los nombres entran al `$group`
     * de Mongo. Aceptar cualquier texto sería dejar que quien llama arme
     * pedazos del pipeline.
     */
    agrupadoPor: yup.array()
        .transform((valor, original) => (typeof original === 'string'
            ? original.split(',').map(s => s.trim()).filter(Boolean)
            : valor))
        .of(yup.string().oneOf(
            [...DIMENSIONES],
            ({ value }) => `«${value}» no es una columna agrupable. Las que hay: ${DIMENSIONES.join(', ')}`,
        ))
        .nullable()
        .default(null),
})
    .noUnknown()
    .test('orden', 'La fecha inicial tiene que ser anterior a la final',
        v => !v?.desde || !v?.hasta || v.desde <= v.hasta)
    .test('rango', `El rango no puede pasar de ${MAX_DIAS} días`,
        v => !v?.desde || !v?.hasta || (+v.hasta - +v.desde) <= MAX_DIAS * DIA_MS);

export type BonusLedgerQuery = yup.InferType<typeof bonusLedgerQuerySchema>;

export default bonusLedgerQuerySchema;
