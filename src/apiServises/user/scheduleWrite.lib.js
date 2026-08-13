import mongoose from 'mongoose';
import UserModel from './user.model.js';
import AttendanceModel from './attendance.model.js';
import { io } from '../../services/socket/io.js';
import { notify, adminUserIds } from '../notification/notification.service.js';
import { detalleDelCambio } from './scheduleLabels.lib.js';

const { ObjectId } = mongoose.Types;

// ══════════════════════════════════════════════════════════════════════
// ESCRITURA DE REGLAS DE HORARIO
// ══════════════════════════════════════════════════════════════════════
// Aplica un lote de cambios de horario sobre AttendanceModel.scheduleOverride.
//
// Vivía dentro del endpoint POST /user/schedule/dynamic/group. Se extrajo
// porque ahora hay DOS caminos que escriben exactamente lo mismo:
//   · el administrador que cambia el horario directo
//   · el administrador que APRUEBA la solicitud de un usuario super
//
// Con el código duplicado, el día que cambie una regla —una validación nueva,
// otro campo en la auditoría— se corregiría en un camino y no en el otro, y la
// diferencia solo aparecería en producción.
//
// NO toca checkIn ni checkOut: solo la regla especial del día.

/** Tipos de jornada que no llevan horario de entrada ni salida. */
const NO_TIME_TYPES = ['descanso', 'permiso', 'vacaciones', 'falta'];

/**
 * Valida un item del lote. Devuelve el mensaje de error, o null si está bien.
 * Se usa antes de aplicar Y antes de registrar una solicitud: no tiene sentido
 * dejar pendiente de aprobación algo que va a fallar al aplicarse.
 */
export function validateScheduleItem(item) {
    if (!item?.userId && !item?.dni) return 'Se requiere userId o dni.';
    if (!item?.date) return 'Se requiere fecha (date).';
    if (!item?.workType) return 'Se requiere tipo de jornada (workType).';
    if (item.workType === 'permiso' && !(typeof item.note === 'string' && item.note.trim())) {
        return 'El permiso requiere un comentario obligatorio.';
    }
    return null;
}


/**
 * Aplica el lote de cambios.
 *
 * @param {Array}  updates       [{ userId|dni, date, workType, shift?, startTime?, endTime?, note? }]
 * @param {string} authorUserId  quién queda registrado como autor del cambio
 * @returns {Promise<{ results: Array, errors: Array }>}
 */
