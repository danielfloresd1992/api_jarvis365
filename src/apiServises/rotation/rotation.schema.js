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

// SHIFTS = «los turnos de una rotación»: de día ('day') o de noche ('night'). Vive
// aquí y no en rotation.lib.js porque lo usan este esquema y el modelo, y la lib
// ya importa de este archivo: al revés sería un import circular.
export const SHIFTS = ['day', 'night'];



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
    //  La demora de preparación reportada: el ObjectId de su novedad. Jarvis-express365 lo apunta en el proceso al
    //  enviarla desde Mesas, y llega con el disquete. Sin mandarla, null. También se corrige con el PUT del proceso.
    preparationDelay:    objectId('La demora de preparación debe ser el ObjectId de una novedad').nullable().default(null),
    //  «Marcada antes de estar listo» reportada (se sacó de la pantalla de la tablet antes de estar listo en cocina):
    //  el ObjectId de su novedad, igual que la demora de preparación. Sin mandarla, null.
    earlyMarkDelay:      objectId('«Marcada antes de estar listo» debe ser el ObjectId de una novedad').nullable().default(null),
});

export const touchValidate = yup.object({
    ref:       objectId('El gerente del toque debe ser un ObjectId válido').nullable().default(null),
    name:      yup.string().default(''),
    hourTouch: time(),
    hourTouchFinish: time(),   //  cuándo terminó el toque; la pone Jarvis-express365 al apuntarlo. Sin mandarla, ''.
    createdAt: yup.date().nullable().default(null),
    recovered: yup.boolean().typeError('«recovered» del toque es true o false').default(false),
});

export const rotationValidate = yup.object({
    establishment: objectId('El establecimiento debe ser un ObjectId válido').required('Falta el establecimiento'),
    clientId:      yup.string().trim().required('Falta el id de la rotación'),
    date:          yup.date().required('Falta la fecha de la rotación'),
    tableNumber:   yup.string().trim().required('Falta el número de mesa'),

    // El turno: solo 'day' o 'night'. Sin mandarlo queda en null, «todavía no se dijo».
    shift: yup.string().nullable().oneOf([...SHIFTS, null], `El turno solo puede ser ${SHIFTS.map(shift => `«${shift}»`).join(' o ')}`).default(null),

    // Recuperada: anotada a mano después, desde Registros (la de cada toque, en touchValidate). Sin mandarla, false.
    recovered: yup.boolean().typeError('«recovered» de la rotación es true o false').default(false),

    hourOccupies:       time(),
    hourFirstAttention: time(),
    breakUp:            time(),
    tableCleaning:      time(),

    // Las demoras reportadas: el ObjectId de la novedad que se envió por su primera atención y por su limpieza
    // (el modelo las referencia a 'Noveltie'). Jarvis-express365 lo apunta en la fila al enviar la alerta desde el
    // reloj rojo, y llega aquí con el disquete. Sin mandarlas, null. También se corrigen con el PUT.
    firstAttentionDelay: objectId('La demora de primera atención debe ser el ObjectId de una novedad').nullable().default(null),
    cleaningDelay:       objectId('La demora de limpieza debe ser el ObjectId de una novedad').nullable().default(null),

    // Los avisos enviados mientras la mesa seguía esperando (sin primera atención, o sin limpiar): el ObjectId de su
    // novedad, como las demoras. Jarvis-express365 lo apunta al enviar el aviso desde el triángulo amarillo. Sin
    // mandarlos, null. También se corrigen con el PUT.
    firstAttentionWarning: objectId('El aviso de primera atención debe ser el ObjectId de una novedad').nullable().default(null),
    cleaningWarning:       objectId('El aviso de limpieza debe ser el ObjectId de una novedad').nullable().default(null),

    process: yup.array().of(processValidate).default([]),
    touch:   yup.array().of(touchValidate).default([]),
});



// ── PUT: corregir lo guardado ─────────────────────────────────────────
//
//     PUT /rotation/id=<_id>      body: { propiedad: valorNuevo, … }
//
// El _id es el de lo que se corrige: la rotación, uno de sus procesos o uno de
// sus toques. Se corrige lo mismo con que se guardó, menos lo que lo identifica
// —el local, el clientId y la fecha de la rotación; el gerente y el momento del
// clic de un toque— y las listas, que se corrigen elemento por elemento. Por eso
// se arma QUITANDO campos (`omit`) y no listándolos: un campo nuevo en los
// esquemas de arriba queda corregible sin tocar esto.
//
// Se valida SOLO lo que viene en el body (ver applyEdit en rotation.lib.js): con
// el esquema entero, los valores por defecto pisarían lo que no se mandó.

export const rotationTargetValidate = objectId('El id de lo que se corrige debe ser un ObjectId válido')
    .required('Falta el id de lo que se corrige');

export const editableValidate = {
    rotation: rotationValidate.omit(['establishment', 'clientId', 'date', 'process', 'touch']),
    process:  processValidate,
    touch:    touchValidate.omit(['ref', 'createdAt']),
};



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
