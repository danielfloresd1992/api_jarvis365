const controller = {};
import { ObjectId } from 'mongodb';
import { isValid } from 'date-fns';

import { attendanceMachineValidationSchema } from './attendanceUser.schema.js';
import { actorFromSession } from '../notification/notification.service.js';

import { utcMidnightOf } from './services/attendanceTime.lib.js';
import { resolveMinutesToApprove } from './services/overtime.lib.js';
import {
    isLookupById, findUserById, findUserByDni, findTargetUser, findDayRecordForView, emitRecordRefresh,
} from './services/attendanceRecord.service.js';
import { registerMachineMark } from './services/machineMark.service.js';
import { checkAttendanceGate } from './services/attendanceGate.service.js';
import { DAY_ROLE_DEPARTMENTS, findDayRoleHolder, saveDayRole, notifyDayRoleChange } from './services/dayRole.service.js';
import { loadOvertimeContext, saveOvertimeDecision } from './services/overtime.service.js';
import { addAttendanceComment, notifyAttendanceComment } from './services/comment.service.js';
import { buildTodayRoster, getUserDayRole } from './services/dayRoster.service.js';

import { buildGlobalReport } from './report/globalReport.service.js';
import { buildUserReport } from './report/userReport.service.js';
import { buildDailyAttendanceReport } from './report/attendanceReport.service.js';
import { buildAttendanceReportPdf } from './report/attendanceReport.pdf.js';
import { runDailyAttendanceReport } from './report/attendanceReport.job.js';


// Respuesta 500 común a casi todos los endpoints de este recurso.
const serverError = (res, error) => {
    console.log(error);
    return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
};

// Convierte from/to a medianoche UTC e indica si son inválidas o están al revés.
const parseDateRange = (from, to) => {
    const fromDate = utcMidnightOf(from);
    const toDate = utcMidnightOf(to);
    return {
        fromDate,
        toDate,
        invalid: isNaN(fromDate.getTime()) || isNaN(toDate.getTime()),
        reversed: fromDate > toDate,
    };
};



// ─── REPORTES ────────────────────────────────────────────────────────────────

// Reporte consolidado de todos los empleados activos entre ?from y ?to (YYYY-MM-DD).
controller.getGlobalReport = async (req, res) => {
    try {
        const { from, to } = req.query;
        if (!from || !to) return res.status(400).json({ status: 400, error: 'Bad request', message: '"from" and "to" query params are required.' });

        const { fromDate, toDate, invalid, reversed } = parseDateRange(from, to);
        if (invalid) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Invalid date format.' });
        if (reversed) return res.status(400).json({ status: 400, error: 'Bad request', message: '"from" must be before or equal to "to".' });

        const { totals, employees } = await buildGlobalReport(fromDate, toDate);

        return res.status(200).json({ status: 200, period: { from: fromDate, to: toDate }, totals, employees });
    }
    catch (error) {
        return serverError(res, error);
    }
};


// Reporte de un empleado (?userId) entre ?from y ?to.
controller.getUserReport = async (req, res) => {
    try {
        const { userId, from, to } = req.query;
        if (!userId || !ObjectId.isValid(userId)) return res.status(400).json({ status: 400, error: 'Bad request', message: '"userId" is required and must be a valid ObjectId.' });
        if (!from || !to) return res.status(400).json({ status: 400, error: 'Bad request', message: '"from" and "to" query params are required.' });

        const { fromDate, toDate, invalid, reversed } = parseDateRange(from, to);
        if (invalid) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Invalid date format for "from" or "to".' });
        if (reversed) return res.status(400).json({ status: 400, error: 'Bad request', message: '"from" must be before or equal to "to".' });

        const user = await findUserById(userId);
        if (!user) return res.status(404).json({ status: 404, error: 'Not found', message: 'User not found.' });

        const report = await buildUserReport(user, fromDate, toDate);

        return res.status(200).json({ status: 200, ...report, period: { from: fromDate, to: toDate } });
    }
    catch (error) {
        return serverError(res, error);
    }
};


// Corte del día en JSON, o en PDF con ?format=pdf. ?shiftFocus filtra por turno.
controller.getDailyReport = async (req, res) => {
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
        return serverError(res, error);
    }
};


// Genera el corte del día y lo manda por WhatsApp. Body opcional: { cutLabel, number, shiftFocus }.
controller.sendDailyReport = async (req, res) => {
    try {
        const { cutLabel, number, shiftFocus } = req.body || {};
        const result = await runDailyAttendanceReport({ cutLabel, number, shiftFocus });

        return res.status(200).json({ status: 200, message: 'Reporte generado y enviado por WhatsApp.', result });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: 'No se pudo generar/enviar el reporte.', error: error.message });
    }
};



// ─── CONSULTA ────────────────────────────────────────────────────────────────

