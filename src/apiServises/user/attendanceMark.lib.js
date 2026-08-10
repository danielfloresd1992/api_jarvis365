import { io } from '../../services/socket/io.js';
import { notify } from '../notification/notification.service.js';
import { overtimeOfDay, workedMinutesOf } from './overtime.lib.js';

// ══════════════════════════════════════════════════════════════════════
// PUBLICACIÓN DE UN MARCAJE
// ══════════════════════════════════════════════════════════════════════
// Cuando alguien ficha en la máquina hay que avisarle a dos audiencias muy
// distintas:
//
//   1. Las PANTALLAS DE MONITOREO, por el socket con nombre de fecha+correo.
//      Es un evento efímero: refresca la celda de la grilla y se olvida.
//
//   2. La PERSONA QUE MARCÓ, con una notificación persistente y privada:
//      a qué hora entró, si llegó tarde, cuántas unidades le cuesta, con qué
//      foto quedó registrada. Vive en la campana y se puede releer mañana.
//
// Las dos salen de acá, en una sola llamada, a propósito. El endpoint de
// marcaje tiene CINCO caminos de salida (salida nocturna de ayer, entrada
// nocturna, cierre diurno, entrada sobre documento pre-creado, entrada nueva) y
// antes cada uno repetía las tres líneas del emit. Repetir el aviso cinco veces
// significa que el día que se agregue un sexto camino se va a olvidar en uno.
//
// Nada de esto puede tumbar el marcaje: el fichaje YA se guardó. Por eso todo
// va dentro de un try y notify() además nunca lanza por su cuenta.

/**
 * Fotos de entrada y salida dentro del arreglo de imágenes del registro.
 *
 * `imageReference` se va empujando marca a marca, así que la ÚLTIMA siempre es
 * la del fichaje que se acaba de hacer. De ahí se parte, y no de "la primera es
 * la entrada": un documento que el administrador creó con la entrada a mano no
 * tiene foto de entrada, así que la única del arreglo sería la de la SALIDA y
 * quedaría etiquetada al revés.
 *
 * Saber qué marca acaba de ocurrir —`kind`— resuelve el caso sin adivinar.
 */
const fotosDe = (record, kind) => {
    const imgs = (record?.imageReference || []).filter(Boolean);
    const ultima = imgs.length ? imgs[imgs.length - 1] : null;

    if (kind === 'checkOut') {
        return {
            // Con una sola foto no hay entrada que mostrar: esa es la salida.
            photoIn: imgs.length > 1 ? imgs[0] : null,
            photoOut: ultima,
        };
    }

    // Al marcar la entrada la jornada queda abierta: todavía no hay salida.
    return { photoIn: ultima, photoOut: null };
};

/** 545 → "9h 05m". Vacío si la jornada no está cerrada. */
const duracionLegible = (minutos) => {
    if (!Number.isFinite(minutos) || minutos <= 0) return '';
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
};


/**
 * Emite el marcaje a las pantallas y se lo notifica en privado a quien marcó.
 *
 * @param {object}  params
 * @param {object}  params.record    documento de asistencia ya guardado
 * @param {object}  params.user      usuario que marcó
 * @param {'checkIn'|'checkOut'} params.kind  qué acaba de registrar
 * @param {object}  [params.schedule] horario efectivo del día, cuando el
 *                                    endpoint ya lo resolvió:
 *                                    { startTime, endTime, shift, minutesLate }
 */
export async function publishAttendanceMark({ record, user, kind, schedule = {} } = {}) {
    if (!record || !user) return;

    emitAttendanceToScreens(record, user);

    try {
        const shift = schedule.shift || user?.workSchedule?.shiftType || 'Diurno';
        const { photoIn, photoOut } = fotosDe(record, kind);
        const trabajados = record?.checkOut ? workedMinutesOf(record) : 0;

        // El detalle del retardo se lee del DOCUMENTO, no de lo que calculó el
        // endpoint: así la notificación dice exactamente lo mismo que va a
        // mostrar el reporte del mes. `minutesLate` es la única excepción —
        // no se persiste — y por eso viaja como parámetro.
        const meta = {
            kind,
            attendanceId: String(record._id),
            date: record.date,
            checkIn: record.checkIn || null,
            checkOut: record.checkOut || null,
            shift,
            startTime: schedule.startTime || null,
            endTime: schedule.endTime || null,
            isLate: Boolean(record.isLate),
            minutesLate: Number(schedule.minutesLate) || 0,
            discountUnits: Number(record.discountUnits) || 0,
            isExtraDay: Boolean(record.isExtraDay),
            status: record.status || '',
            workedMinutes: trabajados,
            workedLabel: duracionLegible(trabajados),
            photoIn,
            photoOut,
        };

        // Las horas extras solo tienen sentido con la jornada cerrada: se
        // derivan de la diferencia entre entrada y salida.
        if (record?.checkOut) {
            const extras = overtimeOfDay(record, shift);
            meta.overtimeMinutes = extras?.minutes || 0;
            meta.overtimeStatus = extras?.status || 'none';
            meta.overtimeApprovedMinutes = extras?.approvedMinutes ?? null;
        }

        await notify({
            type: kind === 'checkOut' ? 'attendance.checkOut' : 'attendance.checkIn',
            // Firma el propio empleado: es SU marcaje, no una acción de un
            // tercero sobre él. Por eso no se usa `target`, que existe para
            // cuando alguien le cambia algo a otro.
            actor: {
                user: user._id,
                name: user.name || '',
                surName: user.surName || '',
                img: user.img || null,
            },
            resource: {
                kind: 'attendance',
                id: record._id,
                name: `${user.name || ''} ${user.surName || ''}`.trim(),
                // SIN ruta a propósito: la notificación ya trae el comprobante
                // completo —fotos, horas, consecuencias— y no hay a dónde ir.
                // Además la lleva el empleado, que no necesariamente tiene
                // permiso sobre las pantallas de gestión: un enlace ahí lo
                // mandaría a un 403.
                path: '',
                img: user.img || null,
            },
            meta,
            // La audiencia de la estrategia sale de acá: SOLO quien marcó.
            extra: { targetUserId: String(user._id) },
        });
    }
    catch (error) {
        // El marcaje ya quedó registrado; el aviso es accesorio.
        console.log('[asistencia] no se pudo notificar el marcaje:', error?.message || error);
    }
}


/**
 * Evento efímero para las pantallas de monitoreo.
 *
 * El nombre del canal es `${fecha}-${correo}` con la fecha corrida +4h: así lo
 * venía escuchando la grilla desde antes y no se toca.
 */
function emitAttendanceToScreens(record, user) {
    try {
        const dateEvent = new Date(record.date);
        dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
        io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord: record, user });
    }
    catch (error) {
        console.log('[asistencia] no se pudo emitir el marcaje:', error?.message || error);
    }
}
