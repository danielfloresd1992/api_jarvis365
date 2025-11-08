import { object, string, boolean, array } from 'yup';
import { Types } from 'mongoose';


const objectIdSchema = string().test(
    'is-valid-objectid',
    '${path} is not a valid ObjectId',
    value => Types.ObjectId.isValid(value)
);





export const documentSchema = object().shape({
    shift: string().required(),
    date: string().required(),
    franchiseName: string(),
    franchiseId: string(),
    establishmentName: string(),
    establishmentId: string(),
    jarvisNewsHydration: boolean(),
    type: string()
});



export const documentSchemaComplete = object().shape({
    shift: string().required('Shift is required'),
    date: string().required('Date is required'),
    establishmentName: string(),
    establishmentId: string(),
    franchiseName: string(),
    franchiseId: string(),
    createdDocument: object().shape({
        nameUser: string().required('User name is required'),
        _id: objectIdSchema.required('User ID is required')
    }),
    editedOrViewedBy: array().of(
        object().shape({
            nameUser: string().required('User name is required'),
            _id: objectIdSchema.required('User ID is required')
        })
    ),
    pages: array().of(objectIdSchema),
    jarvisNewsHydration: boolean().default(false),
    type: string()
});




export const documentSchemaPartial = object().shape({

    editedOrViewedBy: array().of(
        object().shape({
            nameUser: string().required('User name is required'),
            _id: objectIdSchema.required('User ID is required')
        })
    ),
    pages: array().of(objectIdSchema),
    jarvisNewsHydration: boolean()
});