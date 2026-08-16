import menu from './menu.js';
import MenuModel from './menu.model.js';
import { MENU_OPERATION, requestMenuChange, notifyMenuApplied } from './menuRequest.lib.js';
import { actorFromSession } from '../notification/notification.service.js';
import menuModel from './menu.model.js';
import colors from 'colors';

const controller = {};


controller.setMenu = async ( req, res ) => {
    try{
        const newMenu =  await menu.setMenu(req.body);
        return res.json(newMenu);
    }
    catch(err){
        console.log(err)
        return res.status(500).send(err);
    }
};




controller.getAllMenu = async (req, res) => {
    try{
        const { compact, alertLive, alertDocument, withAudit } = req.query;
        const query = {};
        if(alertLive !== undefined)  query.useOfLiveAlertForTheCustomer = Boolean(alertLive);
        if(alertDocument !== undefined) query.useOnlyForTheReportingDocument = Boolean(alertDocument);

        // Versión ligera para selects/autocompletes
        if(compact === 'true'){
            const menuAll = await menuModel.find(query).select('_id es');
            return res.json(menuAll);
        }

        // Listado enriquecido para la gestión: creador + últimos 3 editores.
        // Opt-in explícito (withAudit=true) para no inflar otros consumidores
        // como el listado de alertas en vivo de jarvis-express (alertLive=true).
        if(withAudit === 'true'){
            const docs = await menuModel.find(query)
                .select('+updateByUser')
                .populate('createdBy', 'name surName img')
                .populate('updateByUser.user', 'name surName img')
                .lean();

            const result = docs.map(doc => {
                // Últimas 3 ediciones (evento más reciente primero): quién editó
                // (con su foto) y qué campos cambió. Sin exponer los valores.
                const editors = Array.isArray(doc.updateByUser) ? doc.updateByUser : [];
                const lastEditors = [...editors]
                    .filter(e => e && e.user)
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .slice(0, 3)
                    .map(e => ({
                        _id:           e.user._id,
                        name:          e.user.name,
                        surName:       e.user.surName,
                        img:           e.user.img ?? null,
                        date:          e.date,
                        changedFields: Array.isArray(e.change) ? e.change.map(c => c.key) : []
                    }));

                const { updateByUser, ...rest } = doc; // no exponer la auditoría completa
                return { ...rest, lastEditors };
            });
            return res.json(result);
        }

        const menuAll = await menuModel.find(query);
        return res.json(menuAll);
    }
    catch(err){
        console.log(err);
        return res.status(500).json({error: err});
    }
};




controller.getMenuById = async (req, res) => {
    try {
        const id = req.params.id;
        const menuFind = await menu.getMenuById(id);
        return res.json(menuFind);
    } 
    catch(err){
        console.log(err);
        return res.status(500).send(err);
    }
};


controller.getCategory = async (req, res) => {
    try{

        const params = req.params.category;

        const menuCategory = await menu.getCategoryMenu(params);
        return res.json(menuCategory);

    }
    catch(err){
        console.log(err);
        return res.status(500).send(err);
    }
};



controller.putMenu = async (req, res) => {
    try {
        const operacion = MENU_OPERATION.UPDATE;

        // Hace falta el estado ANTERIOR para poder contar qué cambió. Después
        // de guardar ya no hay con qué comparar.
        const antes = req.body?._id
            ? await MenuModel.findById(req.body._id).select('es en').lean()
            : null;

        // El usuario super propone; el administrador aplica. Ver la nota en
        // menu.routes.js sobre por qué el middleware es el mismo para los dos.
        if (req.session.admin !== true) {
            const notificacion = await requestMenuChange({
                menu: antes,
                actor: actorFromSession(req),
                operation: operacion,
                body: req.body,
                requesterId: req.session.userId,
            });
            return res.status(202).json({
                status: 202, applied: false, request: notificacion,
                message: 'El cambio quedó pendiente de aprobación por un administrador.',
            });
        }

        // El autor de la edición sale de la sesión (nunca del body)
        const update = await menu.putMenu(req.body, req.session.userId);

        await notifyMenuApplied({
            menu: update,
            actor: actorFromSession(req),
            operation: operacion,
            body: req.body,
        });

        return res.json(update);
    }
    catch(err){
        console.log(err);
        if (err === 'Sin cambios para guardar') return res.status(400).json({ status: 400, error: 'Bad request', message: err });
        if (err === '404 not found') return res.status(404).json({ status: 404, error: 'Not found', message: 'Menú no encontrado' });
        if (err === '423 locked') return res.status(423).json({ status: 423, error: 'Locked', message: 'Alerta bloqueada por administración: no se puede editar. Un administrador debe desbloquearla primero.' });
        return res.status(500).send(err);
    }
};



controller.deleteByIdMenu = async (req, res) => {
    try{

        const id = req.params.id;

        // Se lee ANTES de borrar: después no queda nombre que poner en el aviso,
        // y "se eliminó una alerta" sin decir cuál no sirve de nada.
        const antes = await MenuModel.findById(id).select('es en').lean();
        if (!antes) return res.status(404).json({ status: 404, error: 'Not found', message: 'Menú no encontrado' });

        if (req.session.admin !== true) {
            const notificacion = await requestMenuChange({
                menu: antes,
                actor: actorFromSession(req),
                operation: MENU_OPERATION.DELETE,
                body: {},
                requesterId: req.session.userId,
            });
            return res.status(202).json({
                status: 202, applied: false, request: notificacion,
                message: 'La eliminación quedó pendiente de aprobación por un administrador.',
            });
        }

        const resultMenu = await menu.getDeleteMenu(id)

        if(resultMenu.deletedCount > 0) {
            await notifyMenuApplied({
                menu: antes,
                actor: actorFromSession(req),
                operation: MENU_OPERATION.DELETE,
            });
            return res.status(200).json(resultMenu);
        }
        else{
            return res.status(500);
        }
    }
    catch(err){
        console.log(err);
        if (err === '404 not found') return res.status(404).json({ status: 404, error: 'Not found', message: 'Menú no encontrado' });
        if (err === '423 locked') return res.status(423).json({ status: 423, error: 'Locked', message: 'Alerta bloqueada por administración: no se puede eliminar. Un administrador debe desbloquearla primero.' });
        return res.status(500).send(err);
    }
};



export default controller;