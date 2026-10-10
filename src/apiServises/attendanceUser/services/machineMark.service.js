import AttendanceModel from '../attendanceUser.model.js';
import { emitCloseSessionForUser } from '../../../services/socket/sessionEvents.js';
import { LATE_GRACE_MINUTES, computeDiscountUnits } from './lateness.lib.js';
import { getZonedDateParts, toUtcMidnightFromZonedParts, addUtcDays, minutesOfDay, hhmmToMinutes } from './attendanceTime.lib.js';
import { dayRuleOf, activeOverrideOf, resolveShift } from './workday.lib.js';
import { overtimeOnCheckout } from './overtime.lib.js';
import { esAltaDeHoy } from './newEmployee.lib.js';
import { publishAttendanceMark } from './attendanceMark.service.js';

// Marcaje desde la máquina (bioJarvis). Una sola llamada decide si es ENTRADA o
// SALIDA, en este orden:
//   1. salida del turno nocturno de ayer, si sigue abierto
//   2. horario efectivo de hoy (descanso, horas configuradas)
//   3. turno nocturno: entrada de hoy
//   4. turno diurno: entrada o salida

// El nocturno puede marcar su salida hasta las 10:00 de la mañana.
const NIGHT_CHECKOUT_LIMIT_MINUTES = 10 * 60;

// Cuánto antes de su hora puede marcar la entrada el nocturno.
// OJO: son 120 minutos, aunque el mensaje al empleado dice "1 hora antes".
const NIGHT_EARLY_TOLERANCE_MINUTES = 120;


// Arma la respuesta HTTP que devuelve el servicio al controlador.
const reply = (status, body) => ({ status, body });

// Respuesta 400 con el formato de este endpoint.
const badRequest = (message) => reply(400, { status: 400, message, error: 'Bad request' });


// Registra el marcaje del empleado y devuelve { status, body } para responder.
export async function registerMachineMark(user, imageReference, now = new Date()) {
    const nowParts = getZonedDateParts(now);
    const today = toUtcMidnightFromZonedParts(nowParts);
    const nowMinutes = minutesOfDay(nowParts);

    // 1. Va primero: hoy puede ser descanso y aun así tiene que cerrar lo de anoche.
    const nightCheckout = await closeYesterdayNightShift({ user, today, now, nowMinutes, imageReference });
    if (nightCheckout) return nightCheckout;

    // 2. Horario efectivo de hoy.
    const todayRecord = await AttendanceModel.findOne({ userId: user._id, date: today });
    const schedule = resolveTodaySchedule(user, todayRecord, today);
    if (schedule.error) return schedule.error;

    const arrival = evaluateArrival(user, schedule, nowMinutes, now);
    const mark = { user, todayRecord, today, now, nowMinutes, imageReference, schedule, arrival };

    // 3 y 4.
    return schedule.shift === 'Nocturno' ? markNightShift(mark) : markDayShift(mark);
}


// Cierra el turno nocturno de ayer si sigue abierto y aún está en la ventana de salida.
// Devuelve la respuesta, o null si no hay nada que cerrar y hay que seguir con hoy.
async function closeYesterdayNightShift({ user, today, now, nowMinutes, imageReference }) {
    const yesterday = addUtcDays(today, -1);

    const openRecord = await AttendanceModel.findOne({
        userId: user._id,
        date: yesterday,
        checkOut: null
    });
    if (!openRecord) return null;

    // Horario efectivo de AYER, no de hoy.
    const override = activeOverrideOf(openRecord);
    const dayRule = dayRuleOf(user?.workSchedule?.scheduleByDay, yesterday.getUTCDay());
    if (resolveShift(override, dayRule, user?.workSchedule) !== 'Nocturno') return null;

    const endTime = override?.endTime || dayRule?.endTime || null;
    if (!endTime) return badRequest('El turno nocturno de ayer no tiene hora de salida configurada.');

    // Pasada la ventana, lo de ayer queda sin cerrar y se sigue con hoy.
    if (nowMinutes > NIGHT_CHECKOUT_LIMIT_MINUTES) return null;

    const finalRecord = await closeWorkday(openRecord._id, user, now, imageReference);

    await publishAttendanceMark({
        record: finalRecord,
        user,
        kind: 'checkOut',
        schedule: { shift: 'Nocturno', endTime, startTime: dayRule?.startTime || null },
    });

    // Fin de jornada: los frontends cierran la sesión del usuario.
    emitCloseSessionForUser(user._id);

    return reply(200, { finalRecord, user, message: '¡Fin de la jornada nocturna!🌙' });
}


// Resuelve el horario de hoy y rechaza los días sin marcaje (descanso, sin horas o
// con horas mal escritas). Devuelve { error } o el horario listo para usar.
function resolveTodaySchedule(user, todayRecord, today) {
    const override = activeOverrideOf(todayRecord);
    const dayRule = dayRuleOf(user?.workSchedule?.scheduleByDay, today.getUTCDay());
    const shift = resolveShift(override, dayRule, user?.workSchedule);

    if (override?.workType === 'descanso') {
        return { error: badRequest('Este día fue asignado como descanso por el administrador. No se requiere marcar asistencia.') };
    }
    if (!override && dayRule?.workType === 'descanso') {
        return { error: badRequest('Este día está configurado como descanso en tu horario. No se requiere marcar asistencia.') };
    }

    const startTime = override?.startTime || dayRule?.startTime || null;
    const endTime = override?.endTime || dayRule?.endTime || null;

    if (!startTime) return { error: badRequest('No hay horario de entrada configurado para hoy.') };
    if (!endTime) return { error: badRequest('No hay horario de salida configurado para hoy.') };

    const startMinutes = hhmmToMinutes(startTime);
    if (startMinutes === null || hhmmToMinutes(endTime) === null) {
        return { error: badRequest('El horario del usuario tiene un formato inválido.') };
    }

    const workType = override ? override.workType : dayRule?.workType;

    return { override, shift, startTime, endTime, startMinutes, isExtraDay: workType === 'extra' };
}


