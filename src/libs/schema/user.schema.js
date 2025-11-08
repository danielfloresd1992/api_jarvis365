import { object, string, number, date, array } from 'yup';


export const userSchema = object().shape({
    user: string().required(),
    password: string().required(),
    email: string().required(),
    name: string().required(),
    surName: string().required(),
    phone: string().required(),
    createdOn: date().default(() => new Date()),
});


export const userSchemaMinime = object().shape({
    password: string().required(),
    email: string().required(),
});


export const userSchemaLegacy = object().shape({
    user: string().required(),
    password: string().required(),
    newPassword: string().required(),
    email: string().required(),
    phone: string().required()
});

