import { object, string, boolean, array } from 'yup';
import { Types } from 'mongoose';


const objectIdSchema = string().test(
    'is-valid-objectid',
    '${path} is not a valid ObjectId',
    value => Types.ObjectId.isValid(value)
);

const validate = object().shape({
    name: string(),
    establishmentId: objectIdSchema
})


export const Message = object().shape({
    message: string().required('message is requiered')
});