// Calcula si la entrada llega tarde y cuántas unidades se descuentan.
// El primer día de un empleado nuevo nunca cuenta como retardo.
function evaluateArrival(user, schedule, nowMinutes, now) {
    const checksLate = esAltaDeHoy(user, now)
        ? false
        : (schedule.override ? true : user?.workSchedule?.lateArrivalControl);

    const isLate = checksLate ? nowMinutes > (schedule.startMinutes + LATE_GRACE_MINUTES) : false;

    // Se calcula aunque no sea retardo: sirve para el aviso al empleado.
    const minutesLate = Math.max(0, nowMinutes - schedule.startMinutes);
    const discountUnits = isLate ? computeDiscountUnits(minutesLate) : 0;

    return {
        isLate,
        discountUnits,
        // Detalle que bioJarvis le muestra al empleado al marcar.
        lateInfo: isLate
            ? { minutesLate, discountUnits, graceMinutes: LATE_GRACE_MINUTES, startTime: schedule.startTime }
            : null,
        // Horario que viaja en la notificación del marcaje.
        markSchedule: {
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            shift: schedule.shift,
            minutesLate: isLate ? minutesLate : 0,
        },
    };
}


// Turno nocturno: solo registra la entrada (la salida se cierra al día siguiente, paso 1).
async function markNightShift({ user, todayRecord, today, now, nowMinutes, imageReference, schedule, arrival }) {
    if (nowMinutes < (schedule.startMinutes - NIGHT_EARLY_TOLERANCE_MINUTES)) {
        return badRequest(`El turno nocturno inicia a las ${schedule.startTime}. Puedes marcar desde 1 hora antes.`);
    }
    if (todayRecord?.checkIn && todayRecord.checkOut) {
        return reply(409, { status: 409, message: 'La jornada nocturna de hoy ya fue cerrada previamente.', data: todayRecord });
    }
    if (todayRecord?.checkIn) {
        return reply(409, { status: 409, message: 'Ya se registró la entrada nocturna de hoy. La salida se marcará en la madrugada.', data: todayRecord });
    }

    const finalRecord = await openWorkday({ existing: todayRecord, user, today, now, imageReference, schedule, arrival });
    await publishAttendanceMark({ record: finalRecord, user, kind: 'checkIn', schedule: arrival.markSchedule });

    return reply(200, {
        finalRecord,
        user,
        lateInfo: arrival.lateInfo,
        message: arrival.isLate ? 'Entrada nocturna con retardo😥' : 'Entrada nocturna registrada🌙'
    });
}


// Turno diurno: si ya entró, marca la salida; si no, la entrada.
async function markDayShift({ user, todayRecord, today, now, imageReference, schedule, arrival }) {
    if (todayRecord?.checkIn && todayRecord.checkOut) {
        return reply(409, { status: 409, message: 'La jornada diurna de hoy ya fue cerrada previamente.', data: todayRecord });
    }

    if (todayRecord?.checkIn) {
        const finalRecord = await closeWorkday(todayRecord._id, user, now, imageReference);
        await publishAttendanceMark({ record: finalRecord, user, kind: 'checkOut', schedule: arrival.markSchedule });

        // Fin de jornada: los frontends cierran la sesión del usuario.
        emitCloseSessionForUser(user._id);

        return reply(200, { finalRecord, user, message: '¡Fin de la jornada diaria!🥳🥳🥳' });
    }

    const finalRecord = await openWorkday({ existing: todayRecord, user, today, now, imageReference, schedule, arrival });
    await publishAttendanceMark({ record: finalRecord, user, kind: 'checkIn', schedule: arrival.markSchedule });

    return reply(200, {
        finalRecord,
        user,
        lateInfo: arrival.lateInfo,
        message: arrival.isLate ? 'Registro exitoso con retardo😥' : 'Registro exitoso🕗'
    });
}


// Guarda la salida: hora, foto y el estado inicial de la hora extra.
function closeWorkday(recordId, user, now, imageReference) {
    return AttendanceModel.findOneAndUpdate(
        { _id: recordId },
        {
            $set: { checkOut: now, updatedAt: now, ...overtimeOnCheckout(user) },
            $push: { imageReference }
        },
        { new: true }
    );
}


// Guarda la entrada. Si el administrador ya había creado el documento del día se
// completa; si no, se crea con el propio empleado como autor.
async function openWorkday({ existing, user, today, now, imageReference, schedule, arrival }) {
    const entry = {
        checkIn: now,
        isLate: arrival.isLate,
        discountUnits: arrival.discountUnits,
        isExtraDay: schedule.isExtraDay,
        status: schedule.isExtraDay ? 'franco-trabajado' : 'presente',
    };

    if (existing) {
        return AttendanceModel.findOneAndUpdate(
            { _id: existing._id },
            { $set: { ...entry, updatedAt: now }, $push: { imageReference } },
            { new: true }
        );
    }

    const created = await AttendanceModel.create({
        userId: user._id,
        date: today,
        ...entry,
        imageReference: [imageReference],
        createdBy: user._id
    });
    await created.populate('createdBy', 'name surName img');
    return created;
}
