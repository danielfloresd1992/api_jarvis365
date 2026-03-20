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







// THIS ENDPOIND IS DEPRECATED 👇

routerUser.post(`/user/login`, controller.login, addCredentials);   //legace
routerUser.get(`/user/protected`, controller.get);
routerUser.post(`/user/signup`, controller.signup);
routerUser.get(`/user/logout`, controller.logout);
routerUser.get(`/user/getUser`, controller.getUser);







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




/**
 * ENDPOINT: GET /api_jarvis/v1/user/attendance/global-report
 *
 * Genera un reporte consolidado de todos los empleados ACTIVOS (inabilited:false)
 * para un rango de fechas, calculando por empleado:
 *   - lateWeekday  : retardos entre semana (Lun–Vie)
 *   - lateWeekend  : retardos en fin de semana (Sáb–Dom)
 *   - extraDays    : días extras trabajados
 *   - totalPresent : días con checkIn registrado
 *   - faltaCount   : total de ausencias (scheduleOverride.workType='falta' OR status='ausente')
 *
 * ── INGENIERÍA ANTI-COLAPSO ──────────────────────────────────────────────────
 * En vez de hacer N consultas (una por empleado), se usan DOS estrategias:
 *
 * 1. MongoDB Aggregation Pipeline desde la colección "users":
 *    - Itera todos los usuarios activos UNA sola vez.
 *    - Hace un $lookup con sub-pipeline filtrado por rango de fechas, de modo
 *      que MongoDB reutiliza el índice compuesto { userId:1, date:1 } que ya
 *      existe en AttendanceSchema para resolver cada sub-query en O(log n).
 *    - Toda la aritmética (sumas condicionales) se ejecuta DENTRO del motor
 *      de MongoDB, sin traer documentos al proceso Node.js.
 *
 * 2. $project al final elimina campos pesados (password, workSchedule, etc.)
 *    para que solo viajen por la red los datos estrictamente necesarios.
 *
 * Resultado: una sola round-trip a la DB en lugar de N round-trips.
 *
 * Query params:
 *   @param {string} from  - Fecha inicio (YYYY-MM-DD)
 *   @param {string} to    - Fecha fin    (YYYY-MM-DD)
 */
