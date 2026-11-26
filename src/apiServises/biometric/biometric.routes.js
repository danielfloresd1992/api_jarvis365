import express from 'express';
import controller from './biometric.controller.js';
import nameApi from '../../libs/name_api.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { extendSession, validateAdminUser, validateAdminSessionOnly } from '../../middleware/validateSessionAndUser.js';
import { validateKioskAdmin } from './biometricAccess.guard.js';

// Gestión de los terminales biométricos (Hikvision) desde la pantalla de
// configuración de bioJarvis. Solo administradores: el kiosco está al alcance
// de cualquiera, y estas rutas leen datos del personal, cambian la hora del
// equipo y dan de alta personas y huellas en él. Las de un terminal llevan
// `?terminal=<código>` (sin él, el principal).
//
// Tres guardianes, de más a menos permisivo:
//   validateKioskAdmin        la configuración del kiosco: un administrador con
//                             su sesión de siempre, o quien entró con su huella,
//                             solo en ESE terminal (biometricAccess.guard.js).
//   validateAdminUser         autorizar una tablet a entrar con huella: solo con
//                             correo y contraseña, nunca con huella.
//   validateAdminSessionOnly  /biometric/terminals, la lista que administra
//                             Client365: guarda contraseñas de equipos.
//
// /auth/biometric/* (entrar con huella) no lleva guardián: es un inicio de
// sesión. Se protege con la llave de la tablet y con el identificador secreto de
// cada pedido (biometricAccess.service.js).
//
// /biometric/claims tampoco: lo usa el kiosco al marcar, sin sesión, como el
// marcaje mismo. Solo acepta huellas que esta API acaba de avisar
// (biometricClaim.service.js).
//
// Orden alfabético por URL.

const routerBiometric = express.Router();


