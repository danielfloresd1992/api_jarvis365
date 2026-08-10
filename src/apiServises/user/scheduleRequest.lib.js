import mongoose from 'mongoose';
import UserModel from './user.model.js';
import AttendanceModel from './attendance.model.js';
import NotificationModel from '../notification/notification.model.js';
import { io } from '../../services/socket/io.js';
import { ADMIN_ROOM, userRoom } from '../notification/notification.service.js';

const { ObjectId } = mongoose.Types;

// ══════════════════════════════════════════════════════════════════════
// SOLICITUDES DE CAMBIO DE HORARIO — piezas compartidas
// ══════════════════════════════════════════════════════════════════════
// Un usuario `super` no escribe el horario: deja una SOLICITUD que un
// administrador aprueba o rechaza. Entre que se pide y que se decide puede
// pasar cualquier cosa, y de eso se ocupa este archivo.
//
// LA CELDA COMO UNIDAD
//
// Todo se indexa por CELDA — un empleado en una fecha— con una clave plana
// `userId|YYYY-MM-DD`. Es lo que permite las tres cosas que antes no se podían:
//
//   · saber si ya hay una solicitud pendiente sobre esa misma celda
//   · pintar el pendiente en la grilla sin una consulta por celda (una grilla de
//     76 personas por 31 días serían más de dos mil peticiones)
//   · detectar que el horario cambió DESPUÉS de pedirse el cambio
//
// La clave vive en `meta.slots` de la notificación. Va en `meta` y no en un
// campo propio del modelo porque es dato de esta familia y solo lo lee quien
// sabe qué es una celda de horario.

