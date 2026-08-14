import MenuModel from './menu.model.js';
import menuLayer from './menu.js';
import { notify } from '../notification/notification.service.js';
import { diffBonusSystems, normalizeBonusSystem } from '../../libs/bonus/index.js';

// ══════════════════════════════════════════════════════════════════════
// CAMBIOS SOBRE UNA ALERTA: APLICAR O SOLICITAR
// ══════════════════════════════════════════════════════════════════════
// Las rutas de `menu` tienen dos caminos según quién pide el cambio:
//
//   administrador  se aplica y DESPUÉS se avisa, con alcance global
//   usuario super  se guarda una SOLICITUD y se avisa a los administradores;
//                  el cambio no ocurre hasta que uno apruebe
//
// Los dos caminos viven acá para que la ruta no tenga que repetir la lógica ni
// decidir el tipo de notificación en cada endpoint. Y sobre todo, para que
// aprobar una solicitud escriba EXACTAMENTE lo mismo que habría escrito el
// camino directo: al aprobar se llama a la misma función, no a una copia.
//
//
// POR QUÉ LA BONIFICACIÓN VIAJA APARTE
//
// Un cambio de nombre y un cambio de lo que cobra la gente no se leen igual.
// Se separan en dos operaciones y dos familias visuales —`menu` y `bonus`—
// desde el momento en que se solicitan, no al mostrarlas.

/** Operaciones que se pueden pedir sobre una alerta. */
export const MENU_OPERATION = {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    BONUS: 'bonus',
};

/** La bonificación tiene su propia familia, su propio tipo y su propio estilo. */
const esOperacionDeBono = (operation) => operation === MENU_OPERATION.BONUS;

const tipoAplicado = (operation) => ({
    [MENU_OPERATION.CREATE]: 'menu.created',
    [MENU_OPERATION.UPDATE]: 'menu.updated',
    [MENU_OPERATION.DELETE]: 'menu.deleted',
    [MENU_OPERATION.BONUS]: 'bonus.updated',
}[operation] || 'menu.updated');


/** El recurso como lo lee la notificación: nombre para el texto, ruta para abrirlo. */
const recursoDeAlerta = (menu) => ({
    kind: 'menu',
    id: menu?._id ? String(menu._id) : null,
    name: menu?.es || menu?.en || '',
    path: '/alertmanasgement',
});


/**
 * Qué campos cambian, para el cuerpo del aviso.
 *
 * `bonusSystem` se saca de la lista: sus cambios se cuentan aparte y con sus
 * propias palabras. Dejarlo diría "actualizó: bonusSystem", que no le dice nada
 * a nadie.
 */
const camposCambiados = (body = {}) => Object.keys(body)
    .filter(k => !['_id', 'bonusSystem', '__v', 'updateByUser'].includes(k))
    .map(field => ({ field }));


/**
 * Avisa de un cambio YA APLICADO por un administrador. Alcance global.
 *
 * @param {object} opciones.menu       la alerta después del cambio
 * @param {object} opciones.actor      quién lo hizo (de la sesión)
 * @param {string} opciones.operation  create | update | delete | bonus
 * @param {object} opciones.body       lo que se guardó (para listar campos)
 * @param {object} opciones.bonusBefore  bonificación anterior, solo si operation es 'bonus'
 */
export const notifyMenuApplied = ({ menu, actor, operation, body = {}, bonusBefore = null }) => {
    const extra = {};

    if (esOperacionDeBono(operation)) {
        // Los cambios ya redactados salen de libs/bonus, el mismo texto que ve
        // la lista de alertas y el PDF. Un aviso que describa el cambio de otra
        // forma que el informe obliga a decidir cuál de los dos miente.
        extra.bonusChanges = diffBonusSystems(bonusBefore, menu?.bonusSystem);
    }

    return notify({
        type: tipoAplicado(operation),
        actor,
        resource: recursoDeAlerta(menu),
        changes: esOperacionDeBono(operation) ? [] : camposCambiados(body),
        extra,
        // Los cambios van TAMBIÉN en `meta` y no solo en `extra`: `extra` vive
        // durante el renderizado del texto y se descarta, mientras que `meta`
        // se guarda. Sin esto, la campana podría escribir el título pero no
        // pintar el desglose al abrir la notificación.
        meta: {
            menuId: menu?._id ? String(menu._id) : null,
            operation,
            ...(extra.bonusChanges ? { bonusChanges: extra.bonusChanges } : {}),
        },
    });
};


