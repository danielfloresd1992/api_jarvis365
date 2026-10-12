import * as yup from 'yup';
import { Types } from 'mongoose';



// ══════════════════════════════════════════════════════════════════════
// LA VALIDACIÓN DEL CICLO DE LA ROTACIÓN
// ══════════════════════════════════════════════════════════════════════
// Dos esquemas: el cuerpo que guarda una rotación (POST) y la consulta por
// fechas (GET). Se validan con { abortEarly: false, stripUnknown: true }, así
// que lo que no esté acá —un `createdBy` mandado en el body, por ejemplo— se
// descarta: el autor sale de la sesión.



// TIME = «una hora HH:MM:SS»
const TIME = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

// DAY = «un día AAAA-MM-DD»
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// MAX_RANGE_DAYS = «cuántos días se pueden pedir de una vez». Un rango sin tope
// podría pedir años de rotaciones en una sola respuesta.
export const MAX_RANGE_DAYS = 62;



// objectId = «un ObjectId de Mongo». Sin el `addMethod` de local.schema.js, que
// cambia yup para todos y depende de que ese archivo se cargue primero.
const objectId = (message = 'Debe ser un ObjectId válido') =>
    yup.string().test('objectId', message, value => value == null || Types.ObjectId.isValid(value));

// time = «una hora de la rotación»: 'HH:MM:SS', o '' si todavía no pasó
const time = () => yup.string()
    .matches(TIME, { message: 'Las horas van con formato HH:MM:SS', excludeEmptyString: true })
    .default('');



// dayToDate = «un día AAAA-MM-DD como la fecha que guarda operationalDate»: la
// medianoche UTC de ese día, que es la forma que devuelve operationalDateOf.
export const dayToDate = (day) => new Date(`${day}T00:00:00.000Z`);

// isRealDay = «el día existe»: '2026-02-30' tiene el formato pero no existe, y
// Date lo convertiría en silencio en el 2 de marzo.
const isRealDay = (day) => day == null || (DAY.test(day) && !Number.isNaN(dayToDate(day).getTime()) && dayToDate(day).toISOString().startsWith(day));



// ── POST: el cuerpo de una rotación ───────────────────────────────────

const processValidate = yup.object({
    ticketNumber:        yup.string().default(''),
    dishType:            yup.string().default(''),
    orderTaking:         time(),
    markedReadyOnTablet: time(),
    readyInTheKitchen:   time(),
    dishDelivery:        time(),
});

const touchValidate = yup.object({
    ref:       objectId('El gerente del toque debe ser un ObjectId válido').nullable().default(null),
    name:      yup.string().default(''),
    hourTouch: time(),
    createdAt: yup.date().nullable().default(null),
});

export const rotationValidate = yup.object({
    establishment: objectId('El establecimiento debe ser un ObjectId válido').required('Falta el establecimiento'),
    clientId:      yup.string().trim().required('Falta el id de la rotación'),
    date:          yup.date().required('Falta la fecha de la rotación'),
    tableNumber:   yup.string().trim().required('Falta el número de mesa'),

    hourOccupies:       time(),
    hourFirstAttention: time(),
    breakUp:            time(),
    tableCleaning:      time(),

    process: yup.array().of(processValidate).default([]),
    touch:   yup.array().of(touchValidate).default([]),
});



// ── GET: la consulta por fechas ───────────────────────────────────────
//
//     GET /rotation?establishment=<id>&from=AAAA-MM-DD&to=AAAA-MM-DD
//     GET /rotation?name=<nombre del local>&from=AAAA-MM-DD&to=AAAA-MM-DD
//
// El establecimiento, por su id o por su nombre (único en Local); con los dos,
// manda el id. `from` y `to` son DÍAS OPERATIVOS, los dos incluidos. Sin `to` se
// pide solo el día `from`. Como mucho MAX_RANGE_DAYS días.

export const rotationQueryValidate = yup.object({
    establishment: objectId('El establecimiento debe ser un ObjectId válido'),
    name: yup.string().trim(),
    from: yup.string().required('Falta la fecha «from» (AAAA-MM-DD)').test('day', '«from» debe ser un día AAAA-MM-DD que exista', isRealDay),
    to:   yup.string().test('day', '«to» debe ser un día AAAA-MM-DD que exista', isRealDay),
})
.test('establishment', 'Falta el establecimiento: su id («establishment») o su nombre («name»)', (query) => Boolean(query?.establishment || query?.name))
.test('range', `El rango va de «from» a «to», con «to» igual o posterior, y como mucho ${MAX_RANGE_DAYS} días`, (query) => {
    if (!query?.from || !query?.to || !isRealDay(query.from) || !isRealDay(query.to)) return true;   // ya lo dicen los campos
    const days = (dayToDate(query.to) - dayToDate(query.from)) / 86400000 + 1;
    return days >= 1 && days <= MAX_RANGE_DAYS;
});
