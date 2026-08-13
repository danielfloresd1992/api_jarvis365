import MenuCategoryModel from './menuCategory.model.js';
import MenuModel from './menu.model.js';
import { Types } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// CATEGORÍAS DE ALERTA — crear, editar, desactivar y borrar
// ══════════════════════════════════════════════════════════════════════
// Ver menuCategory.model.js para el porqué de la forma del documento. Lo que
// hay que tener presente acá es una sola cosa:
//
//   `Menu.category` guarda el `value` de la categoría como CADENA.
//
// De ahí salen las dos reglas que gobiernan este archivo: el `value` no se
// puede cambiar, y una categoría en uso no se puede borrar.

/**
 * Convierte una etiqueta en clave: "Incidencias en el local" → "incidencias-en-el-local".
 *
 * Se quitan los acentos porque la clave viaja en la URL y se compara con lo que
 * ya está guardado; "demoras" y "demorás" tienen que ser la misma cosa.
 *
 * Solo se usa cuando la clave se DERIVA de la etiqueta. Si viene explícita se
 * respeta la mayúscula (ver `limpiarClave`): las categorías que ya existen son
 * camelCase —'localIncident'— y bajarlas a minúsculas las separaría de sus
 * alertas.
 */
const aClave = (texto = '') => texto
    // Las marcas de acento que NFD separa de la letra van por rango
    // (\u0300-\u036f) y con escapes: sueltas en el archivo son
    // invisibles, y cualquier editor puede comerselas sin que se note.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');


/**
 * Sanea una clave escrita a mano conservando la mayúscula: solo se quitan
 * acentos y lo que no sea letra, número, guion o guion bajo.
 */
const limpiarClave = (texto = '') => texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '');


/** Escapa lo que en una expresión regular significaría otra cosa. */
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


/**
 * Busca una categoría por clave sin distinguir mayúsculas.
 *
 * La unicidad del índice sí las distingue, así que sin esto podrían convivir
 * 'Client' y 'client': dos categorías que a la vista son la misma y que se
 * repartirían las alertas entre ambas.
 */
const buscarPorClave = (clave) => MenuCategoryModel
    .findOne({ value: new RegExp(`^${escaparRegex(clave)}$`, 'i') })
    .lean();


/** Cuántas alertas usan esta categoría. */
const alertasQueLaUsan = (value) => MenuModel.countDocuments({ category: value });


