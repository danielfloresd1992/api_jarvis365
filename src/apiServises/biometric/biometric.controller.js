import { getDeviceStatus, listDeviceUsers, listDayEvents, syncDeviceTime } from './biometric.service.js';
import { getLinkReport, linkEmployee, unlinkEmployee } from './biometricLink.service.js';
import { enrollEmployee, getFingerprints, enrollFingerprint } from './biometricEnroll.service.js';
import {
    resolveTerminal, listTerminals, createTerminal, importEnvTerminal, updateTerminal, deleteTerminal,
    checkTerminal, testTerminal,
} from './biometricTerminal.service.js';
import { getListenerStatus, refreshListenerTerminals, wasForwarded } from './biometricListener.js';
import { createKioskAccess, removeKioskAccess, startFingerprintLogin, challengeOutcome, cancelChallenge } from './biometricAccess.service.js';
import { claimFingerprint } from './biometricClaim.service.js';
import { getTerminalPeople, getSyncPlan, startSync, getSyncJob } from './biometricSync.service.js';
import { sessionAccess, loggedInUser } from './biometricAccess.lib.js';
import { BiometricError, errorResponse, isIsoDate, businessDateOf } from './biometric.lib.js';

// Un método por endpoint. Los fallos del terminal (apagado, credenciales malas,
// respuesta rara) no son errores del servidor: se traducen con errorResponse a
// 502/503/504 con un mensaje que la pantalla de configuración puede mostrar.
//
// Las rutas de un terminal llevan `?terminal=<código>`; sin él, el principal.
// Así bioJarvis de antes, que no lo manda, sigue hablando con el de siempre.

const controller = {};

const respond = (work) => async (req, res) => {
    try {
        return res.status(200).json(await work(req));
    }
    catch (error) {
        const body = errorResponse(error);
        if (body.status === 500) console.log('[biometric] error inesperado:', error);
        return res.status(body.status).json(body);
    }
};

// Igual, con el terminal de la petición ya resuelto: { code, name, office, source, device }.
const onTerminal = (work) => respond(async (req) => work(req, await resolveTerminal(req.query?.terminal)));

// Quién hace la acción: el administrador de la sesión, o quien entró con su huella.
const actorOf = (req) => req.session?.userId ?? req.session?.biometricAccess?.userId ?? null;

// Tras cambiar la lista de terminales, la escucha se pone al día sin esperar.
const thenRefresh = (work) => respond(async (req) => {
    const result = await work(req);
    refreshListenerTerminals().catch((error) => console.log('[biometric] no se pudo releer la lista de terminales:', error?.message ?? error));
    return result;
});



// ─── Un terminal ─────────────────────────────────────────────────────────

// Junto al estado del equipo viajan el terminal y su escucha en vivo.
controller.getStatus = onTerminal(async (req, terminal) => ({
    ...(await getDeviceStatus(terminal.device)),
    terminal: { code: terminal.code, name: terminal.name, office: terminal.office, source: terminal.source },
    listener: getListenerStatus(terminal.code),
}));

controller.getUsers = onTerminal((req, terminal) => listDeviceUsers(terminal.device));

controller.getEvents = onTerminal((req, terminal) => {
    const date = req.query?.date ?? businessDateOf(new Date());
    if (!isIsoDate(date)) throw new BiometricError('bad_request', 'La fecha debe tener el formato AAAA-MM-DD.');
    return listDayEvents(terminal.device, date);
});

controller.syncTime = onTerminal((req, terminal) => syncDeviceTime(terminal.device));

controller.getLinks = onTerminal((req, terminal) => getLinkReport(terminal.device));

// Quien vincula queda registrado en user.biometric.linkedBy.
controller.link = onTerminal((req, terminal) => linkEmployee({
    device: terminal.device,
    employeeNo: req.params.employeeNo,
    userId: req.body?.userId,
    adminId: actorOf(req),
}));

// El vínculo es del usuario, no de un terminal: no hace falta ninguno.
controller.unlink = respond((req) => unlinkEmployee(req.params.employeeNo));

// Alta en el terminal de un usuario del sistema: queda vinculado, con quién lo hizo.
controller.enroll = onTerminal((req, terminal) => enrollEmployee({
    device: terminal.device,
    userId: req.body?.userId,
    employeeNo: req.body?.employeeNo == null ? '' : String(req.body.employeeNo).trim(),
    name: req.body?.name,
    adminId: actorOf(req),
}));

controller.getFingerprints = onTerminal((req, terminal) => getFingerprints(terminal.device, req.params.employeeNo));

// Espera a que la persona ponga el dedo en el lector del terminal (hasta un minuto).
controller.captureFingerprint = onTerminal((req, terminal) => enrollFingerprint(terminal, req.params.employeeNo));



// ─── Una huella, un marcaje ──────────────────────────────────────────────