routerBiometric.post(`${nameApi}/auth/biometric/cancel`, asyncHandler(controller.cancelFingerprintLogin));     // dejar de esperar la huella (body: { challengeId })
routerBiometric.post(`${nameApi}/auth/biometric/complete`, asyncHandler(controller.completeFingerprintLogin)); // ¿ya puso el dedo? 202 esperando · 200 entra · 401 no (body: { challengeId })
routerBiometric.post(`${nameApi}/auth/biometric/start`, asyncHandler(controller.startFingerprintLogin));       // pedir entrar con huella desde una tablet autorizada (body: { token })
routerBiometric.post(`${nameApi}/biometric/claims`, asyncHandler(controller.claimFingerprint));                // ¿marca este kiosco esta huella? el primero que la pide (body: { eventId, kioskId })
routerBiometric.post(`${nameApi}/biometric/employees`, extendSession, validateKioskAdmin, asyncHandler(controller.enroll));   // dar de alta en el terminal a un usuario del sistema y vincularlo (body: { userId, employeeNo, name })
routerBiometric.get(`${nameApi}/biometric/employees/:employeeNo/fingerprints`, extendSession, validateKioskAdmin, asyncHandler(controller.getFingerprints));     // posiciones de huella de una persona (sin plantillas)
routerBiometric.post(`${nameApi}/biometric/employees/:employeeNo/fingerprints`, extendSession, validateKioskAdmin, asyncHandler(controller.captureFingerprint)); // encender el lector, esperar el dedo y guardar la huella
routerBiometric.get(`${nameApi}/biometric/events`, extendSession, validateKioskAdmin, asyncHandler(controller.getEvents));   // eventos de un día (?date=AAAA-MM-DD, por defecto hoy)
routerBiometric.post(`${nameApi}/biometric/kiosk-access`, extendSession, validateAdminUser, asyncHandler(controller.enableKioskAccess)); // autorizar esta tablet a entrar con huella (devuelve su llave una vez)
routerBiometric.delete(`${nameApi}/biometric/kiosk-access`, asyncHandler(controller.disableKioskAccess));                     // quitarle la huella a una tablet (body: { token })
routerBiometric.get(`${nameApi}/biometric/links`, extendSession, validateKioskAdmin, asyncHandler(controller.getLinks));     // vínculo terminal ↔ usuarios, con sugerencias
routerBiometric.put(`${nameApi}/biometric/links/:employeeNo`, extendSession, validateKioskAdmin, asyncHandler(controller.link));      // vincular (body: { userId })
routerBiometric.delete(`${nameApi}/biometric/links/:employeeNo`, extendSession, validateKioskAdmin, asyncHandler(controller.unlink)); // desvincular
routerBiometric.get(`${nameApi}/biometric/status`, extendSession, validateKioskAdmin, asyncHandler(controller.getStatus));   // conexión, datos del equipo y reloj
routerBiometric.get(`${nameApi}/biometric/terminals`, extendSession, validateAdminSessionOnly, asyncHandler(controller.listTerminals));             // terminales, sin contraseñas, con su escucha
routerBiometric.post(`${nameApi}/biometric/terminals`, extendSession, validateAdminSessionOnly, asyncHandler(controller.createTerminal));           // agregar un terminal
routerBiometric.post(`${nameApi}/biometric/terminals/import-env`, extendSession, validateAdminSessionOnly, asyncHandler(controller.importEnvTerminal)); // administrar desde aquí el principal del .env
routerBiometric.get(`${nameApi}/biometric/terminals/sync`, extendSession, validateAdminSessionOnly, asyncHandler(controller.getSyncJob));          // cómo va (o cómo terminó) la última sincronización
routerBiometric.post(`${nameApi}/biometric/terminals/sync`, extendSession, validateAdminSessionOnly, asyncHandler(controller.startSync));          // sincronizar: copiar a cada terminal lo que le falta (body: { codes })
routerBiometric.get(`${nameApi}/biometric/terminals/sync/plan`, extendSession, validateAdminSessionOnly, asyncHandler(controller.getSyncPlan));    // qué se copiaría y qué no se puede (?codes=a,b&refresh=1)
routerBiometric.post(`${nameApi}/biometric/terminals/test`, extendSession, validateAdminSessionOnly, asyncHandler(controller.testTerminal));       // probar una conexión antes de guardarla
routerBiometric.put(`${nameApi}/biometric/terminals/:id`, extendSession, validateAdminSessionOnly, asyncHandler(controller.updateTerminal));       // cambiar un terminal (el código no cambia)
routerBiometric.delete(`${nameApi}/biometric/terminals/:id`, extendSession, validateAdminSessionOnly, asyncHandler(controller.deleteTerminal));    // quitar un terminal
routerBiometric.post(`${nameApi}/biometric/terminals/:ref/check`, extendSession, validateAdminSessionOnly, asyncHandler(controller.checkTerminal)); // comprobar (por id, o el principal del .env por su código)
routerBiometric.get(`${nameApi}/biometric/terminals/:code/people`, extendSession, validateAdminSessionOnly, asyncHandler(controller.getTerminalPeople)); // qué tiene: personas, huellas y vínculo con Jarvis (?refresh=1)
routerBiometric.post(`${nameApi}/biometric/terminals/:code/people`, extendSession, validateAdminSessionOnly, asyncHandler(controller.addPerson));        // agregar a un usuario de Jarvis a ese terminal (body: { userId, employeeNo, name })
routerBiometric.delete(`${nameApi}/biometric/terminals/:code/people/:employeeNo`, extendSession, validateAdminSessionOnly, asyncHandler(controller.removePerson)); // quitarlo de ese terminal, con sus huellas (body: { name } el que se vio)
routerBiometric.get(`${nameApi}/biometric/terminals/:code/people/:employeeNo/sources`, extendSession, validateAdminSessionOnly, asyncHandler(controller.getFingerprintSources)); // de qué otros terminales se le pueden copiar huellas
routerBiometric.post(`${nameApi}/biometric/terminals/:code/people/:employeeNo/copy`, extendSession, validateAdminSessionOnly, asyncHandler(controller.copyFingerprints));        // copiarle las huellas de otro terminal (body: { from })
routerBiometric.post(`${nameApi}/biometric/terminals/:code/people/:employeeNo/fingerprints`, extendSession, validateAdminSessionOnly, asyncHandler(controller.registerFingerprint)); // registrarle una huella en el lector de ese terminal
routerBiometric.get(`${nameApi}/biometric/terminals/:code/add-options`, extendSession, validateAdminSessionOnly, asyncHandler(controller.getAddOptions)); // a quién de Jarvis se puede agregar, y el próximo nº libre
routerBiometric.put(`${nameApi}/biometric/time`, extendSession, validateKioskAdmin, asyncHandler(controller.syncTime));      // poner el terminal en hora (UTC-04:00)
routerBiometric.get(`${nameApi}/biometric/users`, extendSession, validateKioskAdmin, asyncHandler(controller.getUsers));     // empleados registrados en el terminal


export { routerBiometric };
