import * as yup from 'yup';


const menuSchema = yup.object({
  // --- Idiomas principales ---
    es: yup.string().required('El campo ES es obligatorio'),
    en: yup.string().required('El campo EN es obligatorio'),

    // --- Títulos para reportes ---
    titleForDocumentReport: yup.object({
        es: yup.string().nullable().default(null),
        en: yup.string().nullable().default(null),
    }),

    textHeader: yup.object({
        es: yup.string(),
        en: yup.string(),
    })
    .nullable()      // <--- Permite que el valor sea null
    .default(null),


    // --- Especial ---
    especial: yup.object({
        time: yup.object({
        timeInitTitle: yup.object({
            es: yup.string(),
            en: yup.string(),
        }),
        timeEndTitle: yup.object({
            es: yup.string(),
            en: yup.string(),
        }),
        }),
    })
    .nullable()      // <--- Permite que el valor sea null
    .default(null),


    // --- Booleanos y contadores ---
    timeUnique: yup.boolean().required(),
    amountOfSomething: yup.boolean(),
    time: yup.boolean().required(),
    table: yup.boolean().required(),
    managerReferenceId: yup.boolean().required(),
    managerReferenceTitle: yup.boolean().required(),
    // --- Fotos ---
    photos: yup.object({
        length: yup.number().required(),
        isRequirePrint: yup.boolean(),
        caption: yup.array().of(
            yup.object({
                index: yup.number().required(),
                es: yup.string().required(),
                en: yup.string().required(),
            })
        ),
    }),

    doesItrequireVideo: yup.boolean().default(false),
    
    // Categoría OPERATIVA: 'delay', 'food', 'employee'… Lista fija, no se
    // administra (ver la nota en menu.model.js).
    category: yup.string().required(),

    // Categoría de BONIFICACIÓN: con qué criterio agrupa esta alerta en los
    // cortes de bono. Opcional a propósito — las alertas que ya existen no
    // tienen ninguna y se siguen guardando sin problema.


    isArea: yup.boolean().required(),
    isDescriptionPerson: yup.boolean().required(),
    car: yup.boolean().required(),

    
    // --- Configuración de Reportes ---
    useOnlyForTheReportingDocument: yup.boolean().default(false),
    useOfLiveAlertForTheCustomer: yup.boolean().default(false),
    noSubtitleInTheReport : yup.boolean().default(false),
    // Enum validation
    groupingInTheReport: yup.string()
        .oneOf(['individual', 'dual', 'quadruple'], 'Valor no válido. Opciones: individual, dual, quadruple')
        .nullable()
        .default(null),

    descriptionNoteForReportDocument: yup.boolean().default(false),

    // ══════════════════════════════════════════════════════════════════
    // QUÉ LE HACE ESTA ALERTA A LA CONEXIÓN CON EL DVR
    // ══════════════════════════════════════════════════════════════════
    //   'down'  reporta que el establecimiento se quedó sin cámaras
    //   'up'    reporta que la conexión volvió
    //   null    una alerta cualquiera (lo normal)
    //
    // Es lo que permite que el sistema RECONOZCA esas dos alertas sin volver a
    // atarlas a un `_id` escrito a mano. Ver la nota larga en menu.model.js.
    //
    // Se declara acá aunque el esquema no rechace campos desconocidos: sin esto
    // el valor entraba igual pero SIN VALIDAR, y un 'arriba' o un 'UP' recién lo
    // atajaba Mongoose al guardar, con un mensaje que no dice cuáles son las
    // opciones. Marcar mal esta alerta es lo que puede dejar a un local sin
    // poder reportar, así que conviene que falle temprano y explicando.
    //
    // Nullable y sin `required`: las alertas normales —que son casi todas— se
    // siguen creando sin mencionarlo.
    dvrEffect: yup.string()
        .oneOf(['down', 'up', null], 'Valor no válido. Opciones: down (se cayó la conexión), up (se restableció)')
        .nullable()
        .default(null),
});


export default menuSchema;