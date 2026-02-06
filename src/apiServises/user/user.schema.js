import * as yup from 'yup';


// Sub‑schema para updateByUser
const updateByUserSchema = yup.object({
  idRef: yup
    .string()
    .required('El idRef es obligatorio')
    .matches(/^[0-9a-fA-F]{24}$/, 'idRef debe ser un ObjectId válido'),
    
    change: yup.array().of( yup.string().required('Cada cambio debe ser un string válido')) 
    .required('El campo change es obligatorio') 
    .min(1, 'Debe haber al menos un cambio')

});

export const userUpdateSchema = 
    yup.object({ password: yup .string() .min(6, 'La contraseña debe tener al menos 6 caracteres').optional(), 
        admin: yup.boolean().optional(), 
        super: yup.boolean().optional(), 
        inabilited: yup.boolean().optional(), 
        shiftSchedule: yup.string().oneOf(['day', 'nigth'], 'shiftSchedule debe ser "day" o "nigth"') .optional()}).noUnknown(true);