const controller = {

    /**
     * GET /menu/categories?includeInactive=true
     *
     * Por defecto devuelve solo las activas, que es lo que necesita el selector
     * al crear una alerta. La pantalla de gestión pide también las inactivas
     * para poder reactivarlas.
     *
     * Cada una viene con `inUse`: cuántas alertas la tienen. Es el dato que
     * decide si se puede borrar, y pedirlo aparte por cada fila serían tantas
     * consultas como categorías.
     */
    getCategories: async (req, res) => {
        try {
            const incluirInactivas = req.query.includeInactive === 'true';
            const filtro = incluirInactivas ? {} : { active: true };

            const categorias = await MenuCategoryModel.find(filtro)
                .sort({ order: 1, es: 1 })
                .populate('createdBy updatedBy', 'name surName img')
                .lean();

            // El conteo de uso, en UNA agregación en lugar de una por categoría.
            const usos = await MenuModel.aggregate([
                { $group: { _id: '$category', total: { $sum: 1 } } },
            ]);
            const porValue = new Map(usos.map(u => [u._id, u.total]));

            return res.status(200).json({
                status: 200,
                categories: categorias.map(c => ({ ...c, inUse: porValue.get(c.value) || 0 })),
            });
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
        }
    },


    /**
     * POST /menu/categories   body: { es, en, value?, icon?, color?, bg?, order? }
     *
     * Si no viene `value` se deriva de la etiqueta en español. Se acepta
     * explícito para poder crear una categoría que empareje con alertas que ya
     * existen con esa clave.
     */
    createCategory: async (req, res) => {
        try {
            const { es, en, value, icon, color, bg, order } = req.body || {};

            if (!es?.trim() || !en?.trim()) {
                return res.status(400).json({
                    status: 400, error: 'Bad request',
                    message: 'Se requieren las etiquetas en español y en inglés.',
                });
            }

            const clave = value ? limpiarClave(value) : aClave(es);
            if (!clave) {
                return res.status(400).json({
                    status: 400, error: 'Bad request',
                    message: 'La etiqueta no produce una clave válida. Usá letras o números.',
                });
            }

            const yaExiste = await buscarPorClave(clave);
            if (yaExiste) {
                return res.status(409).json({
                    status: 409, error: 'Conflict',
                    message: `Ya existe una categoría con la clave "${clave}": ${yaExiste.es}.`,
                    category: yaExiste,
                });
            }

            const categoria = await MenuCategoryModel.create({
                value: clave,
                es: es.trim(),
                en: en.trim(),
                ...(icon ? { icon } : {}),
                ...(color ? { color } : {}),
                ...(bg ? { bg } : {}),
                ...(Number.isFinite(Number(order)) ? { order: Number(order) } : {}),
                createdBy: req.session.userId,
            });

            return res.status(201).json({ status: 201, category: categoria });
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
        }
    },


    /**
     * PUT /menu/categories/id=:id
     *
     * Edita lo que se lee y cómo se ve. El `value` NO se toca aunque venga en
     * el cuerpo: es la clave con la que las alertas apuntan acá, y cambiarla
     * las dejaría huérfanas sin dar ningún error. El modelo además lo declara
     * inmutable, así que esto es la segunda barrera, no la única.
     */
    updateCategory: async (req, res) => {
        try {
            const { id } = req.params;
            if (!Types.ObjectId.isValid(id)) {
                return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido.' });
            }

            const { es, en, icon, color, bg, order, active } = req.body || {};
            const cambios = { updatedBy: req.session.userId };

            if (es !== undefined) {
                if (!es.trim()) return res.status(400).json({ status: 400, error: 'Bad request', message: 'La etiqueta en español no puede quedar vacía.' });
                cambios.es = es.trim();
            }
            if (en !== undefined) {
                if (!en.trim()) return res.status(400).json({ status: 400, error: 'Bad request', message: 'La etiqueta en inglés no puede quedar vacía.' });
                cambios.en = en.trim();
            }
            if (icon !== undefined) cambios.icon = icon;
            if (color !== undefined) cambios.color = color;
            if (bg !== undefined) cambios.bg = bg;
            if (order !== undefined && Number.isFinite(Number(order))) cambios.order = Number(order);
            if (active !== undefined) cambios.active = Boolean(active);

            const categoria = await MenuCategoryModel.findByIdAndUpdate(id, cambios, { new: true, runValidators: true });
            if (!categoria) {
                return res.status(404).json({ status: 404, error: 'Not found', message: 'Categoría no encontrada.' });
            }

            return res.status(200).json({ status: 200, category: categoria });
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
        }
    },


    /**
     * DELETE /menu/categories/id=:id
     *
     * Solo se borra de verdad si NINGUNA alerta la usa. Con alertas dentro se
     * responde 409 diciendo cuántas son y se sugiere desactivarla.
     *
     * Borrarla igual dejaría esas alertas con una categoría que no existe: no
     * fallaría nada, sencillamente desaparecerían de los filtros y nadie
     * relacionaría la ausencia con este borrado.
     */
    deleteCategory: async (req, res) => {
        try {
            const { id } = req.params;
            if (!Types.ObjectId.isValid(id)) {
                return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido.' });
            }

            const categoria = await MenuCategoryModel.findById(id).lean();
            if (!categoria) {
                return res.status(404).json({ status: 404, error: 'Not found', message: 'Categoría no encontrada.' });
            }

            const enUso = await alertasQueLaUsan(categoria.value);
            if (enUso > 0) {
                return res.status(409).json({
                    status: 409,
                    error: 'Conflict',
                    inUse: enUso,
                    message: `No se puede borrar: ${enUso} ${enUso === 1 ? 'alerta la usa' : 'alertas la usan'}. `
                        + 'Desactivala para que deje de ofrecerse sin afectar a las que ya existen.',
                });
            }

            await MenuCategoryModel.findByIdAndDelete(id);
            return res.status(200).json({ status: 200, deleted: true, value: categoria.value });
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({ status: 500, error: 'Error server internal', message: error.message });
        }
    },
};


export default controller;
export { aClave };
