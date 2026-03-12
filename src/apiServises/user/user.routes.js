import express from 'express';
const routerUser = express.Router();
import { join } from 'path';
import UserModel, { UpdateByUserSchema } from './user.model.js';
import { userUpdateSchema } from './user.schema.js'
import addCredentials from '../../middleware/addCredential.js';
import controller from './user.controller.js';

import nameApi from '../../libs/name_api.js';
import { ObjectId } from 'mongodb';  //   validateSessionAndUser.js
import { validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import { userMultimedia } from '../../util/multer.js'

import AttendanceModel from './attendance.model.js';
import { attendanceMachineValidationSchema } from './attendance.squema.js';
import { parseISO, format, getDay, startOfDay, isValid } from 'date-fns';


import { io } from '../../services/socket/io.js'

const ATTENDANCE_TIMEZONE = 'America/Caracas';



const getZonedDateParts = (date, timeZone = ATTENDANCE_TIMEZONE) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {});

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second)
    };
};

const toUtcMidnightFromZonedParts = (parts) => {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0));
};



routerUser.get(`${nameApi}/user/AllById?`, async (req, res) => {
    try {

        const { inabilited } = req.query
        const query = {};

        if (inabilited !== undefined) {
            if (inabilited === 'true') query.inabilited = true;
            if (inabilited === 'false') query.inabilited = false;
        }

        const fullUser = await UserModel.find(query).select('_id');
        return res.status(200).json({ result: fullUser })
    }
    catch (error) {
        console.log(error);
        return res.status(200).json({ error: error, message: 'Error server internal', status: '500' });
    }
});




//  FOR USER MANAGEMENT/*validateSessionAndUserSuper, */
routerUser.get(`${nameApi}/user`, async (req, res) => {
    try {

        // --- Validación: debe venir id O pag ---
        if (!req.query?.id && !req.query?.pag) {
            return res.status(400).json({
                error: 'Bad request',
                status: 400,
                message: 'You must provide either "id" to search a user by ID or "pag" to get paginated results.'
            });
        }


        // VALIDACIÓN DE PARAMETRO DE CONSULTA POR ID
        if (req?.query?.id) {
            const { id } = req.query;
            if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Bad request', status: 400, messaje: 'ID is not valid' })
            const user = await UserModel.findById(id).select('+updateByUser').populate('updateByUser.idRef');

            if (!user) return res.status(404).json({ error: 'Not found', status: 404, mmesage: 'The user does not exist.' })

            return res.json({ status: 200, result: user })
        }

        const pag = req.query?.pag;

        // VALICACIÓN DE PARAMERO DE CONSULTA POR PAGINACIÓN
        if (!pag) return res.status(400).json({ error: 'Bad request', status: 400, message: 'The "pag" query param is required when no ID is provided.' });

        const page = Number(pag);

        // VALIDACIÓN QUE EL PARAMETRO DE PAGINACIÓN SEA ENTERO POSITIVO
        if (isNaN(page) || page < 1) return res.status(400).json({ error: 'Bad request', status: 400, message: '"pag" must be a valid positive number.' });
        if (!Number.isInteger(page)) return res.status(400).json({ error: 'Bad request', status: 400, message: '"pag" must be an integer number (no decimals).' });
        if (page < 1) return res.status(400).json({ error: 'Bad request', status: 400, message: '"pag" must be greater than or equal to 1.' });

        const limit = 10;
        const skip = (page - 1) * limit;

        const users = await UserModel.find({}).select('+updateByUser').populate('updateByUser.idRef').sort({ createdOn: -1 }).skip(skip).limit(limit);

        const totalUser = await UserModel.countDocuments();
        const totalPages = Math.ceil(totalUser / limit);

        return res.json({
            status: 200, page, result: {
                status: 200,
                reuslt: users,
                totalUser: totalUser,
                totalPages: totalPages,
                currentPage: page
            }
        });

    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Error server internal', status: 500, error: error });
    }
});




