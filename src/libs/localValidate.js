import * as yup from 'yup';
import { ObjectId } from 'mongodb';


yup.addMethod(yup.string, 'objectId', function(){
    return this.test('objectId', 'Debe ser un ObjectId válido', value => {
        return ObjectId.isValid(value);
    })
    .transform((value) => {
        return new ObjectId(value);
    });
});
  


export const localValidateComplete = yup.object({

    franchise: yup.string(),


    idLocal: yup.string().required(),
    status: yup.string(),

    franchiseReference: yup.object({
        name_franchise: yup.string().required(),
        franchise: yup.string().required(),
    }).required(),

    name: yup.string().required(),
    location: yup.string().required(),
    isActive: yup.string().required(),
    typeMonitoring: yup.string().required(),

    order: yup.number().required().integer(),
    lang: yup.string().required(),

    touchs: yup.object({
        totalManager: yup.number().required().integer(),
        totalAttendee: yup.number().required().integer(),
        typeEvaluationTouch: yup.string().required(),
        isRequiredeEvaluation: yup.boolean().required(),
        isEvaluationGroup: yup.boolean().required()
    }),

    dishMenu: yup.object({
        appetizer: yup.string().required(),
        mainDish: yup.string().required(),
        dessert: yup.string().required(),
        dishEvaluation: yup.string().required(),
        isRequiredeEvaluation: yup.boolean().required(),
        isEvaluationGroup: yup.boolean().required()
    }),

    image: yup.string(),

    alertLength: yup.string(),

    timestamps: yup.object({
        createdAt: yup.object({
            time: yup.date().default(() => new Date()),
            by_user: yup.object({
                name: yup.string().required(),
                id: yup.string().required(),
            }).required(),
        }).required(),
    }).required(),
});