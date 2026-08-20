import * as yup from 'yup';
import { objectId } from './bonusRule.schema.js';
import { MAX_DIAS } from './bonusLedger.lib.js';

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
})
    .noUnknown()
    .test('orden', 'La fecha inicial tiene que ser anterior a la final',
        v => !v?.desde || !v?.hasta || v.desde <= v.hasta)
    .test('rango', `El rango no puede pasar de ${MAX_DIAS} días`,
        v => !v?.desde || !v?.hasta || (+v.hasta - +v.desde) <= MAX_DIAS * DIA_MS);

export type BonusLedgerQuery = yup.InferType<typeof bonusLedgerQuerySchema>;

export default bonusLedgerQuerySchema;
