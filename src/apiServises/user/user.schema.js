import * as yup from 'yup';

const DEPARTMENT_ENUM = ['Operaciones', 'Sistemas y desarrollo', 'Reportes', 'Recursos Humanos', 'Audioria'];
const POSITION_ENUM = [
    'Gerente', 'Subgerente', 'Coordinador', 'Operador senior', 'Operador experto',
    'Operador', 'Analista de sistemas', 'Analista de reportes', 'Analista de auditoria', 'Analista de RRHH'
];

// Sub-schema de validación para un día individual de scheduleByDay
const dayScheduleSchema = yup.object({
    workType: yup.string().oneOf(['laboral', 'extra', 'descanso', 'permiso', 'vacaciones', 'falta'], 'workType inválido').default('laboral'),
    shift: yup.string().oneOf(['Diurno', 'Nocturno'], 'Turno inválido').default('Diurno'),
    startTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').nullable().default(null),
    endTime: yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm').nullable().default(null),
    note: yup.array().optional().default([])
});

const scheduleByDaySchema = yup.lazy((value) => {
    if (value == null) return yup.mixed().nullable();
    const shape = {};
    for (const key of Object.keys(value)) {
        shape[key] = dayScheduleSchema;
    }
    return yup.object(shape);
});


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
    name: yup.string().required().trim(),
    surName: yup.string().required().trim(),
    phone: yup.string().required().trim(),

    password: yup.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional(),
    admin: yup.boolean().default(false),
    super: yup.boolean().default(false),
    inabilited: yup.boolean().default(false),

    jobInformation: yup.object({
        department: yup.string()
            .oneOf(DEPARTMENT_ENUM, 'Departamento no válido')
            .nullable(),
        position: yup.string()
            .oneOf(POSITION_ENUM, 'Puesto no válido')
            .nullable()
    }).nullable().default(null),

    workSchedule: yup.object({
        shiftType: yup.string().oneOf(['Diurno', 'Nocturno'], 'Turno inválido').default('Diurno'),
        scheduleByDay: scheduleByDaySchema.optional()
    }).nullable().default(null),

    img: yup.string().url('URL de imagen inválida').nullable().optional()
}).noUnknown(true);




// Esquema de Actualización (Edición de Perfil)
export const userUpdateSchema = yup.object({
    dni: yup.string().nullable().default(null),
    admin: yup.boolean().optional(),
    super: yup.boolean().optional(),
    name: yup.string().optional().trim(),
    surName: yup.string().optional().trim(),
    inabilited: yup.boolean().optional(),

    jobInformation: yup.object({
        department: yup.string()
            .oneOf(DEPARTMENT_ENUM, 'Departamento no válido')
            .optional(),
        position: yup.string()
            .oneOf(POSITION_ENUM, 'Puesto no válido')
            .optional(),
        detail: yup.string().nullable().default(null),
    }).nullable().optional(),

    workSchedule: yup.object({
        shiftType: yup.string().oneOf(['Diurno', 'Nocturno'], 'Turno inválido').optional(),
        scheduleByDay: scheduleByDaySchema.optional(),
        lateArrivalControl: yup.boolean().default(true),
        lateArrivalTracking: yup.boolean().default(true),
        outForkSchedule: yup.boolean().default(false),
    }).nullable().optional(),

    img: yup.string().nullable().default(null)

}).noUnknown(true)