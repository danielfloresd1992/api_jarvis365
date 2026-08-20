import * as yup from 'yup';

// ══════════════════════════════════════════════════════════════════════
// LO QUE ACEPTA EL CRUD DE REGLAS
// ══════════════════════════════════════════════════════════════════════
// Reemplaza a la normalización imperativa que había antes, y cambia el criterio:
// aquélla CORREGÍA en silencio lo que venía mal —un `alertsRequired: 0` quedaba
// en 1, un `scope.mode` mal escrito caía en 'all' y ensanchaba el alcance a
// todos los establecimientos— y respondía 200. Acá se RECHAZA con 400 y con el
// motivo, que es lo que corresponde cuando el resultado es dinero.
//
// El mismo esquema sirve para crear y para editar: un PUT de regla es un
// reemplazo completo, así que los campos ausentes vuelven a su valor por
// defecto en los dos casos.


/**
 * Un ObjectId tal como llega en JSON: 24 caracteres hexadecimales.
 *
 * Con expresión regular y no con `Types.ObjectId.isValid()` porque aquélla
 * también acepta cualquier cadena de 12 caracteres y los números. Con eso, un id
 * mal tipeado pasaría la validación y la regla quedaría con un alcance que no es
 * el que se cargó — sin error visible.
 */
export const objectId = (nombre: string) => yup.string()
    .matches(/^[0-9a-fA-F]{24}$/, `${nombre} no es un identificador válido`);


/**
 * Los dos números que el reglamento escribe juntos: "3x1" son tres alertas por
 * un bono. Misma forma en la regla general y en cada excepción.
 */
const cuantoOtorga = () => ({

    // Entero: no existe "2,5 alertas". Y mínimo 1 porque es DIVISOR al calcular
    // cuánto vale cada alerta — un 0 daría infinito.
    alertsRequired: yup.number()
        .typeError('Las alertas necesarias deben ser un número')
        .integer('Las alertas necesarias deben ser un número entero')
        .min(1, 'Hace falta al menos 1 alerta')
        .default(1),

    // Éstos SÍ admiten decimales: el reglamento tiene casos de 1 en diurno y 1,5
    // en nocturno, y no hay un multiplicador único entre los dos.
    bonusAwarded: yup.object({
        day: yup.number()
            .typeError('Los bonos del turno diurno deben ser un número')
            .min(0, 'Los bonos del turno diurno no pueden ser negativos')
            .default(1),

        night: yup.number()
            .typeError('Los bonos del turno nocturno deben ser un número')
            .min(0, 'Los bonos del turno nocturno no pueden ser negativos')
            .default(1),
    }),
});


/**
 * Dónde aplica una asignación.
 *
 * Ya no es parte de la regla: es parte de cada asignación en Menu.bonusRules. Se
 * valida en el PUT que escribe esas asignaciones.
 */
export const scopeSchema = yup.object({
    mode: yup.string()
        .oneOf(['all', 'only', 'except'], 'El alcance debe ser all, only o except')
        .default('all'),

    franchises: yup.array().of(objectId('La marca')).default([]),
    locals: yup.array().of(objectId('El establecimiento')).default([]),
})
    .test(
        'only-necesita-lista',
        'Con el alcance en "only" hay que indicar al menos una marca o un establecimiento',
        // 'only' sin nada listado es una regla que NO aplica en ningún lado: se
        // guardaría sin error y no pagaría nunca. 'except' vacío no tiene ese
        // problema — equivale a "en todos", que es inofensivo.
        v => v?.mode !== 'only' || Boolean(v.franchises?.length || v.locals?.length),
    );


const bonusRuleSchema = yup.object({

    // ── Identificación ────────────────────────────────────────────────
    // `.required()` en yup rechaza también la cadena vacía, así que cubre el
    // caso de un nombre en blanco sin chequeo aparte.
    name: yup.string().trim().required('La regla necesita un nombre'),

    description: yup.string().trim().default(''),

    // El ítem del reglamento: "1.1", "R2.6". Permite cotejar con el PDF.
    regulationCode: yup.string().trim().default(''),

    // El `value` del catálogo de categorías. `null` = sin categoría, que es un
    // estado válido: la regla bonifica igual, solo no agrupa en los cortes.
    bonusCategory: yup.string().trim().nullable().default(null),


    // ── Cuánto otorga ─────────────────────────────────────────────────
    ...cuantoOtorga(),


    // ── Excepciones ───────────────────────────────────────────────────
    overrides: yup.array().of(
        yup.object({
            franchise: objectId('La marca de la excepción').nullable().default(null),
            local: objectId('El establecimiento de la excepción').nullable().default(null),

            ...cuantoOtorga(),

            // Por qué acá es distinto. En seis meses nadie recuerda si fue una
            // decisión o un error de carga.
            note: yup.string().trim().default(''),
        })
            .test(
                'marca-o-local',
                'Cada excepción tiene que declarar una marca O un establecimiento, no las dos ni ninguna',
                // Sin ninguna de las dos, la excepción no aplica en ningún lado
                // y no hace nada. Con las dos, gana la del local y la de la
                // marca queda muerta: en los dos casos hay algo mal cargado que
                // conviene avisar en vez de guardar.
                v => Boolean(v?.franchise) !== Boolean(v?.local),
            ),
    ).default([]),


    // ── Baja ──────────────────────────────────────────────────────────
    // Una regla en uso no se borra: se desactiva. El DELETE lo rechaza con 409.
    active: yup.boolean().default(true),
})
    // Con `stripUnknown: true` al validar, esto deja afuera lo que el cliente no
    // puede escribir: `createdBy`, `updatedBy`, `_id` y los timestamps los pone
    // el servidor.
    .noUnknown();


/**
 * Lo que acepta la asignación de reglas a una alerta: la lista COMPLETA de sus
 * asignaciones, cada una con su regla y su alcance.
 *
 * Es la lista completa y no un delta porque así el servidor puede validar el
 * conjunto: dos asignaciones generales serían ambiguas, y eso solo se ve
 * mirando todas juntas.
 *
 * Lista VACÍA es un valor VÁLIDO y significa "esta alerta no bonifica": es una
 * decisión tomada, no un campo sin llenar. El endpoint marca la alerta como
 * revisada en los dos casos.
 */
export const menuBonusRulesSchema = yup.object({
    // El interruptor. `null` = no se decidió, y es lo que traen las alertas
    // anteriores a este campo: no bloquea nada.
    bonifies: yup.boolean().nullable().default(null),

    bonusRules: yup.array().of(
        yup.object({
            rule: objectId('La regla').required('Cada asignación necesita una regla'),
            scope: scopeSchema,
        }),
    )
        .default([])
        .test(
            'una-general-como-mucho',
            'Solo puede haber una asignación general ("en todos"): con dos no habría forma de saber cuál aplica',
            // Dos 'all' para la misma alerta es una ambigüedad que la resolución
            // resolvería por orden de carga — que es lo peor cuando decide un pago.
            lista => (lista || []).filter(a => a?.scope?.mode === 'all').length <= 1,
        ),
}).noUnknown();


/** Una regla ya validada, lista para escribir. Se deriva del esquema: el tipo y
 *  la validacion no pueden separarse. */
export type BonusRuleInput = yup.InferType<typeof bonusRuleSchema>;

/** Las asignaciones ya validadas. */
export type MenuBonusRulesInput = yup.InferType<typeof menuBonusRulesSchema>;


export default bonusRuleSchema;
