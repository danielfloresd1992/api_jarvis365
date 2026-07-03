import * as yup from 'yup';
import { ObjectId } from 'mongodb';



yup.addMethod(yup.string, 'objectId', function(){
    return this.test('objectId', 'Debe ser un ObjectId válido', value => {
        return value == null || ObjectId.isValid(value);
    });
});


// Los formularios envían '' cuando el campo numérico viene vacío:
// se trata como "no enviado" para que aplique el default del campo
const emptyStringToUndefined = (value, originalValue) =>
    originalValue === '' ? undefined : value;




export const localValidateComplete = yup.object({

    franchise: yup.string(), // is deprecated

    idLocal: yup.string().required(), // is deprecated


    franchiseReference: yup.object({
        name_franchise: yup.string().required(),
        franchise: yup.string().objectId().required(),
    }).required(),

    name: yup.string().required(),
    location: yup.string().required(),

    isActive: yup.boolean().default(true),

    typeMonitoring: yup.string()
        .oneOf(['analytical', 'analytical and perimeter', 'perimeter'])
        .required(),

   
    lang: yup.string().default('es'),

    touchs: yup.object({
        totalManager: yup.number().transform(emptyStringToUndefined).integer().default(0),
        totalAttendee: yup.number().transform(emptyStringToUndefined).integer().default(0),
        typeEvaluationTouch: yup.string().default('simple'),
        isRequiredeEvaluation: yup.boolean().default(false),
        isEvaluationGroup: yup.boolean().default(false)
    }),

    dishes: yup.array().of(yup.string().objectId()),

    managers: yup.array().of(yup.string().objectId()),

    timeServices: yup.string().objectId(),
    timeDelays: yup.string().objectId(),
    shedules: yup.string().objectId(),
    config_report: yup.string().objectId(),

    date: yup.date(),

    image: yup.string().nullable(),

    DST: yup.object({
        isActive: yup.boolean().required(),
        TimeZone: yup.string().required(),
    }).default(undefined),

    alertLength: yup.string()
        .oneOf(['simplified', 'extended'])
        .default('extended'),

    timestamps: yup.object({
        createdAt: yup.object({
            time: yup.date().default(() => new Date()),
            by_user: yup.object({
                name: yup.string().required(),
                id: yup.string().objectId().required(),
            }).required(),
        }).required(),
    }).required(),
});




const timeFormat = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

export const timeServicesValidate = yup.object({

    TableCleaning: yup.string()
        .matches(timeFormat, 'TableCleaning debe tener formato HH:mm:ss')
        .default('00:00:00'),

    firstAtenttion: yup.string()
        .matches(timeFormat, 'firstAtenttion debe tener formato HH:mm:ss')
        .default('00:00:00'),

    rest: yup.array().default([]),
});