// ¿El empleado ya marcó hoy? Jarvis-express lo consulta antes de dejarlo entrar.
controller.getAuthenticated = async (req, res) => {
    try {
        const dni = req.params?.dni;
        if (!dni) return res.status(400).json({ status: 400, authenticated: false, message: 'El DNI es obligatorio', error: 'Bad request' });

        const user = await findUserByDni(dni);
        if (!user) return res.status(404).json({ status: 404, authenticated: false, message: 'Usuario no encontrado' });

        const { authenticated, ...detail } = await checkAttendanceGate(user);

        return res.status(200).json({ status: 200, authenticated, dni, ...detail });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, authenticated: false, message: 'Error server internal', error: error.message });
    }
};


// Registro de asistencia de un empleado (por dni) en una fecha (?date).
controller.getAttendanceByDni = async (req, res) => {
    try {
        const { dni } = req.params;
        const { date } = req.query;

        if (!dni) return res.status(400).json({ status: 400, message: 'El DNI es obligatorio', error: 'Bad request' });
        if (!date) return res.status(400).json({ status: 400, message: 'La fecha es obligatoria para la consulta', error: 'Bad request' });

        const searchDate = utcMidnightOf(date);
        if (!isValid(searchDate)) return res.status(400).json({ status: 400, message: 'Formato de fecha inválido', error: 'Bad request' });

        const user = await findUserByDni(dni);
        if (!user) return res.status(404).json({ status: 404, message: "Usuario no encontrado", error: "User Not Found" });

        const attendance = await findDayRecordForView(user._id, searchDate);

        // data: null le indica al front que ese día está vacío.
        if (!attendance) return res.status(404).json({ error: 'Document not found', status: 404, message: "No se encontró registro de asistencia para este día", data: null });

        return res.status(200).json({ status: 200, message: "Registro encontrado", data: attendance });
    }
    catch (error) {
        console.error("Error en getAttendanceByDni:", error);
        return res.status(500).json({ status: 500, message: "Error interno del servidor", error: error.message });
    }
};



// ─── ROLES DEL DÍA ───────────────────────────────────────────────────────────

// Crea el endpoint que asigna o quita un rol del día (guardia o auxiliar).
// Body: { userId | dni, date, [field]: boolean }. Quien asigna sale de la sesión.
function dayRoleHandler({ field, subject, label, taken }) {
    return async (req, res) => {
        try {
            const authorId = req.session.userId;
            const { userId, dni, date } = req.body || {};
            const value = req.body ? req.body[field] : undefined;

            if (typeof value !== 'boolean') return res.status(400).json({ status: 400, error: 'Bad request', message: `"${field}" debe ser booleano.` });
            if (!date) return res.status(400).json({ status: 400, error: 'Bad request', message: 'La fecha (date) es obligatoria.' });

            const userDoc = await findTargetUser({ userId, dni });
            if (!userDoc) return res.status(404).json({ status: 404, error: 'Not found', message: 'Usuario no encontrado.' });

            const dateObj = utcMidnightOf(date);
            if (!isValid(dateObj)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Formato de fecha inválido.' });

            const department = userDoc.jobInformation?.department || null;

            // Asignar exige un departamento habilitado y que nadie más tenga el rol en ese turno.
            if (value) {
                if (!DAY_ROLE_DEPARTMENTS.includes(department)) {
                    return res.status(400).json({ status: 400, error: 'Bad request', message: `${subject} del día solo aplica a: ${DAY_ROLE_DEPARTMENTS.join(', ')}.` });
                }

                const holder = await findDayRoleHolder({ field, userDoc, date: dateObj, department });
                if (holder) {
                    return res.status(409).json({ status: 409, error: 'Conflict', message: `Ya hay ${label} ${String(holder.shift).toLowerCase()} ${taken} ese día en ${department}: ${holder.holderName}.` });
                }
            }

            const { record, previousValue } = await saveDayRole({ field, value, userDoc, date: dateObj, authorId });

            emitRecordRefresh(record, userDoc);

            // Solo se avisa si el valor cambió.
            if (previousValue !== value) {
                notifyDayRoleChange({ field, value, record, userDoc, actor: actorFromSession(req) });
            }

            return res.status(200).json({ status: 200, result: record });
        }
        catch (error) {
            return serverError(res, error);
        }
    };
}

// Asigna o quita la guardia del día.
controller.setOnDuty = dayRoleHandler({ field: 'onDuty', subject: 'La guardia', label: 'guardia', taken: 'asignada' });

// Asigna o quita el auxiliar del día.
controller.setAuxiliary = dayRoleHandler({ field: 'auxiliary', subject: 'El auxiliar', label: 'auxiliar', taken: 'asignado' });


// Personal de hoy con su jornada efectiva, marcajes y roles (panel analítico).
controller.getTodayRoster = async (req, res) => {
    try {
        const data = await buildTodayRoster();
        return res.status(200).json(data);
    }
    catch (error) {
        return serverError(res, error);
    }
};


// Rol del día solo del usuario en sesión (lo usa dayRoleContext en el front).
controller.getMyDayRole = async (req, res) => {
    try {
        const role = await getUserDayRole(req.session.userId);
        return res.status(200).json(role);
    }
    catch (error) {
        return serverError(res, error);
    }
};



// ─── HORAS EXTRAS ────────────────────────────────────────────────────────────

// Aprueba (total o parcial) o rechaza las horas extras de un día.
// Body: { userId | dni, date, status: 'approved' | 'rejected', note?, approvedMinutes? }.
// Los minutos del día se calculan acá, así el cliente no puede inflarlos.
controller.decideOvertime = async (req, res) => {
    try {
        const authorId = req.session.userId;
        const { userId, dni, date, status, note, approvedMinutes } = req.body || {};

        if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'El estado debe ser "approved" o "rejected".' });
        if (!date) return res.status(400).json({ status: 400, error: 'Bad request', message: 'La fecha (date) es obligatoria.' });

        const userDoc = await findTargetUser({ userId, dni });
        if (!userDoc) return res.status(404).json({ status: 404, error: 'Not found', message: 'Usuario no encontrado.' });

        const dateObj = utcMidnightOf(date);

        const { previousRecord, minutes } = await loadOvertimeContext(userDoc, dateObj);
        if (!previousRecord) return res.status(404).json({ status: 404, error: 'Not found', message: 'No hay registro de asistencia para esa fecha.' });
        if (minutes === 0) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Ese día no generó horas extras.' });

        const { error: approvalError, minutesToApprove } = resolveMinutesToApprove(status, approvedMinutes, minutes);
        if (approvalError) return res.status(400).json({ status: 400, error: 'Bad request', message: approvalError });

        const record = await saveOvertimeDecision({ userDoc, date: dateObj, previousRecord, status, note, minutesToApprove, authorId });

        emitRecordRefresh(record, userDoc);

        return res.status(200).json({
            status: 200,
            result: record,
            minutes,
            // Cuánto quedó autorizado (sin tope = todo el excedente).
            approvedMinutes: status === 'approved' ? (minutesToApprove ?? minutes) : 0
        });
    }
    catch (error) {
        return serverError(res, error);
    }
};



