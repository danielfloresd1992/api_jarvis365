import express from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
const routerUser = express.Router();
import { join, basename } from 'path';
import sharp from 'sharp';
import UserModel from './user.model.js';
import { userUpdateSchema } from './user.schema.js'
import TabuladorModel from '../tabulador/tabulador.model.js';
import addCredentials from '../../middleware/addCredential.js';
import checkLaboralEntry from '../../middleware/checkLaboralEntry.js';
import controller from './user.controller.js';

import nameApi from '../../libs/name_api.js';
import { ObjectId } from 'mongodb';
import { validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { userMultimedia } from '../../util/multer.js'

// La asistencia (marcaje, reportes, roles del día, horas extras, comentarios)
// vive ahora en su propio recurso: ../attendanceUser/
import { applyScheduleUpdates, validateScheduleItem, notifyScheduleApplied } from './scheduleWrite.lib.js';
import {
    normalizeUpdates, resolveTargets, snapshotSlots,
    pendingForSlots, emitScheduleRequest,
} from './scheduleRequest.lib.js';
import { notify, actorFromSession } from '../notification/notification.service.js';









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
        // `phone` viaja porque la nomina lo muestra en su propia columna. Sin el
        // en este select la columna salia vacia para todos: el campo existe en
        // el modelo y esta poblado, pero un `select` acotado lo dejaba fuera y
        // eso no da ningun error, solo un hueco.
        const fields = 'name surName dni email phone img jobInformation inabilited createdOn'
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


// ══════════════════════════════════════════════════════════════════════
// ENDPOINT: El cargo del tabulador de un usuario
// ══════════════════════════════════════════════════════════════════════
// PUT .../user/tabulador/id=:id   body { tabuladorPosition: id | null }
//
// Existe porque el PUT generico de abajo reemplaza `jobInformation` ENTERO:
// hace $set con el objeto que arma yup, asi que cambiar el cargo por esa via
// obligaria al cliente a reenviar departamento y detalle, y si no los manda
// los pisa. Cambiar el cargo es una accion sola en la ficha del empleado y
// merece una ruta que toque solo esa clave.
//
// Por eso el $set va con notacion de punto ('jobInformation.tabuladorPosition')
// y no con { jobInformation: {...} }: Mongo escribe esa clave y deja intactas
// las hermanas, que es justo lo que el PUT generico no puede garantizar.
//
// El id del cargo se comprueba contra la coleccion antes de escribir, como
// hace la asignacion de reglas de bono: un id con forma valida pero que no
// existe, o un cargo dado de baja, dejaria al trabajador apuntando a algo
// que no se paga, y eso saldria de la nomina sin dar ningun error.
//
// Se declara ANTES de /user/:id por la convencion de este archivo: lo
// especifico antes que lo parametrico.
routerUser.put(`${nameApi}/user/tabulador/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });

    const { tabuladorPosition } = req.body ?? {};
    const cargoId = tabuladorPosition == null ? null : tabuladorPosition;

    if (cargoId !== null) {
        if (typeof cargoId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(cargoId)) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'El cargo no es un id valido' });
        }

        const cargo = await TabuladorModel.findById(cargoId).select('active').lean();
        if (!cargo) return res.status(404).json({ status: 404, error: 'Not found', message: 'El cargo no existe' });
        if (cargo.active === false) return res.status(400).json({ status: 400, error: 'Bad request', message: 'El cargo esta inactivo' });
    }

    const user = await UserModel.findByIdAndUpdate(
        id,
        {
            $set: { 'jobInformation.tabuladorPosition': cargoId },
            $push: { updateByUser: { idRef: req.session.userId, change: ['jobInformation.tabuladorPosition'] } },
        },
        { new: true },
    ).select('_id name surName jobInformation').lean();

    if (!user) return res.status(404).json({ status: 404, error: 'Not found', message: 'El usuario no existe' });

    return res.status(200).json({ status: 200, message: 'ok', user });
}));


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