routerUser.get(`${nameApi}/user/attendance/global-report`, async (req, res) => {
    try {
        const { from, to } = req.query;

        // ── Validaciones de parámetros ──────────────────────────────────────
        if (!from || !to)
            return res.status(400).json({
                status: 400, error: 'Bad request',
                message: '"from" and "to" query params are required.'
            });

        const fromDate = new Date(from);
        const toDate = new Date(to);
        fromDate.setUTCHours(0, 0, 0, 0);
        toDate.setUTCHours(0, 0, 0, 0);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()))
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'Invalid date format.' });
        if (fromDate > toDate)
            return res.status(400).json({ status: 400, error: 'Bad request', message: '"from" must be before or equal to "to".' });

        // ── Aggregation Pipeline ────────────────────────────────────────────
        //
        // Partimos de la colección "users" para incluir a TODOS los empleados
        // activos, incluso aquellos sin ninguna asistencia en el período
        // (aparecerán con ceros). Si partiéramos de "attendances" los usuarios
        // sin registros no aparecerían.
        //
        const pipeline = [

            // PASO 1: Solo empleados ACTIVOS y dentro del horario estándar.
            // Condiciones de exclusión:
            //  - inabilited: true          → empleado dado de baja
            //  - outForkSchedule: true     → empleado fuera de la estructura de horario
            //                                (sin horario asignado / régimen especial)
            // $ne: true captura tanto false como undefined (campo inexistente).
            { $match: { inabilited: false, 'workSchedule.outForkSchedule': { $ne: true } } },

            // PASO 2: Sub-consulta de asistencias del período por usuario.
            // Se usa $lookup con sub-pipeline para poder filtrar la colección
            // "attendances" por rango de fechas ANTES de traer los docs a
            // memoria, aprovechando el índice { userId:1, date:1 }.
            {
                $lookup: {
                    from: 'attendances',           // colección destino
                    let: { uid: '$_id' },          // variable local = _id del user
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$userId', '$$uid'] },    // mismo usuario
                                        { $gte: ['$date', fromDate] },    // dentro del rango
                                        { $lte: ['$date', toDate] }
                                    ]
                                }
                            }
                        },
                        // Proyectar solo los campos necesarios para calcular
                        // los totales; reducimos el payload dentro del $lookup.
                        // - scheduleOverride.workType → detecta faltas pre-registradas ('falta')
                        // - status                    → detecta ausencias orgánicas ('ausente')
                        { $project: { date: 1, isLate: 1, isExtraDay: 1, checkIn: 1, status: 1, 'scheduleOverride.workType': 1, _id: 0 } }
                    ],
                    as: 'attendanceRecords'
                }
            },

            // PASO 3: Calcular los totales usando $filter sobre el array
            // "attendanceRecords" que trajo el $lookup.
            //
            // Nota sobre $dayOfWeek en MongoDB:
            //   1 = Domingo, 2 = Lunes, 3 = Martes, 4 = Miércoles,
            //   5 = Jueves,  6 = Viernes, 7 = Sábado
            // → Entre semana: [2,3,4,5,6]   Fin de semana: [1,7]
            {
                $addFields: {
                    // Retardos entre semana (Lun=2 … Vie=6)
                    lateWeekday: {
                        $size: {
                            $filter: {
                                input: '$attendanceRecords',
                                as: 'r',
                                cond: {
                                    $and: [
                                        { $eq: ['$$r.isLate', true] },
                                        { $in: [{ $dayOfWeek: '$$r.date' }, [2, 3, 4, 5, 6]] }
                                    ]
                                }
                            }
                        }
                    },
                    // Retardos fin de semana (Dom=1, Sáb=7)
                    lateWeekend: {
                        $size: {
                            $filter: {
                                input: '$attendanceRecords',
                                as: 'r',
                                cond: {
                                    $and: [
                                        { $eq: ['$$r.isLate', true] },
                                        { $in: [{ $dayOfWeek: '$$r.date' }, [1, 7]] }
                                    ]
                                }
                            }
                        }
                    },
                    // Días extras trabajados
                    extraDays: {
                        $size: {
                            $filter: {
                                input: '$attendanceRecords',
                                as: 'r',
                                cond: { $eq: ['$$r.isExtraDay', true] }
                            }
                        }
                    },
                    // Total días con entrada registrada
                    totalPresent: {
                        $size: {
                            $filter: {
                                input: '$attendanceRecords',
                                as: 'r',
                                cond: { $ne: ['$$r.checkIn', null] }
                            }
                        }
                    },
                    // Faltas TOTALES por empleado: se suman dos fuentes sin
                    // doble-conteo porque operan sobre el MISMO registro:
                    //  a) scheduleOverride.workType === 'falta'  → el admin pre-registró la falta
                    //  b) status === 'ausente'                   → el empleado no se presentó
                    // Un registro que cumpla ambas condiciones solo se cuenta UNA vez
                    // gracias a que $filter opera sobre documentos únicos por fecha.
                    faltaCount: {
                        $size: {
                            $filter: {
                                input: '$attendanceRecords',
                                as: 'r',
                                cond: {
                                    $or: [
                                        // Falta pre-registrada por el administrador
                                        { $eq: ['$$r.scheduleOverride.workType', 'falta'] },
                                        // Ausencia orgánica: el empleado no asistió
                                        { $eq: ['$$r.status', 'ausente'] }
                                    ]
                                }
                            }
                        }
                    }
                }
            },

            // PASO 4: Eliminar el array de asistencias (ya no se necesita)
            // y campos sensibles/pesados antes de serializar la respuesta.
            // Se conserva "inabilited" para que el frontend indique baja del empleado.
            {
                $project: {
                    attendanceRecords: 0,  // array pesado, ya procesado
                    password: 0,           // nunca exponer
                    user: 0,               // campo de credencial
                    updateByUser: 0,       // historial interno, innecesario aquí
                    workSchedule: 0,       // pesado, innecesario para este reporte
                    createdOn: 0,
                    date: 0,
                    // "inabilited" se MANTIENE intencionalmente para indicar baja
                }
            },

            // PASO 5: Ordenar por departamento, luego apellido, luego nombre
            // para que el reporte se lea agrupado naturalmente.
            { $sort: { 'jobInformation.department': 1, surName: 1, name: 1 } }
        ];

        // Ejecutar la aggregation
        const result = await UserModel.aggregate(pipeline);

        // ── Totales consolidados ────────────────────────────────────────────
        // Se calculan en Node.js sobre el array ya reducido (pocos campos,
        // pocos documentos comparado con el full Attendance collection).
        // Totales globales calculados en Node.js sobre el array ya reducido.
        // Se añade totalFalta y se desglosa activos vs. inactivos.
        const totals = {
            totalEmployees:   result.length,
            activeEmployees:  result.filter(r => !r.inabilited).length,
            inactiveEmployees: result.filter(r => r.inabilited).length,
            totalLateWeekday: result.reduce((a, r) => a + r.lateWeekday, 0),
            totalLateWeekend: result.reduce((a, r) => a + r.lateWeekend, 0),
            totalExtraDays:   result.reduce((a, r) => a + r.extraDays, 0),
            totalPresent:     result.reduce((a, r) => a + r.totalPresent, 0),
            totalFalta:       result.reduce((a, r) => a + r.faltaCount, 0),
        };

        return res.status(200).json({
            status: 200,
            period: { from: fromDate, to: toDate },
            totals,
            employees: result
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});



