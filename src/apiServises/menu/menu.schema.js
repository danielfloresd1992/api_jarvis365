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
    
    category: yup.string().required(),


    isArea: yup.boolean().required(),
    isDescriptionPerson: yup.boolean().required(),
    car: yup.boolean().required(),

    
    // --- Reglas (Deprecated según tu esquema) ---
   
    // --- Reglas de Cálculo de Bonos ---
    bonusCalculationRules: yup.object({
        activate: yup.bool().required(),
        defaultRule: yup.object({
            worth: yup.number().default(0),
            acum: yup.number().default(0),
            bonusValue: yup.number().default(0),
            reglamentoCode: yup.string().default(''),
            description: yup.string().default(''),
            defaultActive: yup.bool().required().default('')
        }),
        localSpecificRules: yup.array(), // Array genérico, puedes definir .of() si sabes la estructura interna
    }),

    // --- Configuración de Reportes ---
    useOnlyForTheReportingDocument: yup.boolean().default(false),
    useOfLiveAlertForTheCustomer: yup.boolean().default(false),

    // Enum validation
    groupingInTheReport: yup.string()
        .oneOf(['individual', 'dual', 'quadruple'], 'Valor no válido. Opciones: individual, dual, quadruple')
        .nullable()
        .default(null),

    descriptionNoteForReportDocument: yup.boolean().default(false),
});


export default menuSchema;