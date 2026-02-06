import * as yup from 'yup';


// Sub‑schema para updateByUser
const updateByUserSchema = yup.object({
  idRef: yup
    .string()
    .required('El idRef es obligatorio')
    .matches(/^[0-9a-fA-F]{24}$/, 'idRef debe ser un ObjectId válido')
});

// Schema principal
export const userSchema = yup.object({
  user: yup
    .string()
    .required('El usuario es obligatorio'),

  password: yup
    .string()
    .required('La contraseña es obligatoria'),

  email: yup
    .string()
    .email('Formato de email inválido')
    .required('El email es obligatorio'),

  name: yup
    .string()
    .required('El nombre es obligatorio'),

  surName: yup
    .string()
    .required('El apellido es obligatorio'),

  phone: yup
    .string()
    .required('El teléfono es obligatorio'),

  admin: yup
    .boolean()
    .default(false),

  super: yup
    .boolean()
    .default(false),

  inabilited: yup
    .boolean()
    .default(false),

  date: yup
    .date()
    .default(() => new Date()),

  createdOn: yup
    .date()
    .default(() => new Date()),

  shiftSchedule: yup
    .string()
    .oneOf(['day', 'nigth'], 'shiftSchedule debe ser "day" o "nigth"')
    .required('El turno es obligatorio'),

  updateByUser: yup
    .array()
    .of(updateByUserSchema)
    .default([])
});
