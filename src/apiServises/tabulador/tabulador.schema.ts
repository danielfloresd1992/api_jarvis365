import * as yup from 'yup';

// ══════════════════════════════════════════════════════════════════════
// LO QUE ACEPTA EL CRUD DEL TABULADOR
// ══════════════════════════════════════════════════════════════════════
// Mismo criterio que bonusRule.schema.ts: lo que viene mal se RECHAZA con
// 400 y con el motivo, no se corrige en silencio. Aqui el resultado es lo
// que cobra una persona, y un cero que se cuela como 1 se paga.
//
// El mismo esquema sirve para crear y para editar: un PUT es un reemplazo
// completo, asi que los campos ausentes vuelven a su valor por defecto en
// los dos casos.


/** Un monto en dolares: numero, no negativo. */
const dolares = (nombre: string) => yup.number()
    .typeError(`${nombre} debe ser un número`)
    .min(0, `${nombre} no puede ser negativo`);


const tabuladorSchema = yup.object({

    // ── Identificacion ────────────────────────────────────────────────
    // `.required()` en yup rechaza tambien la cadena vacia. Se pasa a
    // mayusculas aqui ademas de en el modelo: asi el valor que se compara
    // contra el indice unico es el mismo que se guarda.
    name: yup.string().trim().uppercase().required('El cargo necesita un nombre'),

    order: yup.number()
        .typeError('El orden debe ser un número')
        .integer('El orden debe ser un número entero')
        .min(0, 'El orden no puede ser negativo')
        .default(100),


    // ── Los cuatro numeros de la hoja ─────────────────────────────────
    monthlyBasePackage: dolares('El paquete mensual base').required('Hace falta el paquete mensual base'),

    fullPackage: dolares('El paquete completo').required('Hace falta el paquete completo'),

    complementaryBonus: dolares('El bono complementario').default(0),

    overtimeHourRate: dolares('La hora extra').required('Hace falta la hora extra'),

    // `null` es "usar la formula". Un numero solo cuando difiere de ella a
    // proposito, como el 130 de RRHH en la hoja.
    zeroMarginOverride: dolares('El margen "0" manual').nullable().default(null),


    // ── Baja ──────────────────────────────────────────────────────────
    active: yup.boolean().default(true),
})
    // Con `stripUnknown: true` al validar, esto deja afuera `_id`,
    // `createdBy`, `updatedBy` y los timestamps: los pone el servidor.
    .noUnknown()

    // El margen "0" es completo - base. Negativo significaria que el total
    // paga menos que la base, y ninguna fila de la hoja hace eso. Va aqui y
    // no en Mongoose porque un findByIdAndUpdate no ve el documento entero.
    .test(
        'completo-no-menor-que-base',
        'El paquete completo no puede ser menor que el paquete mensual base',
        v => v == null || v.fullPackage == null || v.monthlyBasePackage == null || v.fullPackage >= v.monthlyBasePackage,
    );


/** Un cargo ya validado, listo para escribir. El tipo sale del esquema:
 *  la validacion y el tipo no pueden separarse. */
export type TabuladorInput = yup.InferType<typeof tabuladorSchema>;


export default tabuladorSchema;
