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
    bonusCategory: yup.string().nullable().optional(),


    isArea: yup.boolean().required(),
    isDescriptionPerson: yup.boolean().required(),
    car: yup.boolean().required(),

    
    // --- Sistema de bonificación ---
    // Opcional: una alerta puede crearse sin bonificación y configurarse
    // despues. Lo que SI se valida es que, si viene, los numeros tengan
    // sentido: la acumulacion es divisor en el corte y un 0 daria infinito.
    bonusSystem: yup.object({
        isEnabled: yup.bool().default(false),
        defaultRule: yup.object({
            bonifies: yup.bool().default(true),
            bonusWorth: yup.number().min(0).default(1),
            accumulationRequired: yup.number().min(1).default(1),
            pointValue: yup.object({
                day: yup.number().min(0).default(0.20),
                night: yup.number().min(0).default(0.30),
            }),
        }),
        franchiseExceptions: yup.array(),
        localExceptions: yup.array(),
        regulationCode: yup.string().default(''),
    }).notRequired().default(undefined),

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
});


export default menuSchema;