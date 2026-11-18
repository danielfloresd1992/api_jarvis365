import * as yup from 'yup';
import { objectId, isRealDay } from '../rotation/rotation.schema.js';
import { PASSES } from '../shiftVerification/shiftVerification.schema.js';



// ══════════════════════════════════════════════════════════════════════
// LA VALIDACIÓN DE QUIÉN TIENE UNA VERIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Lo que entra en /verification-session. Se valida con { abortEarly: false,
// stripUnknown: true }: quién la toma sale siempre de la sesión, nunca del body.



// SESSION_STATUSES = «en qué quedó una sesión de verificación»
//   active     alguien la tiene ahora (puede estar inactiva: cerró el navegador y va a volver)
//   closed     se cerró la verificación: terminó
//   released   quien la tenía la soltó
//   taken      otra persona la tomó, porque llevaba un rato sin actividad (o un administrador)
//   expired    se dio por abandonada
export const SESSION_STATUSES = ['active', 'closed', 'released', 'taken', 'expired'];


// acquireValidate = «tomar (o reanudar) una verificación»: POST /verification-session
export const acquireValidate = yup.object({
    verification: objectId('La verificación debe ser un ObjectId válido').required('Falta la verificación'),
    pass: yup.number()
        .typeError('La verificación es 1 o 2')
        .oneOf(PASSES, 'La verificación es 1 o 2')
        .required('Falta qué verificación es: 1 o 2'),
});

// sessionIdValidate = «el _id de una sesión», el de la ruta
export const sessionIdValidate = objectId('El id de la sesión debe ser un ObjectId válido').required('Falta el id de la sesión');

// sessionQueryValidate = «las sesiones activas de un día»: GET /verification-session?day=
export const sessionQueryValidate = yup.object({
    day: yup.string()
        .required('Falta el día operativo (AAAA-MM-DD)')
        .test('day', 'El día debe ser AAAA-MM-DD y existir', isRealDay),
});