// ─── COMENTARIOS ─────────────────────────────────────────────────────────────

// Agrega un comentario al día de un empleado. Body: { userId | dni, date, message }.
// El autor sale de la sesión, nunca del body.
controller.addComment = async (req, res) => {
    try {
        const authorId = req.session.userId;
        const { userId, dni, date, message } = req.body || {};

        const cleanMessage = typeof message === 'string' ? message.trim() : '';
        if (!cleanMessage) return res.status(400).json({ status: 400, error: 'Bad request', message: 'El comentario no puede estar vacío.' });
        if (!date) return res.status(400).json({ status: 400, error: 'Bad request', message: 'La fecha (date) es obligatoria.' });

        const userDoc = await findTargetUser({ userId, dni });
        if (!userDoc) return res.status(404).json({ status: 404, error: 'Not found', message: 'Usuario no encontrado.' });

        // Con un userId válido se usa tal cual (no userDoc._id: la comparación de
        // abajo es de texto y un id en mayúsculas no es igual); si llegó por dni, el _id encontrado.
        const targetUserId = isLookupById(userId) ? userId : userDoc._id;

        const dateObj = utcMidnightOf(date);
        if (!isValid(dateObj)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Formato de fecha inválido.' });

        const record = await addAttendanceComment({ targetUserId, date: dateObj, authorId, message: cleanMessage });

        emitRecordRefresh(record, userDoc);

        // Comentar el propio día no avisa a nadie.
        if (String(targetUserId) !== String(authorId)) {
            notifyAttendanceComment({ actor: actorFromSession(req), userDoc, record, date: dateObj, message: cleanMessage });
        }

        return res.status(200).json({ status: 200, result: record });
    }
    catch (error) {
        return serverError(res, error);
    }
};



// ─── MARCAJE ─────────────────────────────────────────────────────────────────

// Marcaje desde la máquina (bioJarvis): el servicio decide si es entrada o salida.
// Los errores de validación los traduce asyncHandler (en las rutas).
controller.markFromMachine = async (req, res) => {
    const body = req.body;
    // Solo valida: se guarda body.imageReference tal cual llega, sin el trim del
    // esquema. Usar el valor validado cambiaría lo que se guarda en Mongo.
    await attendanceMachineValidationSchema.validate(body, { abortEarly: false, stripUnknown: true });

    const user = await findUserByDni(req.params?.dni);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { status, body: response } = await registerMachineMark(user, body.imageReference);

    return res.status(status).json(response);
};



export default controller;