export async function applyScheduleUpdates(updates = [], authorUserId) {
    const results = [];
    const errors = [];

    for (const item of updates) {
        try {
            const invalido = validateScheduleItem(item);
            if (invalido) {
                errors.push({ item, error: invalido });
                continue;
            }

            // Resolver userId desde dni si hace falta
            let userId = item.userId;
            if (!userId && item.dni) {
                const userDoc = await UserModel.findOne({ dni: item.dni });
                if (!userDoc) {
                    errors.push({ item, error: `Usuario con DNI ${item.dni} no encontrado.` });
                    continue;
                }
                userId = userDoc._id;
            }

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

            const isNoTimeType = NO_TIME_TYPES.includes(item.workType);

            const scheduleOverride = {
                workType: item.workType,
                shift: item.shift || null,
                startTime: isNoTimeType ? null : (item.startTime || null),
                endTime: isNoTimeType ? null : (item.endTime || null),
                note: [
                    ...previousNotes,
                    { user: authorUserId, message: item.note || 'Cambio de horario', date: new Date() }
                ]
            };

            // Auditoría: createdBy solo al insertar; editedBy con lo que cambió.
            const prevOverride = previousRecord?.scheduleOverride || {};
            const changedFields = ['workType', 'shift', 'startTime', 'endTime']
                .filter(field => (prevOverride?.[field] ?? null) !== (scheduleOverride[field] ?? null))
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
                $setOnInsert: { createdBy: authorUserId }
            };
            if (previousRecord && changedFields.length > 0) {
                updateOp.$push = {
                    editedBy: { user: authorUserId, change: changedFields, date: new Date() }
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

            // Refresco en vivo de la celda, mismo canal de siempre
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

    return { results, errors };
}


/**
 * Avisa a CADA empleado que su horario cambió.
 *
 * El formulario de "Editar grupo" puede tocar a varios de una vez, así que se
 * agrupa por persona y cada quien recibe una notificación con SUS fechas. Una
 * sola notificación con todos los nombres obligaría a cada empleado a buscarse
 * en una lista para saber si le toca.
 *
 * La notificación es PERSONAL y no global: un cambio de horario le importa a
 * quien lo trabaja, y hacerlo global sería mandarle a setenta y seis personas
 * un aviso que no es suyo cada vez que se edita una celda.
 *
 * QUIÉN APARECE EN EL AVISO
 *
 * Un cambio puede llegar por dos caminos, y no son lo mismo:
 *   · el administrador lo aplica directo   → él lo decidió y él lo hizo
 *   · alguien lo solicitó y se aprobó      → intervinieron DOS personas
 *
 * En el segundo caso el `actor` es quien aprueba, así que sin el solicitante el
 * empleado leía "Kervis modificó tu horario" cuando Kervis solo autorizó lo que
 * pidió otro. Por eso `requester` viaja aparte y el texto nombra a los dos.
 *
 * @param {Array}  results     documentos de asistencia ya escritos
 * @param {object} actor       quién hizo el cambio (actorFromSession)
 * @param {object} [requester] quién lo solicitó, si vino de una solicitud
 */
export async function notifyScheduleApplied(results = [], actor, requester = null) {
    if (results.length === 0) return;

    // Solo se nombra al solicitante si es OTRA persona: "a pedido de Kervis"
    // firmado por Kervis sería ruido.
    const requesterName = (requester && String(requester.user ?? requester._id ?? '') !== String(actor?.user ?? actor?._id ?? ''))
        ? `${requester.name || ''} ${requester.surName || ''}`.trim()
        : '';

    // Cambios por empleado, con QUÉ se le puso cada día.
    //
    // Antes solo se guardaba la fecha, así que el aviso decía "modificó tu
    // horario el 12/08" y para saber si te habían puesto falta, libre o
    // vacaciones había que abrir la grilla e ir a mirar la celda.
    const porUsuario = new Map();
    for (const record of results) {
        const key = String(record.userId);
        if (!porUsuario.has(key)) porUsuario.set(key, []);
        porUsuario.get(key).push(detalleDelCambio(record));
    }

    // Los nombres en UNA consulta, no una por empleado
    const users = await UserModel.find({ _id: { $in: [...porUsuario.keys()] } })
        .select('name surName img')
        .lean();
    const porId = new Map(users.map(u => [String(u._id), u]));

    // Los administradores, MENOS quien hizo el cambio: contarle lo que acaba de
    // hacer es ruido. Se consulta una sola vez para todo el lote, no por
    // empleado.
    const adminIds = await adminUserIds(actor?.user ?? actor?._id ?? null);

    for (const [userId, cambios] of porUsuario) {
        const user = porId.get(userId);
        if (!user) continue;

        const target = {
            user: user._id,
            name: user.name || '',
            surName: user.surName || '',
            img: user.img || null,
        };
        const resource = {
            kind: 'schedule',
            id: user._id,
            name: `${user.name || ''} ${user.surName || ''}`.trim(),
            path: `/user?userId=${userId}&date=${new Date(results.find(r => String(r.userId) === userId).date).toISOString().slice(0, 10)}`,
            img: user.img || null,
        };
        // Una fecha puede aparecer dos veces si el lote la tocó dos veces:
        // manda la ÚLTIMA escritura, que es la que quedó en la celda.
        const porDia = new Map();
        cambios.forEach(c => porDia.set(c.dayKey, c));
        const cambiosUnicos = [...porDia.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
        const fechasUnicas = cambiosUnicos.map(c => c.fecha);

        // Al empleado: "tu horario cambió".
        await notify({
            type: 'schedule.changed',
            actor,
            target,
            resource,
            extra: { fechas: fechasUnicas, targetUserId: userId, requesterName, cambios: cambiosUnicos },
            // `meta` lleva el desglose que pinta la vista: cada día con lo que
            // se le puso, para poder resaltarlo sin volver a consultar nada.
            meta: { cambios: cambiosUnicos },
        });

        // A los demás administradores: "X modificó el horario de Y". Son dos
        // documentos porque el texto se guarda ya renderizado y cada audiencia
        // necesita leer una frase distinta.
        //
        // El empleado se saca de la lista por si además es administrador: ya
        // recibió el suyo y no necesita el mismo hecho contado dos veces.
        const paraAdmins = adminIds.filter(id => id !== userId);
        if (paraAdmins.length > 0) {
            await notify({
                type: 'schedule.changedAdmin',
                actor,
                target,
                resource,
                extra: { fechas: fechasUnicas, targetUserId: userId, adminIds: paraAdmins, requesterName, cambios: cambiosUnicos },
                meta: { cambios: cambiosUnicos },
            });
        }
    }
}


// `otherAdminIds` vivía acá; se movió a notification.service.js como
// `adminUserIds` cuando el retiro de solicitudes necesitó lo mismo. Tener dos
// copias significaba que un cambio en el criterio de "quién es administrador"
// se aplicaría en un sitio y no en el otro.


// `resolveTargetUser` vivía acá y devolvía SOLO el primer empleado del lote, con
// lo que una solicitud que tocaba a cinco personas se registraba como si fuera
// de una. Lo reemplazó `resolveTargets` en scheduleRequest.lib.js, que los
// resuelve todos.