routerUser.get(`${nameApi}/user/attendance/report`, async (req, res) => {
    try {
        const { userId, from, to } = req.query;

        if (!userId || !ObjectId.isValid(userId))
            return res.status(400).json({ status: 400, error: 'Bad request', message: '"userId" is required and must be a valid ObjectId.' });
        if (!from || !to)
            return res.status(400).json({ status: 400, error: 'Bad request', message: '"from" and "to" query params are required.' });

        const fromDate = new Date(from);
        const toDate = new Date(to);
        fromDate.setUTCHours(0, 0, 0, 0);
        toDate.setUTCHours(0, 0, 0, 0);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()))
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'Invalid date format for "from" or "to".' });
        if (fromDate > toDate)
            return res.status(400).json({ status: 400, error: 'Bad request', message: '"from" must be before or equal to "to".' });

        const user = await UserModel.findById(userId);
        if (!user) return res.status(404).json({ status: 404, error: 'Not found', message: 'User not found.' });

        const records = await AttendanceModel.find({
            userId: userId,
            date: { $gte: fromDate, $lte: toDate }
        }).sort({ date: 1 });

        const recordMap = new Map();
        records.forEach(r => recordMap.set(r.date.toISOString(), r));

        const scheduleByDay = user.workSchedule?.scheduleByDay;

        let totalWorkingDays = 0, presentDays = 0, absentDays = 0;
        let lateDays = 0, justifiedLateDays = 0, lateMinutes = 0, extraMinutes = 0;
        let expectedMinutes = 0;

        const cur = new Date(fromDate);
        const todayMid = new Date();
        todayMid.setUTCHours(0, 0, 0, 0);

        while (cur <= toDate) {
            const dayKey = cur.toISOString();
            const dayOfWeek = cur.getUTCDay();
            const record = recordMap.get(dayKey);

            const override = record?.scheduleOverride;
            const dayRule = scheduleByDay?.get?.(String(dayOfWeek)) || scheduleByDay?.[String(dayOfWeek)] || null;
            const effectiveWorkType = override?.workType || dayRule?.workType || 'laboral';

            if (effectiveWorkType !== 'descanso') {
                totalWorkingDays++;

                const startTime = override?.startTime || dayRule?.startTime;
                const endTime = override?.endTime || dayRule?.endTime;
                if (startTime && endTime) {
                    const [sh, sm] = startTime.split(':').map(Number);
                    const [eh, em] = endTime.split(':').map(Number);
                    const scheduledMin = (eh * 60 + em) - (sh * 60 + sm);
                    if (scheduledMin > 0) expectedMinutes += scheduledMin;
                }

                if (record?.checkIn) {
                    presentDays++;
                    if (record.isLate) {
                        lateDays++;
                        if (record.isJustified) justifiedLateDays++;
                        if (startTime) {
                            const parts = getZonedDateParts(record.checkIn);
                            const checkInMin = parts.hour * 60 + parts.minute;
                            const [sh, sm] = startTime.split(':').map(Number);
                            lateMinutes += Math.max(0, checkInMin - (sh * 60 + sm));
                        }
                    }
                    if (record.checkOut && startTime && endTime) {
                        const workedMin = Math.floor((record.checkOut - record.checkIn) / 60000);
                        const [sh, sm] = startTime.split(':').map(Number);
                        const [eh, em] = endTime.split(':').map(Number);
                        const scheduledMin = (eh * 60 + em) - (sh * 60 + sm);
                        if (scheduledMin > 0 && workedMin > scheduledMin) extraMinutes += workedMin - scheduledMin;
                    }
                } else if (cur <= todayMid) {
                    absentDays++;
                }
            }
            cur.setUTCDate(cur.getUTCDate() + 1);
        }

        const scheduleByDayObj = {};
        if (scheduleByDay) {
            const entries = scheduleByDay instanceof Map ? scheduleByDay : Object.entries(scheduleByDay || {});
            for (const [k, v] of (scheduleByDay instanceof Map ? scheduleByDay : new Map(Object.entries(scheduleByDay || {})))) {
                scheduleByDayObj[k] = v;
            }
        }

        return res.status(200).json({
            status: 200,
            user: {
                _id: user._id,
                name: user.name,
                surName: user.surName,
                dni: user.dni,
                email: user.email,
                jobInformation: user.jobInformation,
                workSchedule: {
                    shiftType: user.workSchedule?.shiftType,
                    scheduleByDay: scheduleByDayObj
                },
                img: user.img
            },
            records,
            summary: {
                totalWorkingDays,
                presentDays,
                absentDays,
                lateDays,
                justifiedLateDays,
                lateMinutes,
                extraMinutes,
                expectedMinutes,
                attendanceRate: totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 1000) / 10 : 0
            },
            period: { from: fromDate, to: toDate }
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
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
        const dni = req.params?.dni;
        const body = req.body;

        await attendanceMachineValidationSchema.validate(body, { abortEarly: false, stripUnknown: true });

        const user = await UserModel.findOne({ dni });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const now = new Date();
        const nowInAttendanceTz = getZonedDateParts(now);
        const todayMidnight = toUtcMidnightFromZonedParts(nowInAttendanceTz);
        const nowMinutes = (nowInAttendanceTz.hour * 60) + nowInAttendanceTz.minute;

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PASO 1 — PRIORIDAD ABSOLUTA: salida de turno nocturno abierto de ayer
        // Se evalúa ANTES que cualquier validación del día de hoy,
        // porque hoy puede ser descanso/libre y el empleado igual debe
        // poder cerrar su jornada de anoche.
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const yesterdayMidnight = new Date(todayMidnight);
        yesterdayMidnight.setUTCDate(yesterdayMidnight.getUTCDate() - 1);

        const openYesterdayRecord = await AttendanceModel.findOne({
            userId: user._id,
            date: yesterdayMidnight,
            checkOut: null
        });

        if (openYesterdayRecord) {
            // Resolver el horario efectivo de AYER (no de hoy)
            const yesterdayOverride = openYesterdayRecord?.scheduleOverride;
            const hasYesterdayOverride = yesterdayOverride?.workType;

            const yesterdayDayNumber = yesterdayMidnight.getUTCDay();
            const scheduleByDayMap = user?.workSchedule?.scheduleByDay;
            const yesterdayDayRule = scheduleByDayMap?.get?.(String(yesterdayDayNumber))
                || scheduleByDayMap?.[String(yesterdayDayNumber)]
                || null;

            const yesterdayShiftType = (hasYesterdayOverride && yesterdayOverride.shift)
                || yesterdayDayRule?.shift
                || user?.workSchedule?.shiftType
                || 'Diurno';

            // Solo aplicar lógica nocturna si el registro abierto es de un turno nocturno
            if (yesterdayShiftType === 'Nocturno') {
                const yesterdayEndTime = (hasYesterdayOverride && yesterdayOverride.endTime)
                    || yesterdayDayRule?.endTime
                    || null;

                if (!yesterdayEndTime) {
                    return res.status(400).json({
                        status: 400,
                        message: 'El turno nocturno de ayer no tiene hora de salida configurada.',
                        error: 'Bad request'
                    });
                }

                const [endH, endM] = yesterdayEndTime.split(':');
                const endMinutes = (Number(endH) * 60) + Number(endM);

                const NOCTURNAL_CHECKOUT_TOLERANCE_MINUTES = 210;
                const checkoutLimitMinutes = endMinutes + NOCTURNAL_CHECKOUT_TOLERANCE_MINUTES;

                if (nowMinutes <= checkoutLimitMinutes) {
                    // ✅ Estamos dentro de la ventana de salida → cerrar turno
                    const finalRecord = await AttendanceModel.findOneAndUpdate(
                        { _id: openYesterdayRecord._id },
                        {
                            $set: { checkOut: now, updatedAt: now },
                            $push: { imageReference: body.imageReference }
                        },
                        { new: true }
                    );

                    const dateEvent = new Date(finalRecord.date);
                    dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
                    io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord, user });

                    return res.status(200).json({
                        finalRecord,
                        user,
                        message: '¡Fin de la jornada nocturna!🌙'
                    });
                }

                // Fuera de la ventana de tolerancia → el turno de ayer quedó sin cerrar
                // pero ya no se puede cerrar. Continúa con la lógica del día de hoy.
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PASO 2 — Resolver horario efectivo de HOY
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const preExistingRecord = await AttendanceModel.findOne({
            userId: user._id,
            date: todayMidnight
        });

        const override = preExistingRecord?.scheduleOverride;
        const hasOverride = override?.workType;

        const currentDayNumber = todayMidnight.getUTCDay();
        const scheduleByDayMap = user?.workSchedule?.scheduleByDay;
        const dayRule = scheduleByDayMap?.get?.(String(currentDayNumber))
            || scheduleByDayMap?.[String(currentDayNumber)]
            || null;

        const effectiveShiftType = (hasOverride && override.shift)
            || dayRule?.shift
            || user?.workSchedule?.shiftType
            || 'Diurno';
        const isNocturno = effectiveShiftType === 'Nocturno';

        // ── Validaciones de descanso (ahora seguras porque ya resolvimos la salida nocturna) ──
        if (hasOverride && override.workType === 'descanso') {
            return res.status(400).json({
                status: 400,
                message: 'Este día fue asignado como descanso por el administrador. No se requiere marcar asistencia.',
                error: 'Bad request'
            });
        }

        if (!hasOverride && dayRule?.workType === 'descanso') {
            return res.status(400).json({
                status: 400,
                message: 'Este día está configurado como descanso en tu horario. No se requiere marcar asistencia.',
                error: 'Bad request'
            });
        }

        // ── Horarios efectivos de hoy ──
        const effectiveStartTime = (hasOverride && override.startTime) || dayRule?.startTime || null;
        const effectiveEndTime = (hasOverride && override.endTime) || dayRule?.endTime || null;

        if (!effectiveStartTime) {
            return res.status(400).json({
                status: 400,
                message: 'No hay horario de entrada configurado para hoy.',
                error: 'Bad request'
            });
        }
        if (!effectiveEndTime) {
            return res.status(400).json({
                status: 400,
                message: 'No hay horario de salida configurado para hoy.',
                error: 'Bad request'
            });
        }

        const [startH, startM] = effectiveStartTime.split(':');
        const [endH, endM] = effectiveEndTime.split(':');
        const startHourNumber = Number(startH);
        const startMinuteNumber = Number(startM);
        const endHourNumber = Number(endH);
        const endMinuteNumber = Number(endM);

        if (
            Number.isNaN(startHourNumber) || Number.isNaN(startMinuteNumber) ||
            Number.isNaN(endHourNumber) || Number.isNaN(endMinuteNumber)
        ) {
            return res.status(400).json({
                status: 400,
                message: 'El horario del usuario tiene un formato inválido.',
                error: 'Bad request'
            });
        }

        const startMinutes = (startHourNumber * 60) + startMinuteNumber;
        const isExtraDayResolved = (hasOverride && override.workType === 'extra')
            || (!hasOverride && dayRule?.workType === 'extra');

        const LATE_GRACE_MINUTES = 5;
        const shouldCheckLate = hasOverride ? true : user?.workSchedule?.lateArrivalControl;
        const realIsLate = shouldCheckLate
            ? nowMinutes > (startMinutes + LATE_GRACE_MINUTES)
            : false;

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PASO 3 — ENTRADA de turno nocturno de hoy
        // (la salida ya fue manejada en el PASO 1)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (isNocturno) {
            const earlyToleranceMinutes = 120;
            if (nowMinutes < (startMinutes - earlyToleranceMinutes)) {
                return res.status(400).json({
                    status: 400,
                    message: `El turno nocturno inicia a las ${effectiveStartTime}. Puedes marcar desde 1 hora antes.`,
                    error: 'Bad request'
                });
            }

            const todayRecord = preExistingRecord;

            if (todayRecord) {
                if (todayRecord.checkIn && todayRecord.checkOut) {
                    return res.status(409).json({
                        status: 409,
                        message: 'La jornada nocturna de hoy ya fue cerrada previamente.',
                        data: todayRecord
                    });
                }
                if (todayRecord.checkIn) {
                    return res.status(409).json({
                        status: 409,
                        message: 'Ya se registró la entrada nocturna de hoy. La salida se marcará en la madrugada.',
                        data: todayRecord
                    });
                }
            }

            let finalRecord;
            if (todayRecord && !todayRecord.checkIn) {
                finalRecord = await AttendanceModel.findOneAndUpdate(
                    { _id: todayRecord._id },
                    {
                        $set: {
                            checkIn: now,
                            isLate: realIsLate,
                            isExtraDay: isExtraDayResolved,
                            status: isExtraDayResolved ? 'franco-trabajado' : 'presente',
                            updatedAt: now
                        },
                        $push: { imageReference: body.imageReference }
                    },
                    { new: true }
                );
            } else {
                finalRecord = await AttendanceModel.create({
                    userId: user._id,
                    date: todayMidnight,
                    checkIn: now,
                    isLate: realIsLate,
                    isExtraDay: isExtraDayResolved,
                    status: isExtraDayResolved ? 'franco-trabajado' : 'presente',
                    imageReference: [body.imageReference]
                });
            }

            const dateEvent = new Date(finalRecord.date);
            dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
            io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord, user });

            return res.json({
                finalRecord,
                user,
                message: realIsLate ? 'Entrada nocturna con retardo😥' : 'Entrada nocturna registrada🌙'
            });
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PASO 4 — Turno DIURNO
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const documentExist = preExistingRecord;

        if (documentExist) {
            if (documentExist.checkIn && documentExist.checkOut) {
                return res.status(409).json({
                    status: 409,
                    message: 'La jornada diurna de hoy ya fue cerrada previamente.',
                    data: documentExist
                });
            }

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

            // Documento pre-creado por admin sin checkIn
            const finalRecord = await AttendanceModel.findOneAndUpdate(
                { _id: documentExist._id },
                {
                    $set: {
                        checkIn: now,
                        isLate: realIsLate,
                        isExtraDay: isExtraDayResolved,
                        status: isExtraDayResolved ? 'franco-trabajado' : 'presente',
                        updatedAt: now
                    },
                    $push: { imageReference: body.imageReference }
                },
                { new: true }
            );

            const dateEvent = new Date(finalRecord.date);
            dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
            io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord, user });
            return res.json({
                finalRecord,
                user,
                message: realIsLate ? 'Registro exitoso con retardo😥' : 'Registro exitoso🕗'
            });
        }

        // No existe registro hoy → nueva entrada diurna
        const finalRecord = await AttendanceModel.create({
            userId: user._id,
            date: todayMidnight,
            checkIn: now,
            isLate: realIsLate,
            isExtraDay: isExtraDayResolved,
            status: isExtraDayResolved ? 'franco-trabajado' : 'presente',
            imageReference: [body.imageReference]
        });

        const dateEvent = new Date(finalRecord.date);
        dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
        io.emit(`${dateEvent.toISOString()}-${user.email}`, { finalRecord, user });
        return res.json({
            finalRecord,
            user,
            message: realIsLate ? 'Registro exitoso con retardo😥' : 'Registro exitoso🕗'
        });

    } catch (error) {
        console.log(error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                status: 400,
                message: 'Datos de asistencia inválidos',
                error: error.errors || error.message
            });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({ error, status: 400, message: 'Bad request' });
        }
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