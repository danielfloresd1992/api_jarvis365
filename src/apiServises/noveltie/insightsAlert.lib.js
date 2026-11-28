import MenuModel from '../menu/menu.model.js';
import LocalModel from '../local/local.model.js';
import UserModel from '../user/user.model.js';
import { canSeeLocal } from '../access/access.lib.js';
import { notify } from '../notification/index.js';

// ══════════════════════════════════════════════════════════════════════
// LAS ALERTAS QUE SE AVISAN A LOS CLIENTES (insights365)
// ══════════════════════════════════════════════════════════════════════
// Una alerta llega al cliente cuando queda VALIDADA (validationResult.isApproved)
// y ENVIADA AL GRUPO (sharedByAmazonActive, o givenToTheGroup en las de antes):
// el mismo criterio del muro de insights365 (noveltyWall.lib.ts) y del corte de
// silencio. En ese paso, y solo la primera vez, si es de una de las categorías
// de INSIGHTS_ALERT_CATEGORIES, se avisa (notify 'novelty.alert', ver
// notification/strategies/alert.strategies.js) a quien la ve en insights365.
//
// QUIÉN: los clientes con locales asignados (user.access 'only') que ven ese
// local, por el local suelto o por su franquicia (access.lib.js, canSeeLocal).
// El equipo de Jarvis365 (acceso 'all') no recibe estos avisos: ya ve el muro
// entero, y avisarle de cada alerta de cada local sería ruido.
//
// Nunca lanza: lo llama el PUT de la novedad, que ya guardó.

// INSIGHTS_ALERT_CATEGORIES = «las categorías del catálogo (Menu.category) que se avisan»: demoras e incidencias
export const INSIGHTS_ALERT_CATEGORIES = ['delay', 'incident'];

// counted = «la alerta está validada y enviada al grupo»
const counted = (novelty) => Boolean(novelty?.validationResult?.isApproved)
    && Boolean(novelty?.sharedByAmazonActive || novelty?.givenToTheGroup);

// idOf = «el _id, poblado o no, como texto»
const idOf = (value) => (value ? String(value._id ?? value) : '');

/**
 * Los clientes que ven ese local en insights365 (ids como texto).
 * Una sola consulta: los de acceso 'only' que lo tienen suelto o por su franquicia.
 */
export async function insightsRecipients(local) {
    if (!local?._id) return [];
    const franchise = idOf(local.franchiseReference?.franchise);
    const users = await UserModel.find({
        'access.mode': 'only',
        $or: [
            { 'access.locals': local._id },
            ...(franchise ? [{ 'access.franchises': franchise }] : []),
        ],
    }).select('_id access').lean();
    return users.filter(user => canSeeLocal(user.access, local)).map(user => String(user._id));
}

/**
 * Si con este cambio la alerta pasó a contar para el cliente y es de demora o
 * de incidencia, se la avisa a quien ve su local.
 *
 * @param {object} before  la novedad antes del PUT
 * @param {object} after   la novedad guardada (con `establishment` poblado o no)
 */
export async function notifyInsightsAlert(before, after) {
    try {
        if (counted(before) || !counted(after)) return;

        const menu = after.menuRef
            ? await MenuModel.findById(idOf(after.menuRef)).select('category es').lean()
            : null;
        const category = menu?.category;
        if (!INSIGHTS_ALERT_CATEGORIES.includes(category)) return;

        const localId = idOf(after.establishment) || idOf(after.local?.idLocal);
        if (!localId) return;
        const local = await LocalModel.findById(localId).select('name image franchiseReference').lean();
        if (!local) return;

        const recipients = await insightsRecipients(local);
        if (recipients.length === 0) return;

        const title = String(after.title || menu?.es || '').trim();
        await notify({
            type: 'novelty.alert',
            // Lo firma el sistema: el cliente no tiene por qué saber qué operador la validó
            actor: { resolved: true, name: 'Jarvis365', surName: '' },
            resource: { kind: 'novelty', id: after._id, name: title, path: '/en-vivo', img: local.image || null },
            extra: { recipients, category, place: local.name, table: after.table ?? null },
            // Lo que pinta la campana de insights365 sin volver a pedir la alerta: la mesa (para buscarla en el
            // croquis), la foto principal y la descripción (el texto que se mandó al grupo, `menu`)
            meta: {
                noveltyId: String(after._id),
                establishment: String(local._id),
                place: local.name,
                category,
                title,
                table: after.table ?? null,
                image: after.imageToShare || null,
                description: String(after.menu ?? '').trim() || null,
            },
        });
    }
    catch (error) {
        console.log('[insights-alert] no se pudo avisar la alerta:', error?.message || error);
    }
}
