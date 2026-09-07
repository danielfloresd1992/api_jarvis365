import * as yup from 'yup';
import { CUT_KINDS, type CutKind } from './nomina.model.js';

// ══════════════════════════════════════════════════════════════════════
// LO QUE ACEPTA EL CRUD DE NOMINA
// ══════════════════════════════════════════════════════════════════════
// Mismo criterio que tabulador.schema.ts: lo que viene mal se RECHAZA con 400
// y con el motivo, no se corrige en silencio. Aqui el resultado es lo que
// cobra una persona, y un cero que se cuela como 1 se paga.
//
// Son TRES cuerpos distintos y por eso tres esquemas:
//
//   abrir un mes           que mes es y a quien se le paga
//   teclear una quincena   los tres conteos y los dos descuentos
//   teclear margen0/bono   solo el descuento
//
// Los dos ultimos no comparten campos con el primero, y entre ellos comparten
// uno solo. Un unico esquema permisivo dejaria mandar horas extras a un corte
// que no cubre dias trabajados, y esas horas se pagarian.
//
// NINGUNO ACEPTA `people`, `cuts`, `status` NI `settled`. El sello lo arma el
// servidor copiando el tabulador: si el cliente pudiera mandarlo, podria
// firmar cifras que el tabulador nunca dijo, que es exactamente lo que el
// sello existe para impedir. Y el estado solo lo mueve la ruta de cerrar.
//
// TAMPOCO ACEPTA LA TASA. Es una variable global del sistema
// (apiServises/exchangeRate) y se valida alli. Pedirla aqui la volveria a
// meter dentro del mes, que es justo lo que se saco.
//
// NI EL TITULO NI LAS FECHAS. Salen de `year` y `month`: el titulo se arma con
// el nombre del mes y las fechas de cada corte las pone el calendario. Dejar
// que el cliente los mande abriria la puerta a un mes que se llama "Agosto" y
// dice ser el 9.


/**
 * Un monto en dolares: numero, no negativo, y cero si no viene. El defecto no
 * es comodidad: el PUT de una fila es un reemplazo completo, asi que un campo
 * ausente significa "no le descuentes nada", no "dejalo como estaba".
 *
 * Los nombres van en masculino singular porque los mensajes se arman con
 * ellos, igual que en tabulador.schema.ts: "Las horas extras debe ser un
 * número" seria una falta de ortografia que ve el usuario.
 */
const dolares = (nombre: string) => yup.number()
    .typeError(`${nombre} debe ser un número`)
    .min(0, `${nombre} no puede ser negativo`)
    .default(0);


/**
 * Un conteo de la hoja: dias u horas. Entero porque asi se cuentan en el
 * Excel (no hay medio domingo trabajado) y en cero por lo mismo que arriba:
 * una fila sin novedades es lo normal.
 */
const conteo = (nombre: string) => yup.number()
    .typeError(`${nombre} debe ser un número`)
    .integer(`${nombre} debe ser un número entero`)
    .min(0, `${nombre} no puede ser negativo`)
    .default(0);


/**
 * Un id de Mongo tal como viaja en JSON: veinticuatro digitos hexadecimales.
 * Se comprueba la forma aqui para que una lista con basura salga como 400 con
 * su motivo, y no como un CastError a media consulta cuando ya no se sabe
 * cual de los ids era el malo.
 */
const ID_DE_MONGO = /^[0-9a-f]{24}$/i;


const nominaMonthSchema = yup.object({

    // ── Que mes es ────────────────────────────────────────────────────
    // Con año y mes basta: el titulo y las fechas de los cuatro cortes salen
    // de aqui. El minimo no es una fecha de negocio, es un filtro contra un
    // año de dos cifras o un cero tecleados por error.
    year: yup.number()
        .typeError('El año debe ser un número')
        .integer('El año debe ser un número entero')
        .min(2000, 'El año no parece un año')
        .max(2100, 'El año no parece un año')
        .required('Hace falta el año del mes de nómina'),

    month: yup.number()
        .typeError('El mes debe ser un número')
        .integer('El mes debe ser un número entero')
        .min(1, 'El mes va del 1 al 12')
        .max(12, 'El mes va del 1 al 12')
        .required('Hace falta el mes'),


    // ── Como se reparte el paquete base ───────────────────────────────
    // Cuantas veces se paga el mes. Entero porque son pagos contados, no una
    // proporcion. El 2 va literal; ver la nota del mismo campo en
    // nomina.model.ts.
    payPeriodsPerMonth: yup.number()
        .typeError('La cantidad de pagos del mes debe ser un número')
        .integer('La cantidad de pagos del mes debe ser un número entero')
        .min(1, 'El mes se paga al menos una vez')
        .default(2),


    // ── Quienes entran al mes ─────────────────────────────────────────
    // La lista se marca casilla por casilla en pantalla y no se deduce de
    // quien esta activo en el sistema: en todo mes hay alguien de vacaciones
    // que no cobra y alguien que entro a mitad de mes que si. Deducirla
    // obligaria a deshacer despues lo que el sistema supuso, y borrar una fila
    // de un mes ya armado es mas facil de olvidar que no marcarla.
    //
    // Vacia se rechaza: un mes sin nadie no es un mes a medias, es un
    // documento que parece hecho y no le paga a ninguna persona.
    //
    // `.lowercase()` ANTES de comparar contra la base: el regex de arriba
    // admite hexadecimal en cualquier caja, pero Mongo devuelve siempre
    // minusculas. Sin normalizar, un id copiado de un log en mayusculas pasa
    // la validacion, la persona SE ENCUENTRA, y la ruta la acusa igual de
    // inexistente porque compara los textos: el mes no se abre y quien lo arma
    // va a buscar a un empleado que si esta en el sistema.
    users: yup.array()
        .of(yup.string().lowercase().matches(ID_DE_MONGO, 'Hay un id de persona que no tiene forma de id').required())
        .min(1, 'Hay que elegir al menos una persona para el mes')
        .required('Hay que elegir al menos una persona para el mes'),
})
    // Con `stripUnknown: true` al validar, esto deja afuera `people`, `cuts`,
    // `title` y los timestamps: los pone el servidor.
    .noUnknown();