routerUser.put(`${nameApi}/user/:id`, validateSessionAndUserSuper, async (req, res) => {
    try {
        const { id } = req.params;
        const idUserQuiery = req.session.userId;

        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Bad request', status: 400, message: 'ID is not valid' });

        const body = req.body;
        const dataValidate = await userUpdateSchema.validate(body);
        const dataUserChange = { idRef: idUserQuiery, change: Object.keys(dataValidate) }

        const userUpdate = await UserModel.findByIdAndUpdate(id, { $set: dataValidate, $push: { updateByUser: dataUserChange } }, { new: true, runValidators: true });

        if (!userUpdate) return res.status(404).json({ error: 'Not found', status: 404, mmesage: 'The user does not exist.' })

        return res.json({ userUpdate });
    }
    catch (error) {
        console.log(error);
        if (error.name === 'ValidationError') return res.status(400).json({ error: 'Bad request', status: 400, message: error.errors })
        return res.status(500).json({ error: 'Error server internal', status: 500, error: error });
    }
});

//https://amazona365.ddns.net/api_jarvis/v1/user/multimedia/WhatsAppImage2026-02-08at1.07.11PM.jpeg



routerUser.get(`${nameApi}/user/:dni`, async (req, res) => {
    try {
        const dni = req.params?.dni;
        if (!dni) return res.status(400).json({ error: 'Bad request', status: 400, message: "The user's ID number is required in the dni parameter" });

        const user = await UserModel.findOne({ dni: dni });
        if (!user) return res.status(404).json({ error: 'Not found', status: 404, message: 'User not found, or dni invalidate', });
        return res.status(200).json({ stauts: 200, result: user })
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Error server internal', status: 500, error: error });
    }
});




routerUser.get(`${nameApi}/user/attendance/:dni`, async (req, res) => {
    try {
        const { dni } = req.params;
        const { date } = req.query; // Recibimos la fecha por Query Params


        // 1. Validaciones iniciales
        if (!dni) {
            return res.status(400).json({ status: 400, message: 'El DNI es obligatorio', error: 'Bad request' });
        }
        if (!date) {
            return res.status(400).json({ status: 400, message: 'La fecha es obligatoria para la consulta', error: 'Bad request' });
        }


        // 2. Normalizar la fecha de búsqueda (Igual que en el guardado)
        const searchDate = new Date(date);
        searchDate.setUTCHours(0, 0, 0, 0);
        if (!isValid(searchDate)) {
            return res.status(400).json({ status: 400, message: 'Formato de fecha inválido', error: 'Bad request' });
        }

        // 3. Buscar al usuario por DNI para obtener su _id
        const user = await UserModel.findOne({ dni: dni });
        if (!user) {
            return res.status(404).json({
                status: 404,
                message: "Usuario no encontrado",
                error: "User Not Found"
            });
        }



        // 4. Buscar el registro de asistencia
        const attendance = await AttendanceModel.findOne({
            userId: user._id,
            date: searchDate.toISOString()
        });

        // 5. Respuesta si NO hay registro (Muy importante para el frontend)
        if (!attendance) {
            return res.status(404).json({
                error: 'Document not found',
                status: 404,
                message: "No se encontró registro de asistencia para este día",
                data: null // Enviamos data null para que el frontend sepa que es un día "vío"
            });
        }

        // 6. Respuesta exitosa
        return res.status(200).json({
            status: 200,
            message: "Registro encontrado",
            data: attendance
        });

    }
    catch (error) {
        console.error("Error en getAttendanceByDni:", error);
        return res.status(500).json({
            status: 500,
            message: "Error interno del servidor",
            error: error.message
        });
    }
});





// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: Asignar reglas de horario por día (formulario "Editar grupo")
// ══════════════════════════════════════════════════════════════════════
// Recibe un array de { userId, dni, date, workType, startTime, endTime, isRestDay }
// y crea o actualiza documentos AttendanceModel con scheduleOverride.
// NO toca checkIn ni checkOut — solo escribe la regla especial del día.
routerUser.post(`${nameApi}/user/schedule/dynamic/group`, async (req, res) => {
    try {
        const { updates, adminUserId } = req.body;

        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                status: 400,
                message: 'Se requiere un array "updates" con al menos un elemento.',
                error: 'Bad request'
            });
        }

        // Validar que venga el ID del admin que realiza la acción (para auditoría)
        if (!adminUserId || !ObjectId.isValid(adminUserId)) {
            return res.status(400).json({
                status: 400,
                message: 'Se requiere "adminUserId" válido para registrar quién modifica el horario.',
                error: 'Bad request'
            });
        }

        const results = [];
        const errors = [];

        for (const item of updates) {
            try {
                // Validar campos mínimos
                if (!item.userId && !item.dni) {
                    errors.push({ item, error: 'Se requiere userId o dni.' });
                    continue;
                }
                if (!item.date) {
                    errors.push({ item, error: 'Se requiere fecha (date).' });
                    continue;
                }
                if (!item.workType) {
                    errors.push({ item, error: 'Se requiere tipo de jornada (workType).' });
                    continue;
                }

                // Resolver userId desde dni si es necesario
                let userId = item.userId;
                if (!userId && item.dni) {
                    const userDoc = await UserModel.findOne({ dni: item.dni });
                    if (!userDoc) {
                        errors.push({ item, error: `Usuario con DNI ${item.dni} no encontrado.` });
                        continue;
                    }
                    userId = userDoc._id;
                }

                // Normalizar la fecha a medianoche UTC (mismo formato que el endpoint de marcado)
                const dateObj = new Date(item.date);
                dateObj.setUTCHours(0, 0, 0, 0);

                // Construir el scheduleOverride con la misma estructura que scheduleByDay
                const overrideFields = {
                    'scheduleOverride.workType': item.workType,
                    'scheduleOverride.shift': item.shift || null,
                    'scheduleOverride.startTime': item.workType === 'descanso' ? null : (item.startTime || null),
                    'scheduleOverride.endTime': item.workType === 'descanso' ? null : (item.endTime || null),
                };

                // Upsert: crear documento si no existe, o actualizar scheduleOverride si ya existe.
                // $set para los campos del override, $push para historial de auditoría y notas.
                const pushOperations = {};
                // Si el admin envió una nota, agregarla al array de notas del override
                if (item.note) {
                    pushOperations['scheduleOverride.note'] = {
                        user: adminUserId,
                        message: item.note,
                        date: new Date()
                    };
                }
                console.log(overrideFields)
                const record = await AttendanceModel.findOneAndUpdate(
                    { userId, date: dateObj },
                    {
                        $set: overrideFields,
                        $push: pushOperations
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                ).populate('scheduleOverride.note.user', 'name surName dni');

                console.log('Record after upsert:', record);

                // Emitir evento Socket.IO para que Client365 actualice la celda en tiempo real.
                // Se popula modifiedBy para que el frontend muestre quién creó/editó el override.
                const userDoc = await UserModel.findById(userId);
                if (userDoc) {
                    const dateEvent = new Date(record.date);
                    dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
                    io.emit(`${dateEvent.toISOString()}-${userDoc.email}`, { finalRecord: record, user: userDoc });
                }

                results.push(record);
            }
            catch (innerErr) {
                errors.push({ item, error: innerErr.message });
            }
        }

        return res.status(200).json({
            status: 200,
            message: `Procesados ${results.length} de ${updates.length} registros.`,
            data: { results, errors }
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});





routerUser.post(`${nameApi}/user/attendance/machine/:dni`, async (req, res) => {
    try {
        // ── Extraer el número de cédula (DNI) desde los parámetros de la URL ──
        const dni = req.params?.dni;

        const body = req.body;

        // ── Validar el body contra el schema Yup: requiere campo "imageReference" (string) ──
        // Si el body no cumple, Yup lanza ValidationError que se atrapa en el catch.
        await attendanceMachineValidationSchema.validate(body, { abortEarly: false, stripUnknown: true });

        // ── Buscar el usuario en BD por su número de cédula ──
        const user = await UserModel.findOne({ dni: dni });

        // Si no existe un usuario con ese DNI → 404. No se puede registrar asistencia.
        if (!user) return res.status(404).json({ message: 'User not found' });

        // ── NOTA: La validación de startTime/endTime se hace DESPUÉS de resolver ──
        // scheduleOverride y scheduleByDay, ya que el override puede proveer
        // horarios incluso si el scheduleByDay del usuario está incompleto.

        // ── 1. CAPTURAR EL INSTANTE ACTUAL ──
        const now = new Date();
        const nowInAttendanceTz = getZonedDateParts(now);
        const todayMidnight = toUtcMidnightFromZonedParts(nowInAttendanceTz);

        // ══════════════════════════════════════════════════════════════
        // 2. RESOLVER HORARIO EFECTIVO:
        //    scheduleOverride > scheduleByDay[día] > (sin horario → 400)
        // ══════════════════════════════════════════════════════════════
        const preExistingRecord = await AttendanceModel.findOne({
            userId: user._id,
            date: todayMidnight
        });

        const override = preExistingRecord?.scheduleOverride;
        const hasOverride = override && override.workType;

        // ── Obtener la regla del día desde scheduleByDay (clave = día de la semana 0-6) ──
        const currentDayNumber = todayMidnight.getUTCDay();
        const scheduleByDayMap = user?.workSchedule?.scheduleByDay;
        const dayRule = scheduleByDayMap?.get?.(String(currentDayNumber))
            || scheduleByDayMap?.[String(currentDayNumber)]
            || null;


        // -- determina el tipo de turno efectivo para hoy, considerando override > dayRule > shiftType global --
        const effectiveShiftType = (hasOverride && override.shift)
            || dayRule?.shift
            || user?.workSchedule?.shiftType
            || 'Diurno';
        const isNocturno = effectiveShiftType === 'Nocturno';



        // ── Si el admin marcó este día como DESCANSO via override → no se permite marcar ──
        if (!isNocturno && hasOverride && override.workType === 'descanso') {
            return res.status(400).json({
                status: 400,
                message: 'Este día fue asignado como descanso por el administrador. No se requiere marcar asistencia.',
                error: 'Bad request'
            });
        }

        // ── Si NO hay override y el scheduleByDay marca descanso → no se permite ──
        if (!isNocturno && !hasOverride && dayRule && dayRule.workType === 'descanso') {
            return res.status(400).json({
                status: 400,
                message: 'Este día está configurado como descanso en tu horario. No se requiere marcar asistencia.',
                error: 'Bad request'
            });
        }

        // ── Determinar horarios efectivos: override > dayRule ──
        const effectiveStartTime = (hasOverride && override.startTime) || dayRule?.startTime || null;
        const effectiveEndTime = (hasOverride && override.endTime) || dayRule?.endTime || null;

        if (!effectiveStartTime) {
            return res.status(400).json({
                status: 400,
                message: 'No hay horario de entrada configurado para hoy (ni por defecto ni por regla especial del administrador).',
                error: 'Bad request'
            });
        }
        if (!effectiveEndTime) {
            return res.status(400).json({
                status: 400,
                message: 'No hay horario de salida configurado para hoy (ni por defecto ni por regla especial del administrador).',
                error: 'Bad request'
            });
        }

        // ── 3. EXTRAER Y PARSEAR LAS HORAS DE INICIO/FIN ──
        const [startH, startM] = effectiveStartTime.split(':');
        const [endH, endM] = effectiveEndTime.split(':');

        const startHourNumber = Number(startH);
        const startMinuteNumber = Number(startM);
        const endHourNumber = Number(endH);
        const endMinuteNumber = Number(endM);

        // ── Verificar que las 4 partes numéricas (startH, startM, endH, endM) sean números válidos ──
        // Si algún campo contiene texto o está vacío, Number() devuelve NaN.
        // Esto protege contra datos corruptos en el modelo del usuario.
        const hasInvalidSchedule =
            Number.isNaN(startHourNumber) || Number.isNaN(startMinuteNumber) ||
            Number.isNaN(endHourNumber) || Number.isNaN(endMinuteNumber);

        if (hasInvalidSchedule) {
            return res.status(400).json({
                status: 400,
                message: 'El horario del usuario tiene un formato inválido.',
                error: 'Bad request'
            });
        }

        // ── Convertir horarios a "minutos desde medianoche" para comparaciones simples ──
        // Ej: 18:30 → 1110 min, 06:00 → 360 min. Permite comparar momentos del día con aritmética.
        const startMinutes = (startHourNumber * 60) + startMinuteNumber;
        const endMinutes = (endHourNumber * 60) + endMinuteNumber;
        const nowMinutes = (nowInAttendanceTz.hour * 60) + nowInAttendanceTz.minute;

        // ── 4. DETERMINAR TIPO DE TURNO ──
        // Prioridad: override.shift > dayRule.shift > workSchedule.shiftType (global)
        // Permite que un diurno apoye en nocturno un día específico vía override.


        // ── 5. DETERMINAR SI HOY ES DÍA DE DESCANSO ──
        // Si override define workType 'descanso' ya se rechazó arriba.
        // Si dayRule tiene workType 'descanso' ya se rechazó arriba.
        // Llegando aquí, el día es laboral o extra.
        const isRestDay = false; // Solo llega aquí si el día es laboral/extra
        const isExtraDayResolved = (hasOverride && override.workType === 'extra')
            || (!hasOverride && dayRule?.workType === 'extra');

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // TURNO NOCTURNO: La salida ocurre al día siguiente (madrugada)
        // Ejemplo: entrada 18:00 → salida 06:00 del día siguiente
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (isNocturno) {
            // ── CALCULAR VENTANA DE SALIDA MATUTINA ──
            // checkoutLimitMinutes = hora de fin del turno + 60 minutos de tolerancia.
            // Ej: endTime 06:00 (360 min) + 60 = 420 min (07:00).
            // isInMorningWindow: evalúa si la hora actual está entre 00:00 y las 07:00 (checkout limit).
            // Si es true → el empleado está intentando marcar SALIDA del turno de anoche.
            // Si es false → el empleado está intentando marcar ENTRADA de un nuevo turno nocturno.

            const NOCTURNAL_CHECKOUT_TOLERANCE_MINUTES = 210; // TIMEPO LIMITE DE TOLERANCIA PARA EL PERSONAL NOCTURNO (210 min = 3h30min después de endTime, ej: 06:00 + 3h30 = 09:30)
            const checkoutLimitMinutes = endMinutes + NOCTURNAL_CHECKOUT_TOLERANCE_MINUTES;
            const isInMorningWindow = nowMinutes <= checkoutLimitMinutes;

            if (isInMorningWindow) {
                // ══════════════════════════════════════════════════════════════
                // VENTANA DE SALIDA NOCTURNA (madrugada del día siguiente)
                // ══════════════════════════════════════════════════════════════
                // El empleado marca entre 00:00 y (endTime + 60 min).
                // Debemos buscar el documento de asistencia del DÍA ANTERIOR
                // que tenga checkOut: null (turno abierto de anoche).
                const yesterdayMidnight = new Date(todayMidnight);
                yesterdayMidnight.setUTCDate(yesterdayMidnight.getUTCDate() - 1);

                const openYesterdayRecord = await AttendanceModel.findOne({
                    userId: user._id,
                    date: yesterdayMidnight,
                    checkOut: null  // Solo registros sin salida (turno abierto)
                });

                // ── Si existe un registro abierto del día anterior → CERRAR TURNO ──
                // Se registra checkOut con la hora actual y se añade la imagen capturada.
                if (openYesterdayRecord) {
                    // Cerrar el turno del día anterior
                    const finalRecord = await AttendanceModel.findOneAndUpdate(
                        { _id: openYesterdayRecord._id },
                        {
                            $set: { checkOut: now, updatedAt: now },
                            $push: { imageReference: body.imageReference }
                        },
                        { new: true }
                    );

                    // ── Emitir evento Socket.IO para actualización en tiempo real del dashboard ──
                    // Se ajusta la fecha +4h (UTC→Caracas) para generar el canal correcto.
                    const dateEvent = new Date(finalRecord.date);
                    dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
                    io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord, user });
                    return res.status(200).json({ finalRecord, user, message: '¡Fin de la jornada nocturna!🌙' });
                }

                // ── No se encontró un turno abierto de ayer → CONFLICTO ──
                // El empleado intenta marcar salida pero no tiene entrada registrada
                // del día anterior. Puede que ya haya cerrado o que nunca marcó entrada.
                return res.status(409).json({
                    status: 409,
                    message: 'No existe una entrada del turno nocturno de ayer para cerrar.',
                    data: null
                });
            }

            // ══════════════════════════════════════════════════════════════
            // VENTANA DE ENTRADA NOCTURNA (noche del mismo día)
            // ══════════════════════════════════════════════════════════════
            // Si llegó aquí, la hora actual es POSTERIOR a la ventana de salida matutina,
            // por lo tanto el empleado intenta registrar una NUEVA ENTRADA nocturna.

            // ── Evaluar tolerancia temprana: ¿Es demasiado pronto para marcar? ──
            // earlyToleranceMinutes = 60 → permite marcar hasta 1 hora antes de startTime.
            // Ej: si startTime = 18:00 (1080 min), se permite desde 17:00 (1020 min).
            // Si nowMinutes < (startMinutes - 60) → el empleado llegó muy temprano, se rechaza.
            const earlyToleranceMinutes = 60;
            if (nowMinutes < (startMinutes - earlyToleranceMinutes)) {
                return res.status(400).json({
                    status: 400,
                    message: `El turno nocturno inicia a las ${effectiveStartTime}. Puedes marcar desde 1 hora antes.`,
                    error: 'Bad request'
                });
            }

            // ── Buscar si ya existe un documento de asistencia para HOY ──
            // Puede ser pre-creado por admin (scheduleOverride sin checkIn) o creado por marcado previo.
            const todayRecord = preExistingRecord;

            // ── Si ya existe un registro para hoy → evaluar estado ──
            if (todayRecord) {
                // ── Si tiene checkIn Y checkOut → jornada completamente cerrada ──
                if (todayRecord.checkIn && todayRecord.checkOut) {
                    return res.status(409).json({
                        status: 409,
                        message: 'La jornada nocturna de hoy ya fue cerrada previamente.',
                        data: todayRecord
                    });
                }
                // ── Si tiene checkIn pero NO checkOut → la entrada ya fue marcada ──
                if (todayRecord.checkIn) {
                    return res.status(409).json({
                        status: 409,
                        message: 'Ya se registró la entrada nocturna de hoy. La salida se marcará en la madrugada.',
                        data: todayRecord
                    });
                }
                // ── Si NO tiene checkIn → es un documento pre-creado por admin ──
                // Se actualiza con checkIn (primera marcada del empleado).
            }

            // ══════════════════════════════════════════════════════════════
            // CREAR NUEVA ENTRADA NOCTURNA
            // ══════════════════════════════════════════════════════════════
            // No existe registro de hoy → se puede crear la entrada.

            // ── Calcular si el empleado llegó tarde ──
            // Se compara nowMinutes (hora actual en zona Caracas) contra startMinutes + 5 min de gracia.
            // Usa el horario efectivo (override si existe, si no workSchedule).
            // Si hay override → SIEMPRE verificar retardo (el admin puso horario explícito).
            // Si no hay override → respetar el flag lateArrivalControl del workSchedule.
            const LATE_GRACE_MINUTES = 5;
            const shouldCheckLate = hasOverride ? true : user?.workSchedule?.lateArrivalControl;
            const realIsLate = shouldCheckLate
                ? nowMinutes > (startMinutes + LATE_GRACE_MINUTES)
                : false;

            // ── Crear o actualizar el documento de asistencia en MongoDB ──
            // Si todayRecord existe (pre-creado por admin sin checkIn) → update.
            // Si no existe → create nuevo.
            let finalRecord;
            if (todayRecord && !todayRecord.checkIn) {
                // Documento pre-creado por admin → agregar checkIn y datos de marcado
                finalRecord = await AttendanceModel.findOneAndUpdate(
                    { _id: todayRecord._id },
                    {
                        $set: {
                            checkIn: now,
                            isLate: realIsLate,
                            isExtraDay: isExtraDayResolved,
                            status: (isRestDay || isExtraDayResolved) ? 'franco-trabajado' : 'presente',
                            updatedAt: now
                        },
                        $push: { imageReference: body.imageReference }
                    },
                    { new: true }
                );
            } else {
                // No existe documento → crear nuevo
                finalRecord = await AttendanceModel.create({
                    userId: user._id,
                    date: todayMidnight,
                    checkIn: now,
                    isLate: realIsLate,
                    isExtraDay: isExtraDayResolved,
                    status: (isRestDay || isExtraDayResolved) ? 'franco-trabajado' : 'presente',
                    imageReference: [body.imageReference]
                });
            }

            // ── Emitir evento Socket.IO para actualización en tiempo real del dashboard ──
            const dateEvent = new Date(finalRecord.date);
            dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
            io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord, user });
            return res.json({ finalRecord, user, message: realIsLate ? 'Entrada nocturna con retardo😥' : 'Entrada nocturna registrada🌙' });
        }


        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // TURNO DIURNO: Entrada y salida ocurren el MISMO día calendario
        // Si isNocturno fue false, toda la lógica restante es diurna.
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const recordDate = todayMidnight;

        // ── Calcular si llegó tarde ──
        // Usa horario efectivo (override > workSchedule). 5 min de gracia.
        // Si hay override → SIEMPRE verificar retardo (el admin puso horario explícito).
        const LATE_GRACE_MINUTES = 5;
        const shouldCheckLate = hasOverride ? true : user?.workSchedule?.lateArrivalControl;
        const realIsLate = shouldCheckLate
            ? nowMinutes > (startMinutes + LATE_GRACE_MINUTES)
            : false;

        // ── Buscar si ya existe un documento de asistencia para hoy ──
        // Ya fue consultado arriba como preExistingRecord.
        const documentExist = preExistingRecord;

        // ── Si ya existe registro hoy → evaluar estado ──
        if (documentExist) {
            // ── Si tiene checkIn Y checkOut → jornada completamente cerrada → 409 ──
            if (documentExist.checkIn && documentExist.checkOut) {
                return res.status(409).json({
                    status: 409,
                    message: 'La jornada diurna de hoy ya fue cerrada previamente.',
                    data: documentExist
                });
            }

            // ── Si tiene checkIn pero NO checkOut → segundo marcado (SALIDA) ──
            if (documentExist.checkIn && !documentExist.checkOut) {
                const finalRecord = await AttendanceModel.findOneAndUpdate(
                    { _id: documentExist._id },
                    {
                        $set: { checkOut: now, updatedAt: now },
                        $push: { imageReference: body.imageReference }
                    },
                    { new: true }
                );

                const dateEvent = new Date(finalRecord.date);
                dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
                io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord, user });
                return res.status(200).json({ finalRecord, user, message: '¡Fin de la jornada diaria!🥳🥳🥳' });
            }

            // ── Si NO tiene checkIn → documento pre-creado por admin → primera marcada (ENTRADA) ──
            const finalRecord = await AttendanceModel.findOneAndUpdate(
                { _id: documentExist._id },
                {
                    $set: {
                        checkIn: now,
                        isLate: realIsLate,
                        isExtraDay: isExtraDayResolved,
                        status: (isRestDay || isExtraDayResolved) ? 'franco-trabajado' : 'presente',
                        updatedAt: now
                    },
                    $push: { imageReference: body.imageReference }
                },
                { new: true }
            );

            const dateEvent = new Date(finalRecord.date);
            dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
            io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord, user });
            return res.json({ finalRecord, user, message: realIsLate ? 'Registro exitoso con retardo😥' : 'Registro exitoso🕗' });
        }

        // ══════════════════════════════════════════════════════════════
        // NO EXISTE REGISTRO HOY → CREAR NUEVA ENTRADA DIURNA
        // ══════════════════════════════════════════════════════════════
        const finalRecord = await AttendanceModel.create({
            userId: user._id,
            date: recordDate,
            checkIn: now,
            isLate: realIsLate,
            isExtraDay: isExtraDayResolved,
            status: (isRestDay || isExtraDayResolved) ? 'franco-trabajado' : 'presente',
            imageReference: [body.imageReference]
        });
        // ── Emitir evento Socket.IO para dashboard en tiempo real ──
        const dateEvent = new Date(finalRecord.date);
        dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
        io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord, user });
        return res.json({ finalRecord, user, message: realIsLate ? 'Registro exitoso con retardo😥' : 'Registro exitoso🕗' });

    }
    catch (error) {
        console.log(error);
        // ── Captura errores de Yup (attendanceMachineValidationSchema.validate) ──
        // Si el body no pasó la validación del schema, error.name será 'ValidationError'.
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                status: 400,
                message: 'Datos de asistencia inválidos',
                error: error.errors || error.message
            });
        }
        // ── Captura errores de Mongoose por IDs malformados ──
        if (error.name === 'CastError') return res.status(400).json({ error: error, status: 400, message: 'Bad request' });
        // ── Cualquier otro error inesperado → 500 ──
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});







