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


export const userSchemaComplete = yup.object({
    password: yup
        .string()
        .min(6, 'La contraseña debe tener al menos 6 caracteres')
        .optional(),
    
    admin: yup.boolean().optional(),
    super: yup.boolean().optional(),
    inabilited: yup.boolean().optional(),

    // Adaptación para la jerarquía de trabajo
    jobInformation: yup.object({
        department: yup
            .string()
            .oneOf(
                ['Operaciones', 'Sistemas y desarrollo', 'Reportes', 'Recursos Humanos'],
                'Departamento no válido'
            )
            .optional(),
        position: yup
            .string()
            .oneOf(
                [
                    'Gerente', 'Subgerente', 'Coordinador', 'Operador senior', 
                    'Operador', 'Analista de sistemas', 'Analista de reportes', 'Analista de RRHH'
                ],
                'Puesto no válido'
            )
            .optional()
    }).optional(),

    // Adaptación para horarios y turnos
    workSchedule: yup.object({
        shiftType: yup
            .string()
            .oneOf(['Diurno', 'Nocturno'], 'El turno debe ser Diurno o Nocturno')
            .optional(),
        startTime: yup
            .string()
            .matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato de hora inválido (HH:mm)')
            .optional(),
        endTime: yup
            .string()
            .matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato de hora inválido (HH:mm)')
            .optional()
    }).optional(),

    img: yup.string().url('La imagen debe ser una URL válida').nullable().optional()

}).noUnknown(true);





export const userUpdateSchema = yup.object({
    // Permisos y Estado (Raíz del modelo)
    admin: yup.boolean().optional(),
    super: yup.boolean().optional(),
    inabilited: yup.boolean().optional(),

    // Cargo (Debe estar dentro de jobInformation para Mongoose)
    jobInformation: yup.object({
        position: yup
            .string()
            .oneOf([
                'Gerente', 'Subgerente', 'Coordinador', 
                'Operador senior', 'Operador', 'Analista de sistemas', 
                'Analista de reportes', 'Analista de RRHH'
            ], 'Puesto no válido')
            .optional()
    }).optional(),

    // Horario (Debe estar dentro de workSchedule para Mongoose)
    workSchedule: yup.object({
        startTime: yup
            .string()
            .matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm (24h)')
            .optional(),
        endTime: yup
            .string()
            .matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm (24h)')
            .optional(),
        shiftType: yup
            .string()
            .oneOf(['Diurno', 'Nocturno'], 'Turno inválido')
            .optional()
    }).optional()

}).noUnknown(true);