/**
 * LO QUE SE TECLEA EN UNA QUINCENA: los tres conteos y los dos descuentos.
 *
 * `zeroMarginDeduction` es la columna DES REST MARGEN 0 de la hoja —lo que se
 * le descuenta a la quincena por un margen "0" ya adelantado— y no tiene que
 * ver con el corte `margen0`, que es donde ese dinero se paga.
 */
const quincenaRowSchema = yup.object({

    // ── Lo que se le suma ─────────────────────────────────────────────
    sundays: conteo('El conteo de domingos y feriados'),

    additionalDays: conteo('El conteo de días adicionales'),

    overtimeHours: conteo('El conteo de horas extras'),


    // ── Lo que se le resta ────────────────────────────────────────────
    zeroMarginDeduction: dolares('El descuento del margen "0"'),

    otherDeductions: dolares('El resto de los descuentos'),
})
    // Sin claves de mas: la fila no trae el sello ni el nombre, que viven en
    // `people`, y nada de eso se edita desde aqui. El sello se corrige
    // rehaciendo el mes, no tecleando otro paquete base.
    .noUnknown();


/**
 * LO QUE SE TECLEA EN MARGEN "0" Y EN BONO: solo el descuento.
 *
 * El monto no se teclea, lo pone el cargo. Y no hay conteos porque estos dos
 * cortes no cubren dias trabajados: son cifras del tabulador que se pagan una
 * vez al mes. Con `stripUnknown` un cliente que mande `sundays` no rompe nada,
 * pero tampoco cobra por ello, que es lo correcto.
 */
const extraRowSchema = yup.object({

    otherDeductions: dolares('El descuento'),
})
    .noUnknown();


/**
 * El esquema que le toca a un corte.
 *
 * Se elige por el tipo y no por lo que traiga el cuerpo: si dependiera del
 * cuerpo, mandar `sundays` a un corte de bono lo convertiria en una quincena.
 */
export const rowSchemaFor = (kind: CutKind) =>
    kind === 'margen0' || kind === 'bono' ? extraRowSchema : quincenaRowSchema;


/**
 * LO QUE PUEDE TRAER UNA FILA, sea cual sea el corte.
 *
 * Los cuatro conteos van opcionales y el descuento no: es el unico campo que
 * existe en los cuatro cortes. El tipo describe la union de los dos esquemas,
 * no lo que valida cada uno —de eso se encarga `rowSchemaFor`— y por eso quien
 * lo lee tiene que suponer que un conteo puede faltar, que es exactamente lo
 * que pasa en margen "0" y en bono.
 */
export interface NominaRowMovements {
    sundays?: number;
    additionalDays?: number;
    overtimeHours?: number;
    zeroMarginDeduction?: number;
    otherDeductions: number;
}


/**
 * Valida una fila con el esquema de su corte y devuelve un tipo utilizable.
 *
 * Existe porque `rowSchemaFor` devuelve la UNION de dos esquemas de yup, y
 * sobre una union TypeScript solo garantiza los campos comunes: el resultado
 * de su `.validate()` sale tipado como `{ otherDeductions }` y los cuatro
 * conteos de una quincena dejan de existir para el compilador. Resolver la
 * rama aqui, donde se conocen los dos esquemas, deja el tipo correcto sin un
 * `as` en la ruta, que es donde un `as` de mas se paga.
 */
export const validateRow = async (
    kind: CutKind,
    cuerpo: unknown,
    opciones: { abortEarly: boolean; stripUnknown: boolean },
): Promise<NominaRowMovements> => (
    kind === 'margen0' || kind === 'bono'
        ? extraRowSchema.validate(cuerpo, opciones)
        : quincenaRowSchema.validate(cuerpo, opciones)
);


/** ¿Es uno de los cuatro? Para rechazar un tipo inventado en la URL con un 404
 *  claro en vez de dejar que la busqueda no encuentre nada y suene a otra cosa. */
export const isCutKind = (valor: unknown): valor is CutKind =>
    typeof valor === 'string' && (CUT_KINDS as readonly string[]).includes(valor);


/** Un mes ya validado, listo para crear. El tipo sale del esquema: la
 *  validacion y el tipo no pueden separarse. */
export type NominaMonthInput = yup.InferType<typeof nominaMonthSchema>;

/** Los movimientos de una fila de quincena, ya validados. */
export type QuincenaRowInput = yup.InferType<typeof quincenaRowSchema>;

/** El descuento de una fila de margen "0" o de bono, ya validado. */
export type ExtraRowInput = yup.InferType<typeof extraRowSchema>;


// Sin `export default`: son tres esquemas y ninguno es "el" esquema del
// recurso. Nombrarlos en el import obliga a decir cual se esta validando.
export { nominaMonthSchema, quincenaRowSchema, extraRowSchema };
