import express from 'express';
const routerUser = express.Router();
import { join, basename } from 'path';
import sharp from 'sharp';
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
import { buildDailyAttendanceReport } from './attendanceReport.service.js';
import { buildAttendanceReportPdf } from './attendanceReport.pdf.js';
import { runDailyAttendanceReport } from './attendanceReport.job.js';
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

        // Persistir SOLO las claves que el cliente envió realmente.
        // yup inyecta defaults (dni:null, img:null, workSchedule con solo los
        // flags, jobInformation:{detail:null}) para claves ausentes; hacer $set
        // con esos defaults borraría datos reales en actualizaciones parciales.
        const partialUpdate = {};
        for (const key of Object.keys(dataValidate)) {
            if (Object.prototype.hasOwnProperty.call(body, key)) partialUpdate[key] = dataValidate[key];
        }

        const changedKeys = Object.keys(partialUpdate);
        if (changedKeys.length === 0) {
            return res.status(400).json({ error: 'Bad request', status: 400, message: 'No valid fields to update.' });
        }

        // El historial registra únicamente los campos realmente modificados
        const dataUserChange = { idRef: idUserQuiery, change: changedKeys }

        const userUpdate = await UserModel.findByIdAndUpdate(id, { $set: partialUpdate, $push: { updateByUser: dataUserChange } }, { new: true, runValidators: true })
            .select('+updateByUser')
            .populate('updateByUser.idRef', 'name surName');

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
            totalEmployees: result.length,
            activeEmployees: result.filter(r => !r.inabilited).length,
            inactiveEmployees: result.filter(r => r.inabilited).length,
            totalLateWeekday: result.reduce((a, r) => a + r.lateWeekday, 0),
            totalLateWeekend: result.reduce((a, r) => a + r.lateWeekend, 0),
            totalExtraDays: result.reduce((a, r) => a + r.extraDays, 0),
            totalPresent: result.reduce((a, r) => a + r.totalPresent, 0),
            totalFalta: result.reduce((a, r) => a + r.faltaCount, 0),
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
        }).sort({ date: 1 })
            // Nombres de quién modificó cada día (scheduleOverride.note.user)
            .populate('scheduleOverride.note.user', 'name surName');

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



// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: Corte diario de asistencia (retardos y ausencias)
// ══════════════════════════════════════════════════════════════════════
// IMPORTANTE: debe declararse ANTES de /user/attendance/:dni para que
// "daily-report" no sea capturado como un DNI.
//
// GET  .../user/attendance/daily-report            → datos del corte en JSON
// GET  .../user/attendance/daily-report?format=pdf → descarga el PDF (previsualización)
// POST .../user/attendance/daily-report/send       → genera el PDF y lo envía por WhatsApp
//        body opcional: { "cutLabel": "...", "number": "584..." }
routerUser.get(`${nameApi}/user/attendance/daily-report`, async (req, res) => {
    try {
        const shiftFocus = req.query?.shiftFocus || null;
        const report = await buildDailyAttendanceReport(new Date(), shiftFocus);

        if (req.query?.format === 'pdf') {
            const cutLabel = req.query?.cutLabel || 'Previsualización de corte';
            const pdfBuffer = await buildAttendanceReportPdf(report, cutLabel);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="Reporte_Asistencia.pdf"');
            return res.status(200).send(pdfBuffer);
        }

        return res.status(200).json({ status: 200, result: report });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});



routerUser.post(`${nameApi}/user/attendance/daily-report/send`, async (req, res) => {
    try {
        const { cutLabel, number, shiftFocus } = req.body || {};
        const result = await runDailyAttendanceReport({ cutLabel, number, shiftFocus });

        return res.status(200).json({
            status: 200,
            message: 'Reporte generado y enviado por WhatsApp.',
            result
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'No se pudo generar/enviar el reporte.', error: error.message });
    }
});



// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: ¿El empleado registró su asistencia hoy? (gate de login)
// ══════════════════════════════════════════════════════════════════════
// GET .../user/attendance/authenticated/:dni
// Pensado para que jarvis-express lo consulte ANTES del login: si responde
// authenticated=false, el frontend debe bloquear el acceso e indicar que
// primero se debe registrar la jornada en el control de asistencia.
//
// Respuesta: { status, authenticated: boolean, dni, reason, ... }
//   authenticated=true  → marcó su entrada hoy, o no está sujeto a control de
//                         asistencia (sin jobInformation/workSchedule configurados).
//   authenticated=false → está bajo control de asistencia y hoy es día libre
//                         o aún no ha registrado su llegada laboral.
//
// IMPORTANTE: debe declararse ANTES de /user/attendance/:dni para que
// "authenticated" no sea capturado como un DNI.
routerUser.get(`${nameApi}/user/attendance/authenticated/:dni`, async (req, res) => {
    try {
        const dni = req.params?.dni;
        if (!dni) {
            return res.status(400).json({ status: 400, authenticated: false, message: 'El DNI es obligatorio', error: 'Bad request' });
        }

        const user = await UserModel.findOne({ dni });
        if (!user) {
            return res.status(404).json({ status: 404, authenticated: false, message: 'Usuario no encontrado' });
        }

        // Fecha civil de hoy en Venezuela (mismo criterio que el marcaje)
        const nowParts = getZonedDateParts(new Date());
        const todayMidnight = toUtcMidnightFromZonedParts(nowParts);
        const dayNumber = todayMidnight.getUTCDay();

        const record = await AttendanceModel.findOne({ userId: user._id, date: todayMidnight });

        // 1) Marcó su entrada hoy → autenticado (cubre también franco-trabajado)
        if (record?.checkIn) {
            return res.status(200).json({
                status: 200,
                authenticated: true,
                dni,
                reason: 'Registró su entrada hoy',
                checkIn: record.checkIn
            });
        }

        // 2) ¿Está sujeto a control de asistencia? Requiere jobInformation y
        //    workSchedule (con al menos un día de horario) configurados.
        const scheduleMap = user.workSchedule?.scheduleByDay;
        const scheduleSize = scheduleMap
            ? (typeof scheduleMap.size === 'number' ? scheduleMap.size : Object.keys(scheduleMap).length)
            : 0;
        const underAttendanceControl =
            Boolean(user.jobInformation && user.jobInformation.department) && scheduleSize > 0;

        if (!underAttendanceControl) {
            return res.status(200).json({
                status: 200,
                authenticated: true,
                dni,
                reason: 'No sujeto a control de asistencia (sin jobInformation/workSchedule configurados)'
            });
        }

        // 3) Resolver la regla efectiva de hoy: override del día → scheduleByDay
        const override = record?.scheduleOverride;
        const hasOverride = Boolean(override?.workType);
        const dayRule = scheduleMap?.get?.(String(dayNumber)) || scheduleMap?.[String(dayNumber)] || null;
        const workType = (hasOverride && override.workType) || dayRule?.workType || 'laboral';

        // 3a) Día sin asistencia requerida → libre
        const NOT_REQUIRED = ['descanso', 'permiso', 'vacaciones', 'falta'];
        if (NOT_REQUIRED.includes(workType)) {
            return res.status(200).json({
                status: 200,
                authenticated: false,
                dni,
                reason: 'día libre',
                workType
            });
        }

        // 3b) Debía trabajar y no ha marcado su entrada
        return res.status(200).json({
            status: 200,
            authenticated: false,
            dni,
            reason: 'No ha registrado su llegada laboral'
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, authenticated: false, message: 'Error server internal', error: error.message });
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



        // 4. Buscar el registro de asistencia (con auditoría populada para el popover)
        const attendance = await AttendanceModel.findOne({
            userId: user._id,
            date: searchDate.toISOString()
        })
            .populate('createdBy', 'name surName img')
            .populate('editedBy.user', 'name surName img')
            .populate('comments.user', 'name surName img');

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

                // El permiso SIEMPRE debe llevar un comentario que lo justifique
                if (item.workType === 'permiso' && !(typeof item.note === 'string' && item.note.trim())) {
                    errors.push({ item, error: 'El permiso requiere un comentario obligatorio.' });
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

                // Normalizar fecha a medianoche UTC
                const dateObj = new Date(item.date);
                dateObj.setUTCHours(0, 0, 0, 0);

                // Conservar el historial de notas y registrar SIEMPRE quién modifica.
                // (El $set del objeto completo con note:[] borraba el historial en
                // cada edición, y un $push sobre scheduleOverride.note junto a ese
                // $set genera conflicto de paths en MongoDB.)
                const previousRecord = await AttendanceModel.findOne({ userId, date: dateObj })
                    .select('scheduleOverride')
                    .lean();
                const previousNotes = previousRecord?.scheduleOverride?.note || [];

                // Tipos sin horario de entrada/salida
                const isNoTimeType = ['descanso', 'permiso', 'vacaciones', 'falta'].includes(item.workType);

                const scheduleOverride = {
                    workType: item.workType,
                    shift: item.shift || null,
                    startTime: isNoTimeType ? null : (item.startTime || null),
                    endTime: isNoTimeType ? null : (item.endTime || null),
                    note: [
                        ...previousNotes,
                        { user: adminUserId, message: item.note || 'Cambio de horario', date: new Date() }
                    ]
                };

                // Auditoría del documento:
                //  - Si NO existía → el admin lo crea (createdBy vía $setOnInsert).
                //  - Si ya existía → se registra la edición en editedBy con los
                //    campos del override que realmente cambiaron.
                const prevOverride = previousRecord?.scheduleOverride || {};
                const changedFields = ['workType', 'shift', 'startTime', 'endTime']
                    .filter(field => (prevOverride?.[field] ?? null) !== (scheduleOverride[field] ?? null))
                    // Guardar también el valor anterior y el nuevo de cada campo
                    .map(field => ({
                        field,
                        from: prevOverride?.[field] ?? null,
                        to: scheduleOverride[field] ?? null
                    }));

                const updateOp = {
                    $set: {
                        scheduleOverride,
                        // Permiso y vacaciones también marcan el estado del día
                        ...(item.workType === 'permiso' ? { status: 'permiso' } : {}),
                        ...(item.workType === 'vacaciones' ? { status: 'vacaciones' } : {}),
                    },
                    $setOnInsert: { createdBy: adminUserId }
                };
                if (previousRecord && changedFields.length > 0) {
                    updateOp.$push = {
                        editedBy: { user: adminUserId, change: changedFields, date: new Date() }
                    };
                }

                const record = await AttendanceModel.findOneAndUpdate(
                    { userId, date: dateObj },
                    updateOp,
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                )
                    .populate('scheduleOverride.note.user', 'name surName dni')
                    .populate('createdBy', 'name surName img')
                    .populate('editedBy.user', 'name surName img');

                // Emitir evento Socket.IO para actualización en tiempo real
                const userDoc = await UserModel.findById(userId);
                if (userDoc) {
                    const dateEvent = new Date(record.date);
                    dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
                    io.emit(`${dateEvent.toISOString()}-${userDoc.email}`, { finalRecord: record, user: userDoc });
                }

                results.push(record);
            }
            catch (innerErr) {
                console.log('Error processing item:', item, innerErr);
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



// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: Guardia del día (onDuty) — solo usuarios super
// ══════════════════════════════════════════════════════════════════════
// POST .../user/attendance/on-duty
// body: { userId | dni, date, onDuty: true|false }
// Designa (o quita) la guardia del día. Regla: solo UN usuario por
// departamento y fecha; departamentos habilitados: Operaciones, Reportes
// y Sistemas y desarrollo. Quien designa sale de la sesión.
const ONDUTY_DEPARTMENTS = ['Operaciones', 'Reportes', 'Sistemas y desarrollo'];

routerUser.post(`${nameApi}/user/attendance/on-duty`, validateSessionAndUserSuper, async (req, res) => {
    try {
        const authorId = req.session.userId;
        const { userId, dni, date, onDuty } = req.body || {};

        if (typeof onDuty !== 'boolean') {
            return res.status(400).json({ status: 400, error: 'Bad request', message: '"onDuty" debe ser booleano.' });
        }
        if (!date) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'La fecha (date) es obligatoria.' });
        }

        // Resolver el usuario objetivo por id o por dni
        let userDoc = null;
        if (userId && ObjectId.isValid(userId)) userDoc = await UserModel.findById(userId);
        else if (dni) userDoc = await UserModel.findOne({ dni });
        if (!userDoc) {
            return res.status(404).json({ status: 404, error: 'Not found', message: 'Usuario no encontrado.' });
        }

        const dateObj = new Date(date);
        dateObj.setUTCHours(0, 0, 0, 0);
        if (!isValid(dateObj)) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'Formato de fecha inválido.' });
        }

        const department = userDoc.jobInformation?.department || null;

        // Turno efectivo de un usuario en la fecha: override del día > regla
        // semanal > turno global. (La guardia es única por depto + fecha + turno.)
        const dayNumber = dateObj.getUTCDay();
        const resolveShift = (workScheduleDoc, record) => {
            if (record?.scheduleOverride?.shift) return record.scheduleOverride.shift;
            const map = workScheduleDoc?.scheduleByDay;
            const rule = map?.get?.(String(dayNumber)) || map?.[String(dayNumber)] || null;
            return rule?.shift || workScheduleDoc?.shiftType || 'Diurno';
        };

        if (onDuty) {
            // Solo departamentos habilitados para el rol de guardia
            if (!ONDUTY_DEPARTMENTS.includes(department)) {
                return res.status(400).json({
                    status: 400,
                    error: 'Bad request',
                    message: `La guardia del día solo aplica a: ${ONDUTY_DEPARTMENTS.join(', ')}.`
                });
            }

            const targetRecord = await AttendanceModel.findOne({ userId: userDoc._id, date: dateObj })
                .select('scheduleOverride')
                .lean();
            const targetShift = resolveShift(userDoc.workSchedule, targetRecord);

            // Exclusividad: nadie más del MISMO departamento y MISMO turno
            // puede tener la guardia esa fecha
            const deptUsers = await UserModel.find({ 'jobInformation.department': department })
                .select('_id name surName workSchedule');
            const deptUserIds = deptUsers.map(u => u._id);
            const candidates = await AttendanceModel.find({
                date: dateObj,
                onDuty: true,
                userId: { $in: deptUserIds, $ne: userDoc._id }
            }).select('userId scheduleOverride').lean();

            const deptUsersById = new Map(deptUsers.map(u => [String(u._id), u]));
            const conflict = candidates.find(rec => {
                const holder = deptUsersById.get(String(rec.userId));
                return holder && resolveShift(holder.workSchedule, rec) === targetShift;
            });

            if (conflict) {
                const holder = deptUsersById.get(String(conflict.userId));
                const holderName = holder?.name
                    ? `${holder.name} ${holder.surName || ''}`.trim()
                    : 'otro usuario';
                return res.status(409).json({
                    status: 409,
                    error: 'Conflict',
                    message: `Ya hay guardia ${String(targetShift).toLowerCase()} asignada ese día en ${department}: ${holderName}.`
                });
            }
        }

        // Registrar el cambio en la auditoría del documento
        const previousRecord = await AttendanceModel.findOne({ userId: userDoc._id, date: dateObj })
            .select('onDuty')
            .lean();
        const prevOnDuty = Boolean(previousRecord?.onDuty);

        const updateOp = {
            $set: { onDuty },
            $setOnInsert: { createdBy: authorId }
        };
        if (previousRecord && prevOnDuty !== onDuty) {
            updateOp.$push = {
                editedBy: { user: authorId, change: [{ field: 'onDuty', from: prevOnDuty, to: onDuty }], date: new Date() }
            };
        }

        const record = await AttendanceModel.findOneAndUpdate(
            { userId: userDoc._id, date: dateObj },
            updateOp,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        )
            .populate('comments.user', 'name surName img')
            .populate('createdBy', 'name surName img')
            .populate('editedBy.user', 'name surName img');

        // Refrescar la celda en tiempo real (mismo canal que los demás flujos)
        const dateEvent = new Date(record.date);
        dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
        io.emit(`${dateEvent.toISOString()}-${userDoc.email}`, { finalRecord: record, user: userDoc });

        return res.status(200).json({ status: 200, result: record });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});



// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: Comentarios de asistencia (solo usuarios super)
// ══════════════════════════════════════════════════════════════════════
// POST .../user/attendance/comment
// body: { userId | dni, date, message }
// Agrega un comentario al documento Attendance del día (lo crea si no
// existe). El autor sale de la sesión (req.session.userId), nunca del body.
routerUser.post(`${nameApi}/user/attendance/comment`, validateSessionAndUserSuper, async (req, res) => {
    try {
        const authorId = req.session.userId;
        const { userId, dni, date, message } = req.body || {};

        const cleanMessage = typeof message === 'string' ? message.trim() : '';
        if (!cleanMessage) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'El comentario no puede estar vacío.' });
        }
        if (!date) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'La fecha (date) es obligatoria.' });
        }

        // Resolver el usuario objetivo por id o por dni
        let targetUserId = userId && ObjectId.isValid(userId) ? userId : null;
        let userDoc = null;
        if (targetUserId) {
            userDoc = await UserModel.findById(targetUserId);
        } else if (dni) {
            userDoc = await UserModel.findOne({ dni });
            targetUserId = userDoc?._id;
        }
        if (!userDoc) {
            return res.status(404).json({ status: 404, error: 'Not found', message: 'Usuario no encontrado.' });
        }

        const dateObj = new Date(date);
        dateObj.setUTCHours(0, 0, 0, 0);
        if (!isValid(dateObj)) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'Formato de fecha inválido.' });
        }

        const record = await AttendanceModel.findOneAndUpdate(
            { userId: targetUserId, date: dateObj },
            {
                $push: { comments: { user: authorId, message: cleanMessage, date: new Date() } },
                // Si el documento no existía, quien comenta lo origina
                $setOnInsert: { createdBy: authorId }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        )
            .populate('comments.user', 'name surName img')
            .populate('createdBy', 'name surName img')
            .populate('editedBy.user', 'name surName img');

        // Refrescar la celda en tiempo real (mismo canal que los demás flujos)
        const dateEvent = new Date(record.date);
        dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
        io.emit(`${dateEvent.toISOString()}-${userDoc.email}`, { finalRecord: record, user: userDoc });

        return res.status(200).json({ status: 200, result: record });
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

                // Límite fijo: el personal nocturno puede marcar su salida hasta
                // las 10:00 AM (hora Venezuela), sin importar a qué hora termine su
                // turno. 600 = 10 horas × 60 min contados desde la medianoche.
                const NOCTURNAL_CHECKOUT_LIMIT_MINUTES = 10 * 60;
                const checkoutLimitMinutes = NOCTURNAL_CHECKOUT_LIMIT_MINUTES;

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

        const LATE_GRACE_MINUTES = 8;
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
                    imageReference: [body.imageReference],
                    // Auditoría: el empleado origina su propio registro al marcar
                    createdBy: user._id
                });
                await finalRecord.populate('createdBy', 'name surName img');
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
            imageReference: [body.imageReference],
            // Auditoría: el empleado origina su propio registro al marcar
            createdBy: user._id
        });
        await finalRecord.populate('createdBy', 'name surName img');

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
        // basename evita path traversal (../../etc)
        const namefile = basename(req.params?.namefile || '');
        const filePath = join(userMultimedia, namefile);

        // Miniaturas: ?w=64 redimensiona al vuelo con sharp (cuadrado, cover).
        // El navegador cachea cada tamaño por URL, así que solo se genera una vez
        // por sesión de caché.
        const width = Number(req.query?.w);
        if (Number.isInteger(width) && width > 0 && width <= 512) {
            const buffer = await sharp(filePath)
                .resize(width, width, { fit: 'cover' })
                .toBuffer();
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.type(namefile.split('.').pop() || 'jpeg');
            return res.send(buffer);
        }

        return res.sendFile(filePath);
    }
    catch (error) {
        console.log(error);
        return res.status(404).json({ status: 404, error: 'Not found', message: 'Imagen no encontrada.' });
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