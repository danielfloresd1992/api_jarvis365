import * as yup from 'yup';
import { objectId, time, isRealDay, SHIFTS } from '../rotation/rotation.schema.js';



// ══════════════════════════════════════════════════════════════════════
// LA VALIDACIÓN DE LA VERIFICACIÓN DE UN TURNO
// ══════════════════════════════════════════════════════════════════════
// Lo que entra en cada endpoint de /shift-verification. Se valida con
// { abortEarly: false, stripUnknown: true }: lo que no esté aquí se descarta, y
// quién verifica sale siempre de la sesión, nunca del body.



// PASSES = «las dos verificaciones de un turno»: la primera y la segunda, cada una de una persona
export const PASSES = [1, 2];

// CHECK_STATUSES = «lo que dice una verificación de una rotación o de un toque»: que está en el video
// ('confirmed') o que no está ('notFound')
export const CHECK_STATUSES = ['confirmed', 'notFound'];

// ORIGINS = «quién la anotó»: el operador desde Jarvis Express ('operator') o el verificador, que la sacó del
// video porque el operador no la había anotado ('verification': recuperada)
export const ORIGINS = ['operator', 'verification'];

// HISTORY_ACTIONS = «lo que queda apuntado en el historial de una verificación», con quién y cuándo
//   claim / resume / take / release   alguien la tomó, la reanudó, se la quitó a otro o la soltó
//   mark                              marcó (o desmarcó) una rotación o un toque: de qué a qué
//   recoverRotation / recoverTouch    añadió una rotación o un toque que el operador no anotó
//   close                             cerró la verificación
export const HISTORY_ACTIONS = ['claim', 'resume', 'take', 'release', 'mark', 'recoverRotation', 'recoverTouch', 'close'];

// DELAY_KINDS = «las demoras de una mesa»: de primera atención (de Ocupa a 1ra atención) y de limpieza (de Desocupa
// a Limpieza)
export const DELAY_KINDS = ['attention', 'cleaning'];


// pass = «una de las dos verificaciones», 1 o 2
const pass = () => yup.number()
    .typeError('La verificación es 1 o 2')
    .oneOf(PASSES, 'La verificación es 1 o 2')
    .required('Falta qué verificación es: 1 o 2');

// day = «un día operativo AAAA-MM-DD que exista»
const day = () => yup.string()
    .required('Falta el día operativo (AAAA-MM-DD)')
    .test('day', 'El día debe ser AAAA-MM-DD y existir', isRealDay);

// clock = «una hora HH:MM:SS que no puede faltar»: required ya rechaza el '' que pone time() por defecto
const clock = (message) => time().required(message);



// ── GET /shift-verification?day=AAAA-MM-DD[&establishment=<id>] ──────
// Cómo va la verificación de cada local ese día operativo, turno por turno.

export const summaryQueryValidate = yup.object({
    day: day(),
    establishment: objectId('El establecimiento debe ser un ObjectId válido'),
});


// ── POST /shift-verification: abrir la de un local, un día y un turno ──

export const openValidate = yup.object({
    establishment: objectId('El establecimiento debe ser un ObjectId válido').required('Falta el establecimiento'),
    day: day(),
    shift: yup.string()
        .oneOf(SHIFTS, `El turno solo puede ser ${SHIFTS.map(shift => `«${shift}»`).join(' o ')}`)
        .required('Falta el turno'),
});


// verificationIdValidate = «el _id de una verificación», el de la ruta
export const verificationIdValidate = objectId('El id de la verificación debe ser un ObjectId válido')
    .required('Falta el id de la verificación');

// rotationIdValidate = «el _id de una rotación», el de la ruta del toque recuperado
export const rotationIdValidate = objectId('El id de la rotación debe ser un ObjectId válido')
    .required('Falta el id de la rotación');


// ── PUT /shift-verification/id=<_id>/check: marcar una rotación o uno de sus toques ──
// Sin `touch` se marca la rotación; con él, ese toque de la rotación. `status` null quita la marca.

export const checkValidate = yup.object({
    pass: pass(),
    rotation: objectId('La rotación debe ser un ObjectId válido').required('Falta la rotación'),
    touch: objectId('El toque debe ser un ObjectId válido').nullable().default(null),
    status: yup.string()
        .nullable()
        .oneOf([...CHECK_STATUSES, null], `Lo que dice la verificación solo puede ser ${CHECK_STATUSES.map(status => `«${status}»`).join(' o ')}, o null para quitarlo`)
        .defined('Falta lo que dice la verificación'),
    note: yup.string().trim().max(500, 'La nota va en 500 caracteres como mucho').default(''),
});


// ── POST /shift-verification/id=<_id>/rotation: una rotación que el operador no anotó ──
// Sale del video: se crea como rotación de verdad (recovered: true), en el día y el turno de la verificación.
// Es de una mesa: un pedido para llevar ('#110') no se recupera aquí.

export const recoveredRotationValidate = yup.object({
    pass: pass(),
    tableNumber: yup.string().trim()
        .required('Falta el número de mesa')
        .test('table', 'Una rotación recuperada es de una mesa, no un pedido para llevar', value => !String(value ?? '').startsWith('#')),
    hourOccupies: clock('Falta la hora de Ocupa (HH:MM:SS)'),
    hourFirstAttention: time(),
    breakUp: time(),
    tableCleaning: time(),
});


// ── POST /shift-verification/id=<_id>/rotation=<_id>/touch: un toque que el operador no anotó ──

export const recoveredTouchValidate = yup.object({
    pass: pass(),
    ref: objectId('El gerente del toque debe ser un ObjectId válido').nullable().default(null),
    name: yup.string().trim().required('Falta el gerente del toque'),
    hourTouch: clock('Falta la hora de inicio del toque (HH:MM:SS)'),
    hourTouchFinish: time(),
});


// ── PUT /shift-verification/id=<_id>/close: cerrar una de las dos ──

export const closeValidate = yup.object({
    pass: pass(),
});
