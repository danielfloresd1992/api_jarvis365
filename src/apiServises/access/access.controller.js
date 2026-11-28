import * as yup from 'yup';
import { Types } from 'mongoose';
import UserModel from '../user/user.model.js';
import LocalModel from '../local/local.model.js';
import FranchiseModel from '../franchise/franchise.model.js';
import DocumentModel from '../documentsAndAnalytics/document.model.js';
import { grantOf, insightsScope, localFilterOf, normalizeAccess, withItem, withoutItem } from './access.lib.js';
import { canSeeLocalId, forbidden } from './access.middleware.js';



// Los métodos no atrapan errores: las rutas los envuelven en asyncHandler (yup → 400, Mongo caído → 503).

export const accessController = {};

const OPTIONS = { abortEarly: false, stripUnknown: true };

// INSIGHTS_POPULATE = «lo que insights365 necesita de cada local, ya poblado»: fijo aquí, no lo decide quien llama
const INSIGHTS_POPULATE = ['franchiseReference.franchise', 'config_report', 'timeServices', 'dishes'];

// PERSON = «lo que se enseña de un usuario en las listas de acceso»
const PERSON = '_id name surName email img admin inabilited access';

const userIdValidate = yup.object({
    userId: yup.string().required('Falta el usuario («userId»)').test('objectId', 'El usuario debe ser un ObjectId válido', value => Types.ObjectId.isValid(value)),
});

const person = (user, grant) => ({ _id: user._id, name: user.name, surName: user.surName, email: user.email, img: user.img ?? null, inabilited: Boolean(user.inabilited), grant });



// ── LO QUE LEE INSIGHTS365 ────────────────────────────────────────────

// GET /insights/establishments — los locales que insights365 enseña a quien llama, por la sesión de su cookie
// (loadAccess). Qué ve cada quien lo decide insightsScope: con accesos, solo lo suyo; sin ellos, todo si es del equipo
// (admin o super) y nada si no. Ya poblados con lo que usa insights365.
// Responde { access: { mode, franchises, locals }, scope: 'assigned'|'staff'|'none', establishments }.
accessController.getInsightsEstablishments = async (req, res) => {
    const scope = await insightsScopeOf(req);
    if (scope === 'none') return res.status(200).json({ access: req.access, scope, establishments: [] });

    const filter = localFilterOf(req.access) ?? {};
    const establishments = await LocalModel.find(filter)
        .select('-managers -img -touchs')
        .populate(INSIGHTS_POPULATE.join(' '))
        .lean();
    return res.status(200).json({ access: req.access, scope, establishments });
};

// insightsScopeOf = «qué le enseña insights365 a quien llama» (insightsScope con su admin/super leídos de la base)
async function insightsScopeOf(req) {
    const userId = req.session?.userId;
    const user = userId ? await UserModel.findById(userId).select('admin super').lean() : null;
    return insightsScope(req.access, userId ? (user ?? {}) : null);
}

// DAY = «una fecha como la guardan los informes»: AAAA-MM-DD, en texto
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// DOCUMENTS_MAX_DAYS = «cuántos días se pueden pedir de una vez» (tres meses y algo)
const DOCUMENTS_MAX_DAYS = 93;

