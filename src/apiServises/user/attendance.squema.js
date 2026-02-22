import * as yup from 'yup';
import { startOfDay } from 'date-fns';



// Devuelve el inicio del día preservando la misma fecha en UTC




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
    .oneOf(['presente', 'ausente', 'pendiente', 'franco-trabajado'], 'Estado no válido')
    .default('pendiente'),
});


export default attendanceValidationSchema;