// Antes de marcar una huella, el kiosco la reclama: { granted } dice si la marca
// él. El primero se la queda; otro kiosco del mismo terminal recibe «no».
controller.claimFingerprint = respond(async (req) => {
    const eventId = req.body?.eventId;
    const result = await claimFingerprint({ eventId, kioskId: req.body?.kioskId, anchored: req.body?.anchored === true, known: wasForwarded(eventId) });
    if (!result.granted) console.log(`[biometric] la huella ${eventId} ya la está marcando otro kiosco: este no la marca`);
    return result;
});



// ─── Gestión de terminales (Client365) ───────────────────────────────────

// Cada terminal, sin contraseña, con el estado de su escucha.
controller.listTerminals = respond(async () => {
    const { terminals, secretConfigured } = await listTerminals();
    return { secretConfigured, terminals: terminals.map((t) => ({ ...t, listener: getListenerStatus(t.code) })) };
});

controller.createTerminal = thenRefresh((req) => createTerminal(req.body, req.session?.userId));

controller.importEnvTerminal = thenRefresh((req) => importEnvTerminal(req.session?.userId));

controller.updateTerminal = thenRefresh((req) => updateTerminal(req.params.id, req.body, req.session?.userId));

controller.deleteTerminal = thenRefresh((req) => deleteTerminal(req.params.id));

// Por id (guarda el resultado) o, para el principal del .env, por su código.
controller.checkTerminal = respond((req) => checkTerminal(req.params.ref));

controller.testTerminal = respond((req) => testTerminal(req.body));



// ─── Datos de cada terminal y sincronización (Client365) ─────────────────
// Leer un terminal tarda (huella por huella): estas rutas responden al instante
// con cuánto va, y Client365 vuelve a preguntar. Ver biometricSync.service.js.

// «principal,oficina-2» o ['principal', 'oficina-2']; vacío = todos los activos.
const codesOf = (value) => (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((code) => String(code).trim().toLowerCase())
    .filter(Boolean);
const wantsRefresh = (req) => ['1', 'true'].includes(String(req.query?.refresh ?? ''));

controller.getTerminalPeople = respond((req) => getTerminalPeople(req.params.code, { refresh: wantsRefresh(req) }));

controller.getSyncPlan = respond((req) => getSyncPlan(codesOf(req.query?.codes), { refresh: wantsRefresh(req) }));

controller.startSync = respond((req) => startSync({ codes: codesOf(req.body?.codes), adminId: req.session?.userId ?? null }));

controller.getSyncJob = respond(() => ({ job: getSyncJob() }));



// ─── Entrar a la configuración del kiosco con la huella ──────────────────
// Reglas y razones en biometricAccess.lib.js.

// Autorizar esta tablet. Solo un administrador que entró con correo y
// contraseña (la ruta va con validateAdminUser): con huella no se autorizan tablets.
controller.enableKioskAccess = onTerminal((req, terminal) => createKioskAccess({
    terminal: terminal.code,
    label: req.body?.label,
    adminId: req.session?.userId,
    adminName: req.session?.name,
}));

// Quitar el permiso: alcanza con tener la llave de esa tablet.
controller.disableKioskAccess = respond((req) => removeKioskAccess(req.body?.token));

// Pedir el acceso: la tablet manda su llave; la escucha de ese terminal esperará la huella.
controller.startFingerprintLogin = onTerminal((req, terminal) => startFingerprintLogin({
    token: req.body?.token,
    terminal: terminal.code,
    listener: getListenerStatus(terminal.code),
}));

controller.cancelFingerprintLogin = respond((req) => cancelChallenge(req.body?.challengeId));

// ¿Ya puso el dedo? 202 mientras espera; 200 y la sesión con huella si era un
// administrador; 401 si no, o si venció.
controller.completeFingerprintLogin = (req, res) => {
    const outcome = challengeOutcome(req.body?.challengeId);
    if (outcome.status === 'waiting') return res.status(202).json({ status: 'waiting', secondsLeft: outcome.secondsLeft });
    if (outcome.status !== 'approved') return res.status(401).json({ status: 401, error: outcome.status, message: outcome.message });

    const access = sessionAccess({ user: outcome.user, terminal: outcome.terminal, now: new Date() });
    // Sesión nueva, con otro identificador: la que tenía la tablet no se reutiliza.
    return req.session.regenerate((error) => {
        if (error) {
            console.log('[biometric] no se pudo abrir la sesión con huella:', error);
            return res.status(500).json({ status: 500, error: 'Internal Server Error', message: 'No se pudo abrir la sesión.' });
        }
        req.session.biometricAccess = access;
        return req.session.save((saveError) => {
            if (saveError) {
                console.log('[biometric] no se pudo guardar la sesión con huella:', saveError);
                return res.status(500).json({ status: 500, error: 'Internal Server Error', message: 'No se pudo abrir la sesión.' });
            }
            console.log(`[biometric] ${access.name} ${access.surName} entró con su huella a la configuración del terminal «${access.terminal}»`);
            return res.status(200).json(loggedInUser(access));
        });
    });
};



export default controller;