const documentsQueryValidate = yup.object({
    establishment: yup.string().required('Falta el local («establishment»)').test('objectId', 'El local debe ser un ObjectId válido', value => Types.ObjectId.isValid(value)),
    from: yup.string().required('Falta «from» (AAAA-MM-DD)').matches(DAY, '«from» va como AAAA-MM-DD'),
    to: yup.string().required('Falta «to» (AAAA-MM-DD)').matches(DAY, '«to» va como AAAA-MM-DD'),
});

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// GET /insights/documents?establishment=<id>&from=AAAA-MM-DD&to=AAAA-MM-DD — los informes por turno de un local en esos
// días, SIN sus páginas, para la lista de «Reportes por turno» de insights365 (cada uno se abre luego con
// GET /document/:id?populate=pages). Solo los de un local que puede ver quien llama, con la regla de insights365.
// Un informe viejo puede no tener establishmentId: se busca también por el nombre del local.
// Responde { establishment: { _id, name }, from, to, documents: [{ _id, date, shift, pages, createdAt }] }, del más nuevo
// al más viejo; si un turno tiene dos informes salen los dos (el más nuevo primero).
accessController.getInsightsDocuments = async (req, res) => {
    const { establishment, from, to } = await documentsQueryValidate.validate(req.query, OPTIONS);
    const span = daysBetween(from, to);
    if (span < 0) return res.status(400).json({ status: 400, error: 'Bad request', message: '«from» no puede ser después de «to»' });
    if (span > DOCUMENTS_MAX_DAYS) return res.status(400).json({ status: 400, error: 'Bad request', message: `Como mucho ${DOCUMENTS_MAX_DAYS} días por consulta` });

    const scope = await insightsScopeOf(req);
    if (scope === 'none' || !(await canSeeLocalId(req.access, establishment))) return forbidden(res);

    const local = await LocalModel.findById(establishment).select('_id name').lean();
    if (!local) return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe ese establecimiento' });

    const documents = await DocumentModel.find({
        type: 'complete-shift',
        date: { $gte: from, $lte: to },
        $or: [{ establishmentId: local._id }, { establishmentName: local.name }],
    }).select('_id date shift pages').sort({ date: -1, _id: -1 }).lean();

    return res.status(200).json({
        establishment: { _id: local._id, name: local.name },
        from,
        to,
        documents: documents.map(document => ({
            _id: document._id,
            date: document.date,
            shift: document.shift,
            pages: Array.isArray(document.pages) ? document.pages.length : 0,
            createdAt: document._id.getTimestamp(),
        })),
    });
};



// ── LO QUE ASIGNA UN ADMINISTRADOR DESDE CLIENT365 ────────────────────

// GET /access/local/id=:id — quién tiene acceso a este local y cómo: por el local suelto o por su franquicia.
// Solo los usuarios con acceso restringido ('only'): los que ven todo no se listan.
accessController.getLocalAccess = async (req, res) => {
    const local = await LocalModel.findById(req.params.id).select('_id name franchiseReference').lean();
    if (!local) return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe ese establecimiento' });

    const franchise = local.franchiseReference?.franchise ?? null;
    const users = await UserModel.find({
        'access.mode': 'only',
        $or: [{ 'access.locals': local._id }, ...(franchise ? [{ 'access.franchises': franchise }] : [])],
    }).select(PERSON).lean();

    const people = users
        .map(user => person(user, grantOf(user.access, local)))
        .filter(item => item.grant)
        .sort((a, b) => `${a.name} ${a.surName}`.localeCompare(`${b.name} ${b.surName}`, 'es'));
    return res.status(200).json({ local: { _id: local._id, name: local.name, franchise }, users: people });
};

// GET /access/franchise/id=:id — quién ve TODA esta franquicia
accessController.getFranchiseAccess = async (req, res) => {
    const franchise = await FranchiseModel.findById(req.params.id).select('_id name').lean();
    if (!franchise) return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe esa franquicia' });

    const users = await UserModel.find({ 'access.mode': 'only', 'access.franchises': franchise._id }).select(PERSON).lean();
    const people = users
        .map(user => person(user, 'franchise'))
        .sort((a, b) => `${a.name} ${a.surName}`.localeCompare(`${b.name} ${b.surName}`, 'es'));
    return res.status(200).json({ franchise, users: people });
};

// GET /access/users — todos los usuarios con lo que ve cada uno, para elegir a quién dar acceso desde Client365.
// `access` va normalizado: { mode:'all' } o { mode:'only', franchises:[ids], locals:[ids] }.
accessController.listUsers = async (req, res) => {
    const users = await UserModel.find({}).select(PERSON).lean();
    const people = users
        .map(user => ({ ...person(user, null), admin: Boolean(user.admin), access: normalizeAccess(user.access) }))
        .sort((a, b) => `${a.name} ${a.surName}`.localeCompare(`${b.name} ${b.surName}`, 'es'));
    return res.status(200).json({ users: people });
};