routerUser.get(`${nameApi}/user/multimedia/:namefile`, async (req, res) => {
    try {
        const namefile = req.params?.namefile;
        return res.sendFile(join(userMultimedia, namefile))
    }
    catch (error) {
        console.log(error);
    }
});





// THIS ENDPOIND IS DEPRECATED 👇

routerUser.post(`/user/login`, controller.login, addCredentials);   //legace
routerUser.get(`/user/protected`, controller.get);
routerUser.post(`/user/signup`, controller.signup);
routerUser.get(`/user/logout`, controller.logout);
routerUser.get(`/user/getUser`, controller.getUser);

routerUser.post(`${nameApi}/user/login`, controller.login, addCredentials);

routerUser.get(`${nameApi}/user/protected`, controller.get);

routerUser.post(`${nameApi}/user/signup`, controller.signup);

routerUser.get(`${nameApi}/user/logout`, controller.logout);

routerUser.get(`${nameApi}/user/getUser`, controller.getUser);



routerUser.get(`${nameApi}/userStore`, (req, res) => {
    return res.status(403)
    /*
    store.all((err, sessions) => {
        if (err) {
            console.error('Error al obtener las sesiones:', err);
            res.status(500).send('Error del servidor');
        } 
        else{
            
            const authenticatedUsers = [];
            for(let i = 0; i < sessions.length;  i++){
            
                if(sessions[i].session.name !== undefined){
                    
                    authenticatedUsers.push(sessions[i]);
                }
            }
      
            return res.json(authenticatedUsers);
        }
    })
        */
});



export { routerUser }; 