/** Fecha del día en UTC, que es como se guarda `date` en asistencia. */
export const dayStart = (fecha) => {
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

/** Clave plana de una celda: "6489…f2|2026-08-12". */
export const slotKey = (userId, fecha) => {
    const d = dayStart(fecha);
    return d ? `${String(userId)}|${d.toISOString().slice(0, 10)}` : null;
};

/** Descompone la clave. Devuelve null si no tiene la forma esperada. */
export const parseSlot = (slot) => {
    const [userId, date] = String(slot || '').split('|');
    return (userId && date) ? { userId, date } : null;
};


/**
 * Normaliza el lote: resuelve los `dni` a `userId` y las fechas a día UTC.
 *
 * El lote puede venir con `userId` o con `dni` — el formulario de la grilla usa
 * uno y las cargas por cédula el otro. Todo lo de acá abajo trabaja con
 * userId, así que se unifica una sola vez y con UNA consulta, no una por item.
 *
 * @returns {Promise<{ items: Array, targetIds: string[], slots: string[] }>}
 */
export async function normalizeUpdates(updates = []) {
    const dnis = [...new Set(updates.filter(u => !u.userId && u.dni).map(u => u.dni))];

    const porDni = new Map();
    if (dnis.length > 0) {
        const users = await UserModel.find({ dni: { $in: dnis } }).select('_id dni').lean();
        users.forEach(u => porDni.set(String(u.dni), String(u._id)));
    }

    const items = [];
    for (const u of updates) {
        const userId = u.userId ? String(u.userId) : porDni.get(String(u.dni)) || null;
        const date = dayStart(u.date);
        // Un item sin usuario o sin fecha válida no forma celda. No se descarta
        // el lote entero: validateScheduleItem ya lo habrá rechazado antes.
        if (!userId || !date) continue;
        items.push({ ...u, userId, date, slot: slotKey(userId, date) });
    }

    return {
        items,
        targetIds: [...new Set(items.map(i => i.userId))],
        slots: [...new Set(items.map(i => i.slot))],
    };
}


/**
 * Datos de los empleados afectados, para dejarlos referenciados en la solicitud.
 *
 * Antes se guardaba solo el PRIMERO del lote: un administrador veía "cambio para
 * Ana" y al aprobar cambiaba el horario de cinco personas. La solicitud tiene
 * que decir a quiénes toca, no a quién tocaba primero.
 */
export async function resolveTargets(targetIds = []) {
    if (targetIds.length === 0) return [];
    const ids = targetIds.filter(id => ObjectId.isValid(id));
    if (ids.length === 0) return [];

    const users = await UserModel.find({ _id: { $in: ids } })
        .select('name surName img')
        .lean();

    return users.map(u => ({
        user: String(u._id),
        name: u.name || '',
        surName: u.surName || '',
        img: u.img || null,
    }));
}


/**
 * Foto del horario ANTES de solicitar el cambio, celda por celda.
 *
 * Sirve para detectar al aprobar que alguien más tocó esa celda mientras la
 * solicitud esperaba. Sin esto, aprobar una solicitud vieja pisa en silencio el
 * trabajo de otro administrador.
 *
 * Una sola consulta con `$or` para todo el lote.
 */
export async function snapshotSlots(items = []) {
    if (items.length === 0) return {};

    const registros = await AttendanceModel.find({
        $or: items.map(i => ({ userId: i.userId, date: i.date })),
    })
        .select('userId date scheduleOverride')
        .lean();

    const antes = {};
    // Las celdas sin documento quedan explícitamente en null: "no había nada"
    // es un estado, y hay que poder distinguirlo de "no se miró".
    items.forEach(i => { antes[i.slot] = null; });

    registros.forEach(r => {
        const key = slotKey(r.userId, r.date);
        if (!key) return;
        const o = r.scheduleOverride || {};
        antes[key] = {
            workType: o.workType ?? null,
            shift: o.shift ?? null,
            startTime: o.startTime ?? null,
            endTime: o.endTime ?? null,
        };
    });

    return antes;
}


/** ¿Cambió la celda respecto de la foto? Compara solo lo que define la jornada. */
const distinto = (a, b) => {
    const campos = ['workType', 'shift', 'startTime', 'endTime'];
    if (!a && !b) return false;
    if (!a || !b) return true;
    return campos.some(c => (a[c] ?? null) !== (b[c] ?? null));
};


/**
 * Celdas que cambiaron desde que se pidió el cambio.
 *
 * @returns {Promise<Array<{ slot, antes, ahora }>>} vacío si nada se movió
 */
export async function staleSlots(meta = {}) {
    const antes = meta?.before || {};
    const slots = Object.keys(antes);
    if (slots.length === 0) return [];

    const pares = slots.map(parseSlot).filter(Boolean)
        .filter(p => ObjectId.isValid(p.userId));
    if (pares.length === 0) return [];

    const registros = await AttendanceModel.find({
        $or: pares.map(p => ({ userId: p.userId, date: new Date(`${p.date}T00:00:00.000Z`) })),
    })
        .select('userId date scheduleOverride')
        .lean();

    const ahoraPorSlot = {};
    slots.forEach(s => { ahoraPorSlot[s] = null; });
    registros.forEach(r => {
        const key = slotKey(r.userId, r.date);
        if (!key || !(key in ahoraPorSlot)) return;
        const o = r.scheduleOverride || {};
        ahoraPorSlot[key] = {
            workType: o.workType ?? null,
            shift: o.shift ?? null,
            startTime: o.startTime ?? null,
            endTime: o.endTime ?? null,
        };
    });

    return slots
        .filter(s => distinto(antes[s], ahoraPorSlot[s]))
        .map(s => ({ slot: s, antes: antes[s], ahora: ahoraPorSlot[s] }));
}


/**
 * Solicitudes PENDIENTES que tocan alguna de estas celdas.
 *
 * @param {string[]} slots
 * @param {string}   [excludeId] notificación a excluir (la propia, al revisarse)
 */
export async function pendingForSlots(slots = [], excludeId = null) {
    if (slots.length === 0) return [];

    const query = {
        type: 'schedule.changeRequested',
        'request.status': 'pending',
        'meta.slots': { $in: slots },
    };
    if (excludeId && ObjectId.isValid(excludeId)) query._id = { $ne: excludeId };

    return NotificationModel.find(query)
        .select('_id actor target meta request createdAt')
        .lean();
}


// ══════════════════════════════════════════════════════════════════════
// AVISO EN VIVO PARA LA GRILLA
// ══════════════════════════════════════════════════════════════════════
// La campana ya recibe la notificación por su canal. Esto es OTRA cosa: que la
// CELDA del horario se pinte sola, sin recargar, cuando alguien pide, aprueba,
// rechaza o retira un cambio.
//
// Es un evento aparte y no la notificación misma porque la grilla no necesita
// el texto ni el estado de lectura: necesita saber qué celdas tocar. Mandarle la
// notificación entera la obligaría a interpretarla.

export const SCHEDULE_REQUEST_EVENT = 'schedule:request';

/**
 * Emite el movimiento de una solicitud a quienes miran la grilla.
 *
 * Va a los administradores —son quienes deciden— y a quien la solicitó, que
 * tiene que ver cómo termina lo que pidió. No es global: el horario de la
 * plantilla no le concierne a toda la plantilla.
 *
 * @param {'created'|'approved'|'rejected'|'withdrawn'} action
 * @param {object} payload  { notificationId, slots, requestedBy, ... }
 */
export function emitScheduleRequest(action, payload = {}) {
    try {
        const evento = { action, ...payload };

        io.emitToRoom(ADMIN_ROOM, SCHEDULE_REQUEST_EVENT, evento);

        const solicitante = payload?.requestedBy?.user || payload?.requestedBy;
        if (solicitante) io.emitToRoom(userRoom(solicitante), SCHEDULE_REQUEST_EVENT, evento);
    }
    catch (error) {
        // La solicitud ya quedó registrada; el refresco en vivo es accesorio.
        console.log('[horario] no se pudo emitir el movimiento:', error?.message || error);
    }
}
