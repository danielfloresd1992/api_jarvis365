import * as yup from 'yup';

// Sub‑schema para auditoría de cambios
const updateByUserSchema = yup.object({
    idRef: yup
        .string()
        .required('El idRef es obligatorio')
        .matches(/^[0-9a-fA-F]{24}$/, 'idRef debe ser un ObjectId válido'),

    change: yup.array()
        .of(yup.string().required('Cada cambio debe ser un string válido'))
        .required('El campo change es obligatorio')
        .min(1, 'Debe haber al menos un cambio')
});


// Esquema Completo (Registro / Creación)
export const userSchemaComplete = yup.object({
    dni: yup.string().nullable().default(null),

    user: yup.string().required().trim(),
    name:  yup.string().required().trim(),
    surName: yup.string().required().trim(),
    phone: yup.string().required().trim(),

    password: yup.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional(),
    admin: yup.boolean().default(false),
    super: yup.boolean().default(false),
    inabilited: yup.boolean().default(false),

    jobInformation: yup.object({
        department: yup.string()
            .oneOf(['Operaciones', 'Sistemas y desarrollo', 'Reportes', 'Recursos Humanos'], 'Departamento no válido')
            .nullable(),
        position: yup.string()
            .oneOf([
                'Gerente', 'Subgerente', 'Coordinador', 'Operador senior', 'Operador experto',
                'Operador', 'Analista de sistemas', 'Analista de reportes', 'Analista de RRHH'
            ], 'Puesto no válido')
            .nullable()
    }).nullable().default(null),

    workSchedule: yup.object({
        shiftType: yup.string().oneOf(['Diurno', 'Nocturno'], 'Turno inválido').default('Diurno'),
        startTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').required('Entrada requerida'),
        endTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').required('Salida requerida'),
        restDays: yup.array()
            .of(yup.number().integer().min(0).max(6))
            .min(1, 'Mínimo 1 día de descanso')
            .max(3, 'Máximo 3 días de descanso')
            .default([0, 6]) // Sábado y Domingo por defecto
    }).nullable().default(null),

    img: yup.string().url('URL de imagen inválida').nullable().optional()
}).noUnknown(true);




// Esquema de Actualización (Edición de Perfil)
export const userUpdateSchema = yup.object({
    dni: yup.string().nullable().default(null),
    admin: yup.boolean().optional(),
    super: yup.boolean().optional(),
    name:  yup.string().optional().trim(),
    surName: yup.string().optional().trim(),
    inabilited: yup.boolean().optional(),

    jobInformation: yup.object({
        department: yup.string()
            .oneOf(['Operaciones', 'Sistemas y desarrollo', 'Reportes', 'Recursos Humanos'], 'Departamento no válido')
            .optional(),
        position: yup.string()
            .oneOf([
                'Gerente', 'Subgerente', 'Coordinador', 'Operador senior','Operador experto',
                'Operador', 'Analista de sistemas', 'Analista de reportes', 'Analista de RRHH'
            ], 'Puesto no válido')
            .optional(),
        detail: yup.string().nullable().default(null),
    }).nullable().optional(),

    workSchedule: yup.object({
        startTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').optional(),
        endTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').optional(),
        shiftType: yup.string().oneOf(['Diurno', 'Nocturno'], 'Turno inválido').optional(),
        restDays: yup.object()
            .optional(),
        lateArrivalControl: yup.boolean().default(true),
        lateArrivalTracking: yup.boolean().default(true),
        outForkSchedule: yup.boolean().default(false),
        
    }).nullable().optional(),

    img: yup.string().nullable().default(null)

}).noUnknown(true)