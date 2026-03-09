import * as yup from 'yup';
import { startOfDay } from 'date-fns';



const startOfDayLocal = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return startOfDay(date);
};




const attendanceValidationSchema = yup.object().shape({
    userId: yup
        .string()
        .required('El ID del usuario es obligatorio'),

    date: yup
        .date()
        .transform((value) => (value ? startOfDayLocal(value) : value))
        .required('La fecha del registro es obligatoria'),


    checkIn: yup
        .date()
        .nullable()
        .notRequired(),

    checkOut: yup
        .date()
        .nullable()
        // Cambiamos .moreThan() por .min()
        .min(
            yup.ref('checkIn'),
            'La hora de salida debe ser posterior a la de entrada'
        )
        .notRequired(),

    isLate: yup
        .boolean()
        .default(false),

    lateJustification: yup
        .string()
        .max(500, 'La justificación es muy larga')
        // Ajuste de sintaxis para versiones recientes de Yup
        .when('isJustified', {
            is: true,
            then: (schema) => schema.required('Debes indicar el motivo del perdón'),
            otherwise: (schema) => schema.notRequired(),
        }),

    isJustified: yup
        .boolean()
        .default(false),

    isExtraDay: yup
        .boolean()
        .default(false),

    adminNotes: yup
        .string()
        .max(255, 'La nota es demasiado larga'),

    status: yup
        .string()
        .oneOf(['laboral', 'extra', 'descanso', 'permiso', 'vacaciones', 'falta'], 'Estado no válido')
        .default('pendiente'),
});

const attendanceMachineValidationSchema = yup.object().shape({
    imageReference: yup
        .string()
        .trim()
        .required('La referencia de imagen es obligatoria')
        .min(3, 'La referencia de imagen es inválida')
});


export default attendanceValidationSchema;
export { attendanceMachineValidationSchema };