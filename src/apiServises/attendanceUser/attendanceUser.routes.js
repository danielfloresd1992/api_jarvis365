import express from 'express';
import controller from './attendanceUser.controller.js';
import nameApi from '../../libs/name_api.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { validateSession, validateAdminUser, validateSuperUser } from '../../middleware/validateSessionAndUser.js';

// Asistencia del personal. Las URLs siguen bajo /user/... porque así las usan los frontends.
//
// Orden jerárquico por URL y, dentro de cada nivel, alfabético. La ruta con
// parámetro (/user/attendance/:dni) va SIEMPRE al final de su nivel: si subiera,
// "report", "daily-report", etc. se leerían como un dni.

const routerAttendanceUser = express.Router();


// ─── /user/attendance ────────────────────────────────────────────────────────
routerAttendanceUser.get(`${nameApi}/user/attendance/authenticated/:dni`, controller.getAuthenticated);                 // ¿ya marcó hoy? (antes del login)
routerAttendanceUser.post(`${nameApi}/user/attendance/auxiliary`, validateAdminUser, controller.setAuxiliary);          // asignar/quitar auxiliar del día
routerAttendanceUser.post(`${nameApi}/user/attendance/comment`, validateSuperUser, controller.addComment);              // comentar el día de un empleado
routerAttendanceUser.get(`${nameApi}/user/attendance/daily-report`, controller.getDailyReport);                         // corte del día (JSON o PDF)
routerAttendanceUser.post(`${nameApi}/user/attendance/daily-report/send`, controller.sendDailyReport);                  // corte del día por WhatsApp
routerAttendanceUser.get(`${nameApi}/user/attendance/global-report`, controller.getGlobalReport);                       // todos los empleados en un rango
routerAttendanceUser.post(`${nameApi}/user/attendance/machine/:dni`, asyncHandler(controller.markFromMachine));         // marcaje de entrada/salida (bioJarvis)
routerAttendanceUser.post(`${nameApi}/user/attendance/on-duty`, validateAdminUser, controller.setOnDuty);               // asignar/quitar guardia del día
routerAttendanceUser.post(`${nameApi}/user/attendance/overtime`, validateAdminUser, controller.decideOvertime);         // aprobar/rechazar horas extras
routerAttendanceUser.get(`${nameApi}/user/attendance/report`, controller.getUserReport);                                // un empleado en un rango
routerAttendanceUser.get(`${nameApi}/user/attendance/:dni`, controller.getAttendanceByDni);                             // registro de un día (?date) — SIEMPRE la última

// ─── /user/day-role ──────────────────────────────────────────────────────────
routerAttendanceUser.get(`${nameApi}/user/day-role/today`, validateSession, controller.getMyDayRole);                  // mi rol de hoy

// ─── /user/roster ────────────────────────────────────────────────────────────
routerAttendanceUser.get(`${nameApi}/user/roster/today`, validateSession, controller.getTodayRoster);                  // personal de hoy


export { routerAttendanceUser };