/**
 * Guarda una SOLICITUD y avisa a los administradores. No toca la alerta.
 *
 * El cuerpo completo va en `request.payload`: al aprobar no hay que
 * reconstruirlo, y así lo que se aplica es exactamente lo que se pidió, aunque
 * pasen días entre una cosa y la otra.
 */
export const requestMenuChange = ({ menu, actor, operation, body = {}, requesterId }) => {
    const extra = { operation, requesterId: requesterId ? String(requesterId) : null };

    if (esOperacionDeBono(operation)) {
        extra.bonusChanges = diffBonusSystems(
            menu?.bonusSystem,
            normalizeBonusSystem(body.bonusSystem),
        );
    }

    return notify({
        type: esOperacionDeBono(operation) ? 'bonus.requested' : 'menu.requested',
        actor,
        resource: recursoDeAlerta(menu),
        extra,
        meta: {
            menuId: menu?._id ? String(menu._id) : null,
            operation,
            ...(extra.bonusChanges ? { bonusChanges: extra.bonusChanges } : {}),
            // La bonificación ANTERIOR viaja con la solicitud: al aprobarla,
            // días después, es la única forma de contar qué cambió respecto de
            // lo que había cuando se pidió.
            ...(menu?.bonusSystem ? { bonusBefore: menu.bonusSystem } : {}),
        },
        request: {
            status: 'pending',
            payload: {
                operation,
                menuId: menu?._id ? String(menu._id) : null,
                body,
            },
        },
    });
};


/**
 * Aplica una solicitud aprobada.
 *
 * Llama a las MISMAS funciones que el camino directo. Si acá hubiera una copia
 * de la lógica de guardado, aprobar y guardar a mano podrían divergir sin que
 * nadie lo note hasta que los datos no cuadren.
 *
 * El autor del cambio es QUIEN APRUEBA: es su firma la que lo autoriza, y así
 * queda en la auditoría del documento.
 *
 * @returns {Promise<{ok: boolean, menu?: object, message?: string}>}
 */
export const applyMenuRequest = async (payload, approverUserId) => {
    const { operation, menuId, body } = payload || {};

    if (!operation) return { ok: false, message: 'La solicitud no dice qué operación aplicar.' };

    try {
        if (operation === MENU_OPERATION.CREATE) {
            const creado = await menuLayer.setMenu({ ...body, createdBy: approverUserId });
            return { ok: true, menu: creado };
        }

        if (!menuId) return { ok: false, message: 'La solicitud no indica sobre qué alerta aplica.' };

        if (operation === MENU_OPERATION.DELETE) {
            const antes = await MenuModel.findById(menuId);
            if (!antes) return { ok: false, message: 'La alerta ya no existe.' };
            await menuLayer.getDeleteMenu(menuId);
            return { ok: true, menu: antes };
        }

        // update y bonus se guardan igual: los dos son una edición parcial. Lo
        // que los distingue es QUÉ campos traen y con qué familia se avisa.
        const actualizado = await menuLayer.putMenu({ ...body, _id: menuId }, approverUserId);
        return { ok: true, menu: actualizado };
    }
    catch (error) {
        // El guardado rechaza con cadenas ('423 locked', '404 not found') o con
        // un error de mongoose. Las dos formas terminan acá.
        const texto = typeof error === 'string' ? error : error?.message || 'Error al aplicar';
        if (texto.includes('423')) return { ok: false, message: 'La alerta está bloqueada por administración.' };
        if (texto.includes('404')) return { ok: false, message: 'La alerta ya no existe.' };
        return { ok: false, message: texto };
    }
};


/** ¿Esta notificación es una solicitud sobre una alerta? */
export const isMenuRequest = (notification) =>
    ['menu', 'bonus'].includes(notification?.family)
    && Boolean(notification?.request?.payload?.operation);