// OWN_ACCESS = «nadie cambia su propio acceso»: un administrador que se restringe deja de ver locales también en
// Client365 (el lobby y esta misma lista pasan por loadAccess) y no tendría cómo deshacerlo. Lo cambia otro.
const isSelf = (req, userId) => Boolean(req.session?.userId) && String(req.session.userId) === String(userId);
const ownAccess = (res) => res.status(400).json({ status: 400, error: 'Bad request', message: 'Tu propio acceso lo cambia otro administrador' });

// saveAccess = «guarda el acceso de un usuario, con quién y cuándo», y responde el acceso COMO QUEDÓ EN LA BASE: se
// vuelve a leer después de escribir, para que Client365 enseñe lo guardado y no lo que se quiso guardar. Si la
// escritura no tocó al usuario, o lo leído no es lo escrito, responde 500 diciéndolo en vez de fingir que se guardó.
async function saveAccess(req, res, userId, next) {
    const access = { ...next, updatedBy: req.session?.userId ?? null, updatedAt: new Date() };
    const result = await UserModel.updateOne({ _id: userId }, { $set: { access } });
    if (!result.matchedCount) return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe ese usuario' });

    const saved = await UserModel.findById(userId).select('access').lean();
    const stored = normalizeAccess(saved?.access);
    if (JSON.stringify(stored) !== JSON.stringify(normalizeAccess(next))) {
        console.log('[access] se escribió el acceso pero la base devuelve otro', { userId, wanted: normalizeAccess(next), stored, result });
        return res.status(500).json({ status: 500, error: 'Not saved', message: 'La base no guardó el cambio de acceso', stored });
    }
    return res.status(200).json({ userId, access: stored });
}

// changeAccess = «dar o quitar a un usuario un local o una franquicia»
async function changeAccess(req, res, kind, add) {
    const { userId } = await userIdValidate.validate(add ? req.body : { userId: req.params.userId }, OPTIONS);
    if (isSelf(req, userId)) return ownAccess(res);

    const Target = kind === 'franchise' ? FranchiseModel : LocalModel;
    const exists = await Target.exists({ _id: req.params.id });
    if (!exists) return res.status(404).json({ status: 404, error: 'Not found', message: kind === 'franchise' ? 'No existe esa franquicia' : 'No existe ese establecimiento' });

    const user = await UserModel.findById(userId).select('access').lean();
    if (!user) return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe ese usuario' });

    return saveAccess(req, res, userId, (add ? withItem : withoutItem)(user.access, kind, req.params.id));
}

// DELETE /access/user/id=:id — que el usuario vuelva a ver todos los locales (sin restricción). Es la salida para
// quien se quedó sin nada al quitarle su último acceso.
accessController.resetAccess = async (req, res) => {
    const userId = req.params.id;
    if (isSelf(req, userId)) return ownAccess(res);
    const exists = await UserModel.exists({ _id: userId });
    if (!exists) return res.status(404).json({ status: 404, error: 'Not found', message: 'No existe ese usuario' });
    return saveAccess(req, res, userId, normalizeAccess(null));
};

// POST /access/local/id=:id { userId } y DELETE /access/local/id=:id/user=:userId — un local suelto
accessController.grantLocal = (req, res) => changeAccess(req, res, 'local', true);
accessController.revokeLocal = (req, res) => changeAccess(req, res, 'local', false);

// POST /access/franchise/id=:id { userId } y DELETE /access/franchise/id=:id/user=:userId — la franquicia entera
accessController.grantFranchise = (req, res) => changeAccess(req, res, 'franchise', true);
accessController.revokeFranchise = (req, res) => changeAccess(req, res, 'franchise', false);
