import controller from './menu.controller.js';
import categoryController from './menuCategory.controller.js';
import express from 'express';
import menuSchema from './menu.schema.js'
import MenuModel from './menu.model.js';
import { extendSession, validateSession, validateSessionAndUserSuper, validateSuperUser, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import nameApi from '../../libs/name_api.js';
import { MENU_OPERATION, requestMenuChange, notifyMenuApplied } from './menuRequest.lib.js';
import { actorFromSession } from '../notification/notification.service.js';
const routerMenu = express.Router();



// ── Catálogo de categorías ────────────────────────────────────────────
// Van PRIMERO, antes de las rutas con parámetro. Hoy no hay ambigüedad
// —'/menu/categories' no encaja en '/menu/category=:category' ni en
// '/menu/id=:id'—, pero Express resuelve por orden de registro y la primera
// que encaje se queda con la petición: si mañana alguien agrega
// '/menu/:algo', estas seguirían funcionando por estar arriba.
//
// La lista la puede ver cualquier sesión (se necesita para elegir categoría al
// crear una alerta); crear, editar y borrar es solo de super usuario.

routerMenu.get(`${nameApi}/menu/categories`, extendSession, validateSession, categoryController.getCategories);

routerMenu.post(`${nameApi}/menu/categories`, extendSession, validateSuperUser, categoryController.createCategory);

routerMenu.put(`${nameApi}/menu/categories/id=:id`, extendSession, validateSuperUser, categoryController.updateCategory);

routerMenu.delete(`${nameApi}/menu/categories/id=:id`, extendSession, validateSuperUser, categoryController.deleteCategory);



routerMenu.get(`${nameApi}/menu`, extendSession, validateSession, controller.getAllMenu);

routerMenu.get(`${nameApi}/menu/category=:category`, extendSession, validateSession, controller.getCategory);

routerMenu.get(`${nameApi}/menu/id=:id`, extendSession, validateSession, controller.getMenuById);




// ══════════════════════════════════════════════════════════════════════
// CREAR, EDITAR Y ELIMINAR — dos caminos según quién lo pide
// ══════════════════════════════════════════════════════════════════════
// Los dos endpoints siguen aceptando a un usuario `super`, pero lo que hacen
// con su petición es distinto:
//
//   admin === true   se aplica y DESPUÉS se avisa, con alcance global
//   super === true   se guarda una SOLICITUD y se avisa a los administradores;
//                    la alerta no cambia hasta que uno apruebe
//
// El middleware sigue siendo `validateSuperUser` a propósito: un administrador
// también tiene `super`, así que la puerta es la misma y lo que cambia es la
// decisión de adentro. Poner `validateAdminUser` acá dejaría al usuario super
// sin poder ni siquiera proponer.
//
// La respuesta lo dice: `applied: true` es "ya está", `applied: false` es
// "quedó pendiente". Sin ese dato, la pantalla mostraría "guardado" sobre un
// cambio que todavía no ocurrió.

routerMenu.post(`${nameApi}/menu`, extendSession, validateSuperUser, async ( req, res ) => {
    try{
        const body = req.body;
        const menuValiate = await menuSchema.validate(body);

        if (req.session.admin !== true) {
            const notificacion = await requestMenuChange({
                menu: null,
                actor: actorFromSession(req),
                operation: MENU_OPERATION.CREATE,
                body: menuValiate,
                requesterId: req.session.userId,
            });
            return res.status(202).json({
                status: 202, applied: false, request: notificacion,
                message: 'La alerta quedó pendiente de aprobación por un administrador.',
            });
        }

        // El autor sale de la sesión (nunca del body). Docs antiguos sin createdBy.
        const menu = new MenuModel({ ...menuValiate, createdBy: req.session.userId });
        await menu.save();
        await menu.populate('createdBy', 'name surName img');

        await notifyMenuApplied({
            menu,
            actor: actorFromSession(req),
            operation: MENU_OPERATION.CREATE,
            body: menuValiate,
        });

        return res.json(menu);
    }
    catch(error){
        console.log(error.name)
        if(error.name === 'ValidationError') return res.status(400).json({ error: 'Bad reques', status:400, message: error.errors});
        if(error.name === 'MongoServerError') return res.status(400).json({ error: 'Bad reques', status:400, message: error});
        return res.status(500).send(error);
    }
});



routerMenu.put(`${nameApi}/menu/put`, extendSession, validateSuperUser, controller.putMenu);

routerMenu.delete(`${nameApi}/menu/id=:id`, extendSession, validateSessionAndUserSuper,controller.deleteByIdMenu);



// PATCH .../menu/lock/id=:id — bloquear o desbloquear una alerta.
// body: { isLocked: boolean }. SOLO administradores (admin === true).
// Con isLocked en true, el PUT de edición y el DELETE responden 423.
// El cambio queda auditado en updateByUser (quién bloqueó y cuándo).
routerMenu.patch(`${nameApi}/menu/lock/id=:id`, extendSession, validateAdminUser, async (req, res) => {
    try {
        const { id } = req.params;
        const isLocked = req.body?.isLocked === true;

        const doc = await MenuModel.findByIdAndUpdate(
            id,
            {
                $set: { isLocked },
                $push: { updateByUser: { user: req.session.userId, change: [{ key: 'isLocked', value: isLocked }], date: new Date() } }
            },
            { new: true }
        ).select('_id es isLocked');

        if (!doc) return res.status(404).json({ status: 404, error: 'Not found', message: 'Menú no encontrado' });
        return res.status(200).json({ status: 200, _id: doc._id, es: doc.es, isLocked: doc.isLocked });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
    }
});



export { routerMenu };