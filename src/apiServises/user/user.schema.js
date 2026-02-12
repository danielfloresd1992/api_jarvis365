import * as yup from 'yup';


// Sub‑schema para updateByUser
const updateByUserSchema = yup.object({
    idRef: yup
        .string()
        .required('El idRef es obligatorio')
        .matches(/^[0-9a-fA-F]{24}$/, 'idRef debe ser un ObjectId válido'),

    change: yup.array().of(yup.string().required('Cada cambio debe ser un string válido'))
        .required('El campo change es obligatorio')
        .min(1, 'Debe haber al menos un cambio')

});



export const userSchemaComplete = yup.object({
    // ... campos anteriores (password, admin, etc.)
    password: yup.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional(),
    admin: yup.boolean().optional(),
    super: yup.boolean().optional(),
    inabilited: yup.boolean().optional(),

    jobInformation: yup.object({
        department: yup.string()
            .oneOf(['Operaciones', 'Sistemas y desarrollo', 'Reportes', 'Recursos Humanos'], 'Departamento no válido')
            .optional(),
        position: yup.string()
            .oneOf([
                'Gerente', 'Subgerente', 'Coordinador', 'Operador senior',
                'Operador', 'Analista de sistemas', 'Analista de reportes', 'Analista de RRHH'
            ], 'Puesto no válido')
            .optional()
    }).optional(),

    workSchedule: yup.object({
        shiftType: yup.string().oneOf(['Diurno', 'Nocturno'], 'Turno inválido').optional(),
        startTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').optional(),
        endTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').optional(),
        // NUEVO CAMPO: restDays
        restDays: yup.array()
            .of(yup.number().min(0).max(6))
            .min(1, 'Debe tener al menos un día libre')
            .max(3, 'No puede tener más de 3 días libres') // Opcional, según tu lógica
            .optional()
    }).optional(),

    img: yup.string().url('La imagen debe ser una URL válida').nullable().optional()
}).noUnknown(true);





export const userUpdateSchema = yup.object({
    admin: yup.boolean().optional(),
    super: yup.boolean().optional(),
    inabilited: yup.boolean().optional(),

    jobInformation: yup.object({
        position: yup.string()
            .oneOf([
                'Gerente', 'Subgerente', 'Coordinador', 'Operador senior', 
                'Operador', 'Analista de sistemas', 'Analista de reportes', 'Analista de RRHH'
            ], 'Puesto no válido')
            .optional()
    }).optional(),

    workSchedule: yup.object({
        startTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').optional(),
        endTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').optional(),
        shiftType: yup.string().oneOf(['Diurno', 'Nocturno'], 'Turno inválido').optional(),
        // NUEVO CAMPO: restDays en Update
        restDays: yup.array()
            .of(yup.number().min(0).max(6).integer('Debe ser un número entero'))
            .optional()
    }).optional()
}).noUnknown(true);