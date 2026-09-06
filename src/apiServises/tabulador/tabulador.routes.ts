import express, { type Response } from 'express';
import { Types } from 'mongoose';
import nameApi from '../../libs/name_api.js';
import { validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import TabuladorModel from './tabulador.model.js';
import tabuladorSchema from './tabulador.schema.js';
import { withRates } from './tabulador.lib.js';
import UserModel from '../user/user.model.js';

const routerTabulador = express.Router();


// ══════════════════════════════════════════════════════════════════════
// EL TABULADOR: LOS CARGOS Y LO QUE PAGA CADA UNO
// ══════════════════════════════════════════════════════════════════════
// Es la hoja TABULADOR del modelo en Excel. Cuatro numeros por cargo y nueve
// tarifas que salen de ellos (ver tabulador.lib.ts).
//
// TODO ES DE ADMINISTRADOR, incluida la lectura. A diferencia del modulo de
// bonos —donde cualquiera con sesion ve las reglas porque la pantalla de una
// novedad las necesita— el tabulador dice cuanto cobra cada cargo, y eso no
// es dato de operador. Si mas adelante una pantalla no administrativa lo
// necesita, se le abre el GET y solo el GET.
//
// Las respuestas llevan siempre la misma forma que el resto de la API:
//   exito   { status, message: 'ok', position }  /  { status, positions }
//   error   { status, error, message }
// y las tarifas viajan pegadas a cada cargo con `withRates`.


/** Como validar un cuerpo: todos los errores juntos y sin claves de mas. */
const OPCIONES_VALIDACION = { abortEarly: false, stripUnknown: true };


/** Un id que no tiene forma de ObjectId es un 400, no un 404 ni un 500. */
const idInvalido = (res: Response) =>
    res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });


/**
 * GET /tabulador?includeInactive=true — todos los cargos, con sus tarifas.
 *
 * Por defecto solo los activos, que es lo que necesita un selector. La
 * pantalla de gestion pide tambien los inactivos para poder reactivarlos.
 */
routerTabulador.get(`${nameApi}/tabulador`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const filtro = req.query.includeInactive === 'true' ? {} : { active: true };

    const cargos = await TabuladorModel.find(filtro).sort({ order: 1, name: 1 }).lean();

    return res.status(200).json({
        status: 200,
        positions: cargos.map(withRates),
    });
}));


/**
 * GET /tabulador/options — solo el nombre y el orden de los cargos activos.
 *
 * Existe para que cualquier pantalla con sesion muestre el nombre de un cargo
 * sin exponer los salarios, que siguen siendo de administrador: la ficha de
 * un empleado o el directorio necesitan escribir "SUPERVISOR" junto a una
 * persona, no cuanto cobra. Por eso el select es cerrado y no pasa por
 * `withRates`. Va antes de /tabulador/id=:id por la convencion de la casa de
 * declarar lo especifico antes que lo parametrico.
 */
routerTabulador.get(`${nameApi}/tabulador/options`, validateSession, asyncHandler(async (_req, res) => {
    const cargos = await TabuladorModel.find({ active: true })
        .select('name order')
        .sort({ order: 1, name: 1 })
        .lean();

    return res.status(200).json({
        status: 200,
        options: cargos.map(cargo => ({ _id: cargo._id, name: cargo.name, order: cargo.order })),
    });
}));


/** GET /tabulador/id=:id — un cargo, con sus tarifas. */
routerTabulador.get(`${nameApi}/tabulador/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) return idInvalido(res);

    const cargo = await TabuladorModel.findById(id).lean();
    if (!cargo) return res.status(404).json({ status: 404, error: 'Not found', message: 'El cargo no existe' });

    return res.status(200).json({ status: 200, position: withRates(cargo) });
}));


/**
 * POST /tabulador — crea un cargo. Lo que acepta esta en tabulador.schema.ts.
 *
 * Un nombre repetido lo rechaza el indice unico: sale como error 11000 y
 * asyncHandler lo traduce a 409 con el campo que choco.
 */
routerTabulador.post(`${nameApi}/tabulador`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const datos = await tabuladorSchema.validate(req.body, OPCIONES_VALIDACION);

    const cargo = await TabuladorModel.create({ ...datos, createdBy: req.session.userId });

    return res.status(201).json({ status: 201, message: 'ok', position: withRates(cargo.toObject()) });
}));


/**
 * PUT /tabulador/id=:id — reemplaza un cargo completo.
 *
 * Cambia lo que se pagara de aqui en adelante a todos los trabajadores con
 * ese cargo. Lo ya liquidado no se toca: cada corte guarda sus propios
 * numeros, como hace el sello de bonos.
 */
routerTabulador.put(`${nameApi}/tabulador/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) return idInvalido(res);

    const datos = await tabuladorSchema.validate(req.body, OPCIONES_VALIDACION);

    const cargo = await TabuladorModel.findByIdAndUpdate(
        id,
        { ...datos, updatedBy: req.session.userId },
        { new: true, runValidators: true },
    ).lean();

    if (!cargo) return res.status(404).json({ status: 404, error: 'Not found', message: 'El cargo no existe' });

    return res.status(200).json({ status: 200, message: 'ok', position: withRates(cargo) });
}));


/** Cuantos trabajadores tienen este cargo. Es lo que decide si se puede borrar. */
const trabajadoresQueLoUsan = (id: string): Promise<number> =>
    UserModel.countDocuments({ 'jobInformation.tabuladorPosition': id });


/**
 * DELETE /tabulador/id=:id
 *
 * Desde que el usuario apunta al tabulador (jobInformation.tabuladorPosition)
 * esta ruta hace lo mismo que la de reglas de bono: cuenta cuantos lo usan y
 * responde 409 con `inUse` en vez de borrar. Un trabajador apuntando a un
 * cargo que no existe saldria de la nomina sin dar ningun error, que es la
 * peor forma de dejar de pagar. Para eso ya existe `active`: desactivar es la
 * baja normal, y un cargo inactivo ya no se puede asignar.
 */
routerTabulador.delete(`${nameApi}/tabulador/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) return idInvalido(res);

    const enUso = await trabajadoresQueLoUsan(id);
    if (enUso > 0) {
        return res.status(409).json({
            status: 409,
            error: 'conflict',
            inUse: enUso,
            message: `Lo tienen ${enUso} trabajador(es). Desactivalo en lugar de borrarlo: deja de ofrecerse pero los que ya lo tienen no cambian.`,
        });
    }

    const borrado = await TabuladorModel.findByIdAndDelete(id);
    if (!borrado) return res.status(404).json({ status: 404, error: 'Not found', message: 'El cargo no existe' });

    return res.status(200).json({ status: 200, message: 'ok' });
}));


export { routerTabulador };
