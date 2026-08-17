import express from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
const routerUser = express.Router();
import { join, basename } from 'path';
import sharp from 'sharp';
import UserModel, { UpdateByUserSchema } from './user.model.js';
import { userUpdateSchema } from './user.schema.js'
import addCredentials from '../../middleware/addCredential.js';
import checkLaboralEntry from '../../middleware/checkLaboralEntry.js';
import controller from './user.controller.js';

import nameApi from '../../libs/name_api.js';
import { ObjectId } from 'mongodb';  //   validateSessionAndUser.js
import { validateSession, validateSessionAndUserSuper, validateSuperUser, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { buildTodayRoster, getUserDayRole } from './dayRoster.service.js';
import { userMultimedia } from '../../util/multer.js'

import AttendanceModel from './attendance.model.js';
import { attendanceMachineValidationSchema } from './attendance.squema.js';
import { buildDailyAttendanceReport, computeDiscountUnits } from './attendanceReport.service.js';
import { buildAttendanceReportPdf } from './attendanceReport.pdf.js';
import { runDailyAttendanceReport } from './attendanceReport.job.js';
import { parseISO, format, getDay, startOfDay, isValid } from 'date-fns';


import { io } from '../../services/socket/io.js'
import { emitCloseSessionForUser } from '../../services/socket/sessionEvents.js';
import { overtimeOfDay, accumulateOvertime } from './overtime.lib.js';
import { applyScheduleUpdates, validateScheduleItem, notifyScheduleApplied } from './scheduleWrite.lib.js';
import {
    normalizeUpdates, resolveTargets, snapshotSlots,
    pendingForSlots, emitScheduleRequest,
} from './scheduleRequest.lib.js';
import { notify, actorFromSession } from '../notification/notification.service.js';
import { publishAttendanceMark } from './attendanceMark.lib.js';
import { etiquetaRol, claveDia, fechaCorta } from './scheduleLabels.lib.js';
import { esAltaDeHoy } from './newEmployee.lib.js';


// Estado con el que nace la hora extra al cerrar la jornada. Si el usuario
// tiene `autoApproveOvertime`, lo que trabaje de más queda aprobado solo y
// nunca aparece como pendiente para el administrador.
// Se escribe SIEMPRE, aunque ese día no haya excedente: los minutos se
// derivan después, y overtimeOfDay informa 'none' cuando no hay nada que
// aprobar, así que un 'pending' sin excedente no ensucia ninguna vista.
// Se limpia `approvedMinutes`: un marcaje de salida REEMPLAZA la jornada, y con
// ella el excedente. Si quedara la cantidad de una decisión anterior, volver a
// marcar la salida de alguien con aprobación automática dejaría el día aprobado
// por esos minutos viejos en vez de por el excedente nuevo.
const overtimeOnCheckout = (userDoc) => {
    const auto = userDoc?.workSchedule?.autoApproveOvertime === true;
    return auto
        ? { 'overtime.status': 'approved', 'overtime.auto': true, 'overtime.decidedAt': new Date(), 'overtime.approvedMinutes': null }
        : { 'overtime.status': 'pending', 'overtime.auto': false, 'overtime.approvedMinutes': null };
};

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

routerUser.post(`/user/login`, controller.login, checkLaboralEntry, addCredentials);   //legace
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




// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: Directorio de usuarios — lista paginada + buscador (SIN password)
// ══════════════════════════════════════════════════════════════════════
// GET .../user/list?page=1&limit=12&search=juan perez
//   · Devuelve usuarios paginados. Se proyectan SOLO campos de presentación
//     (password ya es select:false y nunca viaja).
//   · Si viene `search`, filtra por name/surName (case-insensitive). Con varias
//     palabras, CADA término debe aparecer en name O surName, así "juan perez"
//     coincide con name~juan y surName~perez en cualquier orden.
//   · IMPORTANTE: se declara ANTES de /user/:dni para que "list" no se capture
//     como un dni.
routerUser.get(`${nameApi}/user/list`, validateSession, async (req, res) => {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

        // Filtro de búsqueda: cada palabra debe aparecer en name O surName.
        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const terms = search ? search.split(/\s+/).filter(Boolean) : [];
        const filter = terms.length
            ? { $and: terms.map(t => {
                const rx = new RegExp(escapeRegex(t), 'i');
                return { $or: [{ name: rx }, { surName: rx }] };
            }) }
            : {};

        // Solo un admin ve (y por ende puede editar) las banderas admin/super.
        const isAdmin = req.session.admin === true;
        const fields = 'name surName dni email img jobInformation inabilited createdOn'
            + (isAdmin ? ' admin super' : '');

        const skip = (page - 1) * limit;
        const [users, totalUsers] = await Promise.all([
            UserModel.find(filter)
                .select(fields)
                .sort({ surName: 1, name: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            UserModel.countDocuments(filter),
        ]);

        return res.status(200).json({
            status: 200,
            page,
            limit,
            search,
            totalUsers,
            totalPages: Math.max(1, Math.ceil(totalUsers / limit)),
            users,
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
    }
});


routerUser.put(`${nameApi}/user/:id`, validateAdminUser, asyncHandler(async (req, res) => {
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
}));

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
                        // - scheduleOverride.workType → faltas/permisos/vacaciones pre-registrados
                        // - status                    → ausencias/permisos/vacaciones orgánicos
                        // - discountUnits             → unidades a descontar por retardo
                        // - onDuty / auxiliary        → roles de guardia del día
                        // - checkOut                  → necesario para derivar horas extras
                        // - scheduleOverride.shift    → turno puntual del día (gana al semanal)
                        // - overtime.status           → decisión persistida de la hora extra
                        { $project: { date: 1, isLate: 1, isExtraDay: 1, checkIn: 1, checkOut: 1, status: 1, 'scheduleOverride.workType': 1, 'scheduleOverride.shift': 1, 'overtime.status': 1, 'overtime.approvedMinutes': 1, discountUnits: 1, onDuty: 1, auxiliary: 1, _id: 0 } }
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
                    },
                    // Unidades a descontar por retardo acumuladas en el período
                    // ($sum ignora los documentos sin la propiedad — anteriores
                    // a su incorporación al modelo).
                    discountUnits: { $sum: '$attendanceRecords.discountUnits' },
                    // Días con rol de guardia: encargado de turno y auxiliar
                    onDutyDays: {
                        $size: {
                            $filter: { input: '$attendanceRecords', as: 'r', cond: { $eq: ['$$r.onDuty', true] } }
                        }
                    },
                    auxiliaryDays: {
                        $size: {
                            $filter: { input: '$attendanceRecords', as: 'r', cond: { $eq: ['$$r.auxiliary', true] } }
                        }
                    },
                    // Permisos y vacaciones: por regla del día (override) o por
                    // status del registro — mismo criterio doble que faltaCount.
                    permisoCount: {
                        $size: {
                            $filter: {
                                input: '$attendanceRecords',
                                as: 'r',
                                cond: {
                                    $or: [
                                        { $eq: ['$$r.scheduleOverride.workType', 'permiso'] },
                                        { $eq: ['$$r.status', 'permiso'] }
                                    ]
                                }
                            }
                        }
                    },
                    vacacionesCount: {
                        $size: {
                            $filter: {
                                input: '$attendanceRecords',
                                as: 'r',
                                cond: {
                                    $or: [
                                        { $eq: ['$$r.scheduleOverride.workType', 'vacaciones'] },
                                        { $eq: ['$$r.status', 'vacaciones'] }
                                    ]
                                }
                            }
                        }
                    },
                    // ── Horas extras ────────────────────────────────────────
                    // Los minutos NO se agregan acá: se derivan en Node con
                    // overtime.lib.js, la misma función que usan la celda del
                    // horario y el reporte individual. Reescribir esa fórmula en
                    // el lenguaje de agregación crearía una segunda definición de
                    // "hora extra" que se desincronizaría a la primera revisión.
                    //
                    // Lo que sí se hace acá es reducir el array a lo mínimo
                    // indispensable, para no arrastrar los documentos completos.
                    overtimeSource: {
                        $map: {
                            input: '$attendanceRecords',
                            as: 'r',
                            in: {
                                date: '$$r.date',
                                checkIn: '$$r.checkIn',
                                checkOut: '$$r.checkOut',
                                // Turno puntual del día, si el admin lo cambió
                                shift: '$$r.scheduleOverride.shift',
                                // approvedMinutes: aprobación parcial (null = todo)
                                overtime: { status: '$$r.overtime.status', approvedMinutes: '$$r.overtime.approvedMinutes' }
                            }
                        }
                    },
                    // Horario semanal, para resolver el turno de cada día cuando
                    // el registro no trae override (workSchedule se elimina en el
                    // $project final; esto se borra en Node tras el cálculo).
                    shiftByDay: '$workSchedule.scheduleByDay',
                    // Turno del empleado (workSchedule se elimina en el $project
                    // final; el turno se conserva como campo plano).
                    shiftType: '$workSchedule.shiftType'
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

        // ── Horas extras por empleado ───────────────────────────────────────
        // Se derivan de checkIn/checkOut con accumulateOvertime, la misma
        // función del reporte individual y de la celda del horario. El turno
        // efectivo de cada día sigue la misma precedencia que la UI:
        //   override del día  >  regla semanal  >  turno del empleado.
        result.forEach(emp => {
            const days = (emp.overtimeSource || []).map(rec => {
                const dow = rec?.date ? new Date(rec.date).getUTCDay() : null;
                const dayRule = dow === null ? null : emp.shiftByDay?.[String(dow)];
                return { record: rec, shift: rec?.shift || dayRule?.shift || emp.shiftType || 'Diurno' };
            });

            const ot = accumulateOvertime(days);
            emp.overtimeApprovedMinutes = ot.approvedMinutes;
            emp.overtimePendingMinutes = ot.pendingMinutes;
            emp.overtimeRejectedMinutes = ot.rejectedMinutes;
            emp.overtimeApprovedDays = ot.approvedDays;
            emp.overtimePendingDays = ot.pendingDays;

            // Campos auxiliares: solo existían para este cálculo.
            delete emp.overtimeSource;
            delete emp.shiftByDay;
        });

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
            totalDiscountUnits: result.reduce((a, r) => a + (r.discountUnits || 0), 0),
            totalPermiso: result.reduce((a, r) => a + (r.permisoCount || 0), 0),
            totalVacaciones: result.reduce((a, r) => a + (r.vacacionesCount || 0), 0),
            totalOnDuty: result.reduce((a, r) => a + (r.onDutyDays || 0), 0),
            totalAuxiliary: result.reduce((a, r) => a + (r.auxiliaryDays || 0), 0),
            // Horas extras del período, en MINUTOS y desglosadas por estado.
            // El cliente decide cómo formatearlas.
            totalOvertimeApprovedMinutes: result.reduce((a, r) => a + (r.overtimeApprovedMinutes || 0), 0),
            totalOvertimePendingMinutes: result.reduce((a, r) => a + (r.overtimePendingMinutes || 0), 0),
            totalOvertimeRejectedMinutes: result.reduce((a, r) => a + (r.overtimeRejectedMinutes || 0), 0),
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
            .populate('scheduleOverride.note.user', 'name surName')
            // Quién decidió las horas extras, para el reporte individual
            .populate('overtime.decidedBy', 'name surName img');

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

        // 2-bis) Turno NOCTURNO que cruza la medianoche: marcó su entrada AYER
        //        (~18:00) y su jornada sigue abierta (salida ~07:00). Autenticado.
        const yesterdayMidnight = new Date(todayMidnight);
        yesterdayMidnight.setUTCDate(yesterdayMidnight.getUTCDate() - 1);
        const yRecord = await AttendanceModel.findOne({ userId: user._id, date: yesterdayMidnight });
        if (yRecord?.checkIn && !yRecord?.checkOut) {
            const yDayNumber = yesterdayMidnight.getUTCDay();
            const yRule = scheduleMap?.get?.(String(yDayNumber)) || scheduleMap?.[String(yDayNumber)] || null;
            const yShift = yRecord.scheduleOverride?.shift || yRule?.shift || user.workSchedule?.shiftType || 'Diurno';
            if (yShift === 'Nocturno') {
                return res.status(200).json({
                    status: 200,
                    authenticated: true,
                    dni,
                    reason: 'Turno nocturno de ayer aún abierto',
                    checkIn: yRecord.checkIn
                });
            }
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
            .populate('comments.user', 'name surName img')
            // Quién aprobó/rechazó las horas extras (se muestra en DetailPopover)
            .populate('overtime.decidedBy', 'name surName img');

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
// PERMISO: admin aplica directo · super deja la solicitud PENDIENTE.
// Se cambió validateAdminUser por validateSession porque un usuario super que
// no es admin ya no puede quedar fuera: su cambio no se aplica, pero sí se
// registra. La distinción se hace adentro, no en el middleware.
routerUser.post(`${nameApi}/user/schedule/dynamic/group`, validateSession, async (req, res) => {
    try {
        const { updates, adminUserId } = req.body;

        const esAdmin = req.session.admin === true;
        const esSuper = req.session.super === true;

        if (!esAdmin && !esSuper) {
            return res.status(403).json({
                status: 403, error: 'Forbidden',
                message: 'Se requiere permiso de administrador o de super usuario para cambiar el horario.'
            });
        }

        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                status: 400,
                message: 'Se requiere un array "updates" con al menos un elemento.',
                error: 'Bad request'
            });
        }

        // El autor del cambio sale de la SESIÓN, no del cuerpo de la petición.
        //
        // Antes se usaba `adminUserId` tal como lo mandaba el cliente, así que
        // la auditoría del documento de asistencia —quién creó, quién editó—
        // decía lo que el front declarara, no quién estaba realmente detrás.
        // Un id equivocado, o puesto a mano, firmaba el cambio con otro nombre.
        //
        // Se sigue aceptando en el cuerpo por compatibilidad con el cliente
        // actual, pero solo para avisar cuando no coincide: no manda.
        const authorUserId = req.session.userId;

        if (adminUserId && String(adminUserId) !== String(authorUserId)) {
            console.log(`[horario] adminUserId del cuerpo (${adminUserId}) ignorado; firma la sesión (${authorUserId}).`);
        }

        // ── Camino SOLICITUD: super que no es admin ────────────────────
        // El cambio NO se escribe. Se guarda entero en la notificación y
        // espera a que un administrador lo apruebe.
        if (!esAdmin) {
            // Se valida ANTES de dejarlo pendiente: no tiene sentido que un
            // administrador apruebe algo que va a fallar al aplicarse.
            const invalidos = updates
                .map(item => ({ item, error: validateScheduleItem(item) }))
                .filter(x => x.error);

            if (invalidos.length > 0) {
                return res.status(400).json({
                    status: 400, error: 'Bad request',
                    message: 'Hay cambios inválidos en la solicitud.',
                    errors: invalidos,
                });
            }

            // Celdas, empleados y foto del "antes", todo en una pasada.
            const { items, targetIds, slots } = await normalizeUpdates(updates);
            const targets = await resolveTargets(targetIds);

            // ¿Ya hay una solicitud esperando sobre alguna de estas celdas?
            // Dejar entrar la segunda deja a los administradores con dos
            // pendientes contradictorias y, al aprobar las dos, gana la última
            // sin que nadie lo haya decidido.
            const enConflicto = await pendingForSlots(slots);
            if (enConflicto.length > 0) {
                const previa = enConflicto[0];
                const quien = `${previa.actor?.name || ''} ${previa.actor?.surName || ''}`.trim();
                return res.status(409).json({
                    status: 409,
                    error: 'Conflict',
                    message: quien
                        ? `Ya hay una solicitud pendiente sobre esas fechas, la pidió ${quien}.`
                        : 'Ya hay una solicitud pendiente sobre esas fechas.',
                    pendingId: previa._id,
                    slots: (previa.meta?.slots || []).filter(s => slots.includes(s)),
                });
            }

            const target = targets[0] || null;
            const fechas = [...new Set(items.map(i => i.date.toLocaleDateString('es-VE', { timeZone: 'UTC' })))];

            const notification = await notify({
                type: 'schedule.changeRequested',
                actor: actorFromSession(req),
                target,
                resource: {
                    kind: 'schedule',
                    id: target?.user || null,
                    name: `${target?.name || ''} ${target?.surName || ''}`.trim(),
                    // Al abrirla, el horario resalta a ese empleado en esa fecha
                    path: target?.user
                        ? `/user?userId=${target.user}&date=${items[0].date.toISOString().slice(0, 10)}`
                        : '/user',
                    img: target?.img || null,
                },
                extra: { fechas, targets },
                // `meta` lleva lo que necesita la GRILLA y el control de
                // conflictos: qué celdas toca, a quiénes, y cómo estaban antes.
                meta: {
                    slots,
                    targets,
                    before: await snapshotSlots(items),
                    updatesCount: items.length,
                },
                request: { status: 'pending', payload: { updates } },
            });

            // La celda se pinta como pendiente en el acto, sin recargar.
            if (notification) {
                emitScheduleRequest('created', {
                    notificationId: String(notification._id),
                    slots,
                    targets,
                    requestedBy: actorFromSession(req),
                    createdAt: notification.createdAt,
                });
            }

            return res.status(202).json({
                status: 202,
                pending: true,
                message: 'El cambio quedó PENDIENTE por aprobación de un administrador.',
                notificationId: notification?._id || null,
                slots,
            });
        }

        // La escritura vive en scheduleWrite.lib.js: la comparten este camino
        // (el administrador aplica directo) y el de aprobar una solicitud.
        const { results, errors } = await applyScheduleUpdates(updates, authorUserId);

        // Avisar a cada empleado que su horario cambió. Va después de escribir
        // y sin await bloqueante sobre la respuesta: el cambio ya está hecho y
        // un problema al notificar no puede alterar lo que se devuelve.
        notifyScheduleApplied(results, actorFromSession(req));

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
// ENDPOINTS: Roles del día — guardia (onDuty) y auxiliar (auxiliary)
// ══════════════════════════════════════════════════════════════════════
// POST .../user/attendance/on-duty    body: { userId | dni, date, onDuty: bool }
// POST .../user/attendance/auxiliary  body: { userId | dni, date, auxiliary: bool }
// Designa (o quita) el rol del día. Misma regla para ambos roles (entre sí
// son independientes): solo UN usuario por departamento, fecha y turno puede
// tenerlo en true; departamentos habilitados: Operaciones, Reportes y
// Sistemas y desarrollo. Quien designa sale de la sesión.
const DAY_ROLE_DEPARTMENTS = ['Operaciones', 'Reportes', 'Sistemas y desarrollo'];

// subject: sujeto de los mensajes ("La guardia" / "El auxiliar");
// label + taken: texto del conflicto ("guardia ... asignada" / "auxiliar ... asignado").
const makeDayRoleHandler = ({ field, subject, label, taken }) => async (req, res) => {
    try {
        const authorId = req.session.userId;
        const { userId, dni, date } = req.body || {};
        const value = req.body ? req.body[field] : undefined;

        if (typeof value !== 'boolean') {
            return res.status(400).json({ status: 400, error: 'Bad request', message: `"${field}" debe ser booleano.` });
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
        // semanal > turno global. (El rol es único por depto + fecha + turno.)
        const dayNumber = dateObj.getUTCDay();
        const resolveShift = (workScheduleDoc, record) => {
            if (record?.scheduleOverride?.shift) return record.scheduleOverride.shift;
            const map = workScheduleDoc?.scheduleByDay;
            const rule = map?.get?.(String(dayNumber)) || map?.[String(dayNumber)] || null;
            return rule?.shift || workScheduleDoc?.shiftType || 'Diurno';
        };

        if (value) {
            // Solo departamentos habilitados para los roles del día
            if (!DAY_ROLE_DEPARTMENTS.includes(department)) {
                return res.status(400).json({
                    status: 400,
                    error: 'Bad request',
                    message: `${subject} del día solo aplica a: ${DAY_ROLE_DEPARTMENTS.join(', ')}.`
                });
            }

            const targetRecord = await AttendanceModel.findOne({ userId: userDoc._id, date: dateObj })
                .select('scheduleOverride')
                .lean();
            const targetShift = resolveShift(userDoc.workSchedule, targetRecord);

            // Exclusividad: nadie más del MISMO departamento y MISMO turno
            // puede tener el rol esa fecha
            const deptUsers = await UserModel.find({ 'jobInformation.department': department })
                .select('_id name surName workSchedule');
            const deptUserIds = deptUsers.map(u => u._id);
            const candidates = await AttendanceModel.find({
                date: dateObj,
                [field]: true,
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
                    message: `Ya hay ${label} ${String(targetShift).toLowerCase()} ${taken} ese día en ${department}: ${holderName}.`
                });
            }
        }

        // Registrar el cambio en la auditoría del documento
        const previousRecord = await AttendanceModel.findOne({ userId: userDoc._id, date: dateObj })
            .select(field)
            .lean();
        const prevValue = Boolean(previousRecord?.[field]);

        const updateOp = {
            $set: { [field]: value },
            $setOnInsert: { createdBy: authorId }
        };
        if (previousRecord && prevValue !== value) {
            updateOp.$push = {
                editedBy: { user: authorId, change: [{ field, from: prevValue, to: value }], date: new Date() }
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

        // ── Aviso al empleado ──────────────────────────────────────────
        // Designar la guardia o el auxiliar del día ES un cambio de horario y
        // hasta ahora no avisaba a nadie: se enteraba quien mirara la grilla.
        //
        // Solo cuando el valor CAMBIA. Volver a guardar lo mismo no es noticia.
        if (prevValue !== value) {
            const cambio = {
                dayKey: claveDia(record.date),
                fecha: fechaCorta(record.date),
                rol: field,
                etiqueta: etiquetaRol(field),
                etiquetaEn: etiquetaRol(field, 'en'),
                asignado: value,
            };

            notify({
                type: 'schedule.dayRole',
                actor: actorFromSession(req),
                target: {
                    user: userDoc._id,
                    name: userDoc.name || '',
                    surName: userDoc.surName || '',
                    img: userDoc.img || null,
                },
                resource: {
                    kind: 'schedule',
                    id: userDoc._id,
                    name: `${userDoc.name || ''} ${userDoc.surName || ''}`.trim(),
                    path: `/user?userId=${userDoc._id}&date=${cambio.dayKey}`,
                    img: userDoc.img || null,
                },
                extra: { targetUserId: String(userDoc._id), cambio },
                meta: { cambios: [cambio] },
            });
        }

        return res.status(200).json({ status: 200, result: record });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
};

routerUser.post(`${nameApi}/user/attendance/on-duty`, validateAdminUser,
    makeDayRoleHandler({ field: 'onDuty', subject: 'La guardia', label: 'guardia', taken: 'asignada' }));

routerUser.post(`${nameApi}/user/attendance/auxiliary`, validateAdminUser,
    makeDayRoleHandler({ field: 'auxiliary', subject: 'El auxiliar', label: 'auxiliar', taken: 'asignado' }));



// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: Aprobar o rechazar las horas extras de un día
// ══════════════════════════════════════════════════════════════════════
// POST .../user/attendance/overtime
// body: { userId | dni, date, status, note?, approvedMinutes? }
//
// approvedMinutes permite APROBAR SOLO UNA PARTE del excedente (de 3 h generadas,
// autorizar 1 h). Se omite para aprobar el total. El servidor deriva los minutos
// del día y rechaza cualquier cantidad mayor.
// body: { userId | dni, date, status: 'approved' | 'rejected', note? }
//
// Solo administradores. Los minutos NO se envían ni se guardan: se derivan
// del propio registro, así el cliente no puede inflar la cantidad aprobada.
routerUser.post(`${nameApi}/user/attendance/overtime`, validateAdminUser, async (req, res) => {
    try {
        const authorId = req.session.userId;
        const { userId, dni, date, status, note, approvedMinutes } = req.body || {};

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'El estado debe ser "approved" o "rejected".' });
        }
        if (!date) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'La fecha (date) es obligatoria.' });
        }

        const userDoc = (userId && ObjectId.isValid(userId))
            ? await UserModel.findById(userId)
            : (dni ? await UserModel.findOne({ dni }) : null);

        if (!userDoc) {
            return res.status(404).json({ status: 404, error: 'Not found', message: 'Usuario no encontrado.' });
        }

        const dateObj = new Date(date);
        dateObj.setUTCHours(0, 0, 0, 0);

        const previousRecord = await AttendanceModel.findOne({ userId: userDoc._id, date: dateObj }).lean();
        if (!previousRecord) {
            return res.status(404).json({ status: 404, error: 'Not found', message: 'No hay registro de asistencia para esa fecha.' });
        }

        // Turno efectivo del día (override > regla semanal > turno global)
        const dayNumber = dateObj.getUTCDay();
        const map = userDoc.workSchedule?.scheduleByDay;
        const rule = map?.get?.(String(dayNumber)) || map?.[String(dayNumber)] || null;
        const shift = previousRecord.scheduleOverride?.shift || rule?.shift || userDoc.workSchedule?.shiftType || 'Diurno';

        // Sin excedente no hay nada que decidir
        const { minutes } = overtimeOfDay(previousRecord, shift);
        if (minutes === 0) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'Ese día no generó horas extras.' });
        }

        // ── Aprobación PARCIAL ──────────────────────────────────────────
        // El administrador puede autorizar solo una parte del excedente: si el
        // día generó 3 h puede aprobar 1 h. La cantidad se valida CONTRA los
        // minutos derivados acá, no contra lo que diga el cliente, para que no
        // se pueda aprobar más de lo que el día realmente generó.
        //   sin enviar approvedMinutes → null = todo el excedente
        let minutesToApprove = null;
        if (status === 'approved' && approvedMinutes !== undefined && approvedMinutes !== null) {
            const parsed = Number(approvedMinutes);
            if (!Number.isInteger(parsed) || parsed <= 0) {
                return res.status(400).json({ status: 400, error: 'Bad request', message: 'Los minutos a aprobar deben ser un entero mayor que cero.' });
            }
            if (parsed > minutes) {
                return res.status(400).json({
                    status: 400, error: 'Bad request',
                    message: `No se pueden aprobar ${parsed} minutos: ese día solo generó ${minutes}.`
                });
            }
            // Aprobar el total se guarda como null, no como el número: así el
            // registro no queda atado a un excedente que puede recalcularse si
            // luego se corrige el marcaje.
            minutesToApprove = parsed === minutes ? null : parsed;
        }

        const record = await AttendanceModel.findOneAndUpdate(
            { userId: userDoc._id, date: dateObj },
            {
                $set: {
                    'overtime.status': status,
                    'overtime.decidedBy': authorId,
                    'overtime.decidedAt': new Date(),
                    'overtime.auto': false,
                    'overtime.note': typeof note === 'string' ? note.trim() : '',
                    // Al rechazar se limpia: un día rechazado no aprueba nada.
                    'overtime.approvedMinutes': status === 'approved' ? minutesToApprove : null
                },
                $push: {
                    editedBy: {
                        user: authorId,
                        change: [
                            { field: 'overtime.status', from: previousRecord.overtime?.status ?? null, to: status },
                            { field: 'overtime.approvedMinutes', from: previousRecord.overtime?.approvedMinutes ?? null, to: status === 'approved' ? minutesToApprove : null }
                        ],
                        date: new Date()
                    }
                }
            },
            { new: true }
        )
            .populate('comments.user', 'name surName img')
            .populate('createdBy', 'name surName img')
            .populate('editedBy.user', 'name surName img')
            .populate('overtime.decidedBy', 'name surName img');

        // Refrescar la celda en tiempo real (mismo canal que los demás flujos)
        const dateEvent = new Date(record.date);
        dateEvent.setUTCHours(dateEvent.getUTCHours() + 4);
        io.emit(`${dateEvent.toISOString()}-${userDoc.email}`, { finalRecord: record, user: userDoc });

        return res.status(200).json({
            status: 200,
            result: record,
            minutes,
            // Cuánto quedó autorizado (null = todo el excedente)
            approvedMinutes: status === 'approved' ? (minutesToApprove ?? minutes) : 0
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});



// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: Ficha del personal de HOY (roster con jornada efectiva)
// ══════════════════════════════════════════════════════════════════════
// GET .../user/roster/today — para el panel analítico: jornada efectiva de
// cada usuario (override por fecha > regla semanal > defecto), marcaje de
// entrada/salida y roles del día (encargado/auxiliar). Solo requiere sesión.
routerUser.get(`${nameApi}/user/roster/today`, validateSession, async (req, res) => {
    try {
        const data = await buildTodayRoster();
        return res.status(200).json(data);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});


// GET .../user/day-role/today — rol del día SOLO del usuario en sesión
// (encargado de turno / auxiliar). Liviano: una lectura de su asistencia de
// hoy, sin traer todo el roster. Lo usa dayRoleContext en el front.
routerUser.get(`${nameApi}/user/day-role/today`, validateSession, async (req, res) => {
    try {
        const role = await getUserDayRole(req.session.userId);
        return res.status(200).json(role);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});



// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: Comentarios de asistencia (solo usuarios super)
// ══════════════════════════════════════════════════════════════════════
/** Cuánto del comentario se copia en la notificación. Ver el `meta` de abajo. */
const COMMENT_PREVIEW_MAX = 400;

// POST .../user/attendance/comment
// body: { userId | dni, date, message }
// Agrega un comentario al documento Attendance del día (lo crea si no
// existe). El autor sale de la sesión (req.session.userId), nunca del body.
routerUser.post(`${nameApi}/user/attendance/comment`, validateSuperUser, async (req, res) => {
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

        // ── Aviso al equipo ────────────────────────────────────────────
        // Solo cuando se comenta el día de OTRA persona. Anunciarle a la
        // plantilla que alguien escribió una nota en su propia celda no le
        // sirve a nadie, y quien la escribió ya sabe que lo hizo.
        //
        // Sin await: el comentario ya está guardado y la respuesta no debe
        // esperar por el aviso, que además nunca lanza.
        if (String(targetUserId) !== String(authorId)) {
            const diaClave = dateObj.toISOString().slice(0, 10);

            notify({
                type: 'attendance.commented',
                actor: actorFromSession(req),
                target: {
                    user: userDoc._id,
                    name: userDoc.name || '',
                    surName: userDoc.surName || '',
                    img: userDoc.img || null,
                },
                resource: {
                    kind: 'schedule',
                    id: record._id,
                    name: `${userDoc.name || ''} ${userDoc.surName || ''}`.trim(),
                    // `detail=1` le dice al horario que además de ir a la celda
                    // despliegue su ficha: el aviso es sobre el comentario, y
                    // dejarlo en la celda cerrada obligaría a buscarlo a mano.
                    path: `/user?userId=${userDoc._id}&date=${diaClave}&detail=1`,
                    img: userDoc.img || null,
                },
                // El comentario va en `meta` y no en el texto: la vista lo pinta
                // como cita aparte, y así el título se lee corrido en la campana
                // por larga que sea la nota.
                meta: {
                    // Recortado a propósito: el comentario completo vive en el
                    // documento de asistencia, que es su sitio. Acá es una
                    // vista previa, y una nota de cien mil caracteres se
                    // guardaría en la notificación, viajaría por socket a toda
                    // la plantilla y se volvería a mandar en cada apertura de
                    // la campana. La celda tiene el texto entero.
                    message: cleanMessage.length > COMMENT_PREVIEW_MAX
                        ? `${cleanMessage.slice(0, COMMENT_PREVIEW_MAX)}…`
                        : cleanMessage,
                    dayKey: diaClave,
                    dayLabel: dateObj.toLocaleDateString('es-VE', { timeZone: 'UTC' }),
                    attendanceId: String(record._id),
                },
            });
        }

        return res.status(200).json({ status: 200, result: record });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});



routerUser.post(`${nameApi}/user/attendance/machine/:dni`, asyncHandler(async (req, res) => {
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
                        $set: { checkOut: now, updatedAt: now, ...overtimeOnCheckout(user) },
                        $push: { imageReference: body.imageReference }
                    },
                    { new: true }
                );

                await publishAttendanceMark({
                    record: finalRecord,
                    user,
                    kind: 'checkOut',
                    schedule: { shift: 'Nocturno', endTime: yesterdayEndTime, startTime: yesterdayDayRule?.startTime || null },
                });

                // Fin de jornada: los frontends cierran la sesión del usuario
                emitCloseSessionForUser(user._id);

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

    // Su PRIMER día no se le cobra. A quien se acaba de dar de alta se le
    // arma el horario el mismo día, muchas veces cuando ya empezó a
    // trabajar: cobrarle un retardo contra una hora pautada que hace un
    // rato no existía es cobrarle un error de captura. Ver newEmployee.lib.
    const esNuevoHoy = esAltaDeHoy(user, now);

    const shouldCheckLate = esNuevoHoy
        ? false
        : (hasOverride ? true : user?.workSchedule?.lateArrivalControl);
    const realIsLate = shouldCheckLate
        ? nowMinutes > (startMinutes + LATE_GRACE_MINUTES)
        : false;

    // Unidades a descontar por el retardo (1 por bloque de 20 min pasada
    // la tolerancia), persistidas en el documento al marcar la entrada.
    //
    // `minutesLate` se sigue calculando aunque sea su primer día: sirve
    // para el aviso —"entraste 40 minutos después de tu hora"— sin que eso
    // se convierta en descuento, porque `realIsLate` ya es false.
    const minutesLate = Math.max(0, nowMinutes - startMinutes);
    const discountUnits = realIsLate ? computeDiscountUnits(minutesLate) : 0;

    // Detalle del retardo que viaja en la respuesta para que el cliente de
    // marcado (bioJarvis) se lo muestre al empleado en el momento.
    const lateInfo = realIsLate
        ? { minutesLate, discountUnits, graceMinutes: LATE_GRACE_MINUTES, startTime: effectiveStartTime }
        : null;

    // Horario efectivo de hoy, para la notificación privada del marcaje.
    // `minutesLate` va acá porque es lo único del retardo que NO se
    // persiste en el documento: se calcula al vuelo contra la hora pautada.
    const marcajeSchedule = {
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        shift: effectiveShiftType,
        minutesLate: realIsLate ? minutesLate : 0,
    };

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
                        discountUnits,
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
                discountUnits,
                isExtraDay: isExtraDayResolved,
                status: isExtraDayResolved ? 'franco-trabajado' : 'presente',
                imageReference: [body.imageReference],
                // Auditoría: el empleado origina su propio registro al marcar
                createdBy: user._id
            });
            await finalRecord.populate('createdBy', 'name surName img');
        }

        await publishAttendanceMark({ record: finalRecord, user, kind: 'checkIn', schedule: marcajeSchedule });

        return res.json({
            finalRecord,
            user,
            lateInfo,
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
                    $set: { checkOut: now, updatedAt: now, ...overtimeOnCheckout(user) },
                    $push: { imageReference: body.imageReference }
                },
                { new: true }
            );

            await publishAttendanceMark({ record: finalRecord, user, kind: 'checkOut', schedule: marcajeSchedule });

            // Fin de jornada: los frontends cierran la sesión del usuario
            emitCloseSessionForUser(user._id);

            return res.status(200).json({ finalRecord, user, message: '¡Fin de la jornada diaria!🥳🥳🥳' });
        }

        // Documento pre-creado por admin sin checkIn
        const finalRecord = await AttendanceModel.findOneAndUpdate(
            { _id: documentExist._id },
            {
                $set: {
                    checkIn: now,
                    isLate: realIsLate,
                    discountUnits,
                    isExtraDay: isExtraDayResolved,
                    status: isExtraDayResolved ? 'franco-trabajado' : 'presente',
                    updatedAt: now
                },
                $push: { imageReference: body.imageReference }
            },
            { new: true }
        );

        await publishAttendanceMark({ record: finalRecord, user, kind: 'checkIn', schedule: marcajeSchedule });

        return res.json({
            finalRecord,
            user,
            lateInfo,
            message: realIsLate ? 'Registro exitoso con retardo😥' : 'Registro exitoso🕗'
        });
    }

    // No existe registro hoy → nueva entrada diurna
    const finalRecord = await AttendanceModel.create({
        userId: user._id,
        date: todayMidnight,
        checkIn: now,
        isLate: realIsLate,
        discountUnits,
        isExtraDay: isExtraDayResolved,
        status: isExtraDayResolved ? 'franco-trabajado' : 'presente',
        imageReference: [body.imageReference],
        // Auditoría: el empleado origina su propio registro al marcar
        createdBy: user._id
    });
    await finalRecord.populate('createdBy', 'name surName img');

    await publishAttendanceMark({ record: finalRecord, user, kind: 'checkIn', schedule: marcajeSchedule });

    return res.json({
        finalRecord,
        user,
        lateInfo,
        message: realIsLate ? 'Registro exitoso con retardo😥' : 'Registro exitoso🕗'
    });

}));







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





routerUser.post(`${nameApi}/user/login`, controller.login, checkLaboralEntry, addCredentials);

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
