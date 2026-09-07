import express, { type Response } from 'express';
import { Types } from 'mongoose';
import nameApi from '../../libs/name_api.js';
import { validateSession, validateAdminUser } from '../../middleware/validateSessionAndUser.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import NominaModel, { CUT_KINDS, type CutKind, type NominaPositionSeal } from './nomina.model.js';
import { nominaMonthSchema, validateRow, isCutKind } from './nomina.schema.js';
import { rowAmounts, withAmounts, withBs, titleOf } from './nomina.lib.js';
import { getExchangeRate } from '../exchangeRate/exchangeRate.lib.js';
import TabuladorModel, { type TabuladorPositionDoc } from '../tabulador/tabulador.model.js';
import { DEFAULT_BASE_SALARY_BS } from '../tabulador/tabulador.lib.js';
import UserModel from '../user/user.model.js';

const routerNomina = express.Router();


// ══════════════════════════════════════════════════════════════════════
// LA NOMINA: UN MES CON SUS CUATRO CORTES
// ══════════════════════════════════════════════════════════════════════
// Un mes se ABRE con la gente que alguien elige, copiando el tabulador de cada
// uno (eso es el sello) y armando los cuatro cortes de una vez. Cada corte se
// CORRIGE fila por fila mientras esta abierto y se CIERRA por separado,
// congelando sus dolares. Despues de cerrado solo se lee: es la prueba de lo
// que se pago.
//
// LOS CUATRO CORTES NACEN JUNTOS y no se crean uno a uno: son la estructura
// del mes, no cuatro decisiones. Que existan desde el principio es lo que
// permite teclear el bono en la primera semana si hace falta, sin tener que
// "abrir" nada antes.
//
// TODO ES DE ADMINISTRADOR, incluida la lectura, por lo mismo que el
// tabulador: aqui esta lo que cobra cada persona con nombre y apellido, y eso
// no es dato de operador.
//
// Las respuestas llevan la misma forma que el resto de la API:
//   exito   { status, message: 'ok', month }  /  { status, months }
//   error   { status, error, message }
//
// LA TASA SE PIDE AL RESPONDER, NO SE GUARDA. El mes no la tiene: es una
// variable global (apiServises/exchangeRate) y `getExchangeRate` la lee. Cada
// respuesta con montos la devuelve como `currentExchangeRate`, con ese nombre
// para que nadie la confunda con un campo del mes. Sin tasa cargada vale cero:
// la columna de bolivares sale en cero y se ve que falta configurarla, que es
// mejor que negarse a mostrar una nomina por eso.


/** Como validar un cuerpo: todos los errores juntos y sin claves de mas. */
const OPCIONES_VALIDACION = { abortEarly: false, stripUnknown: true };


/** Un id que no tiene forma de ObjectId es un 400, no un 404 ni un 500. */
const idInvalido = (res: Response) =>
    res.status(400).json({ status: 400, error: 'Bad request', message: 'Id inválido' });


/** El mes que se pidio no existe. Sale de cuatro rutas, asi que se dice una vez. */
const noExiste = (res: Response) =>
    res.status(404).json({ status: 404, error: 'Not found', message: 'Ese mes de nómina no existe' });


/**
 * El tipo de corte de la URL, o un 404 con los cuatro que si valen.
 *
 * Un tipo inventado se rechaza aqui y no mas adelante: si se dejara pasar, la
 * busqueda del corte no encontraria nada y el error diria "no existe el mes",
 * que manda a mirar donde no es.
 */
const tipoDeCorte = (valor: string, res: Response): CutKind | null => {
    if (isCutKind(valor)) return valor;

    res.status(404).json({
        status: 404,
        error: 'Not found',
        message: `No existe el corte "${valor}". Los cortes del mes son: ${CUT_KINDS.join(', ')}`,
    });
    return null;
};


/**
 * GET /nomina — los meses, el mas reciente primero y SIN las filas.
 *
 * Un mes trae cuatro cortes de ciento y pico de filas cada uno, mas el sello
 * de cada persona: mandarlo entero en una lista que solo pinta titulos serian
 * megabytes por pantalla. Quien abre un mes pide el mes.
 *
 * Va por `aggregate` y no por `find().select()` para poder devolver `people`
 * como un NUMERO en vez del arreglo con los sellos: con una proyeccion normal
 * habria que elegir entre traerlos todos o no saber cuanta gente entra, y la
 * lista necesita el segundo dato sin pagar el primero.
 */
routerNomina.get(`${nameApi}/nomina`, validateSession, validateAdminUser, asyncHandler(async (_req, res) => {
    const months = await NominaModel.aggregate([
        { $sort: { year: -1, month: -1 } },
        {
            $project: {
                year: 1,
                month: 1,
                title: 1,
                payPeriodsPerMonth: 1,
                createdAt: 1,
                updatedAt: 1,
                peopleCount: { $size: { $ifNull: ['$people', []] } },
                // Solo el estado de cada corte: es lo que la tira de arriba
                // pinta, y basta para saber cuanto falta por cerrar.
                cuts: {
                    $map: {
                        input: { $ifNull: ['$cuts', []] },
                        as: 'c',
                        in: { kind: '$$c.kind', status: '$$c.status', closedAt: '$$c.closedAt' },
                    },
                },
            },
        },
    ]);

    return res.status(200).json({ status: 200, months });
}));


/** GET /nomina/id=:id — el mes entero: los cuatro cortes con sus filas y lo
 *  que cobra cada una. */
routerNomina.get(`${nameApi}/nomina/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) return idInvalido(res);

    const [mes, tasa] = await Promise.all([
        NominaModel.findById(id).lean(),
        getExchangeRate(),
    ]);
    if (!mes) return noExiste(res);

    return res.status(200).json({ status: 200, month: withAmounts(mes, tasa) });
}));


/**
 * El sello del cargo: lo que se copia del tabulador dentro de la persona.
 *
 * Solo las cifras que se teclean en el cargo, mas el nombre que tenia entonces
 * y de que cargo salio. Las tarifas no se copian: se calculan sobre este mismo
 * sello con `ratesOf`, que es la unica formula del sistema.
 */
const selloDelCargo = (cargo: TabuladorPositionDoc & { _id: Types.ObjectId }): NominaPositionSeal => ({
    tabuladorPosition: cargo._id,
    name: cargo.name,
    monthlyBasePackage: cargo.monthlyBasePackage,
    fullPackage: cargo.fullPackage,
    complementaryBonus: cargo.complementaryBonus,
    overtimeHourRate: cargo.overtimeHourRate,
    zeroMarginOverride: cargo.zeroMarginOverride ?? null,
    // El respaldo NO sobra: los veinticinco cargos se cargaron antes de que
    // existiera este campo y los que nadie edito desde entonces siguen sin el
    // en Mongo. Sin el `??`, el sello copia `undefined`, el subdocumento lo
    // exige, y Mongoose tumba la creacion del mes ENTERO con un mensaje que
    // habla de `people.0.position.baseSalaryBs`: una nomina de cien personas
    // bloqueada por un campo que nadie teclea. `ratesOf` hace lo mismo.
    baseSalaryBs: cargo.baseSalaryBs ?? DEFAULT_BASE_SALARY_BS,
});


/**
 * POST /nomina — abre un mes con sus cuatro cortes y sella a los elegidos.
 *
 * El cuerpo dice QUE MES y A QUIEN. El titulo, las fechas de cada corte y las
 * cifras de cada persona los pone el servidor: son lo que no se teclea.
 */
routerNomina.post(`${nameApi}/nomina`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const datos = await nominaMonthSchema.validate(req.body, OPCIONES_VALIDACION);

    // Un id repetido cuenta una sola vez. Marcar dos veces a la misma persona
    // no es pedir que cobre doble, y dos filas suyas en el mismo corte si lo
    // serian: al cerrar se liquidarian las dos.
    const elegidos = [...new Set(datos.users)];

    // Las dos lecturas no dependen una de otra y el mes no se puede armar con
    // una sola. Los cargos se traen TODOS, tambien los inactivos: alguien puede
    // seguir teniendo asignado un cargo que ya no se ofrece, y dejarlo sin
    // sello seria dejar de pagarle sin que nadie lo note.
    const [gente, cargos] = await Promise.all([
        UserModel.find({ _id: { $in: elegidos } }).select('name surName dni jobInformation').lean(),
        TabuladorModel.find().lean(),
    ]);

    // Si algun elegido no existe se dice CUAL y no se crea nada. Dejar caer a
    // una persona en silencio es justo el fallo que una nomina no puede
    // permitirse: el mes se veria completo, cuadraria solo, y esa persona no
    // cobraria sin que ningun error lo delatara.
    const encontrados = new Set(gente.map(persona => String(persona._id)));
    const faltantes = elegidos.filter(id => !encontrados.has(id));
    if (faltantes.length > 0) {
        return res.status(400).json({
            status: 400,
            error: 'Bad request',
            missing: faltantes,
            message: `No existe(n) ${faltantes.length} de las personas elegidas: ${faltantes.join(', ')}`,
        });
    }

    // El tabulador entero en memoria y no una consulta por persona: son
    // veinticinco cargos y ciento y pico de personas, y el mes se arma de una
    // sola pasada.
    const porId = new Map<string, TabuladorPositionDoc & { _id: Types.ObjectId }>(
        cargos.map(cargo => [String(cargo._id), cargo]),
    );

    // QUIEN APUNTA A UN CARGO QUE YA NO ESTA no es lo mismo que quien no tiene
    // cargo, y sellarlos igual borra la diferencia: los dos quedarian en cero y
    // en pantalla se verian identicos. El primero es un dato roto y se dice; el
    // segundo es una decision de quien arma el mes.
    const huerfanos = gente
        .filter(persona => {
            const suyo = persona.jobInformation?.tabuladorPosition;
            return suyo && !porId.has(String(suyo));
        })
        .map(persona => `${persona.name} ${persona.surName}`.trim());

    if (huerfanos.length > 0) {
        return res.status(400).json({
            status: 400,
            error: 'Bad request',
            orphans: huerfanos,
            message: `Estas personas apuntan a un cargo que ya no existe en el tabulador: ${huerfanos.join(', ')}. Asignales uno antes de abrir el mes.`,
        });
    }

    const people = gente.map(persona => {
        const cargo = porId.get(String(persona.jobInformation?.tabuladorPosition ?? ''));

        return {
            user: persona._id,
            name: persona.name,
            surName: persona.surName,
            dni: persona.dni ?? null,
            department: persona.jobInformation?.department ?? null,
            position: cargo ? selloDelCargo(cargo) : null,
        };
    });

    // LOS CUATRO CORTES CON LA MISMA GENTE. Cada uno arranca con una fila por
    // persona en cero: asi "quien entra en este corte" ya esta decidido y
    // teclear es corregir, no dar de alta. Las filas no repiten el sello —vive
    // una sola vez en `people`— que es lo que evita que dos quincenas del mismo
    // mes acaben con cifras distintas.
    const cuts = CUT_KINDS.map(kind => ({
        kind,
        status: 'abierto' as const,
        closedAt: null,
        closedBy: null,
        rows: people.map(p => ({ user: p.user })),
    }));

    // `users` dice a quien incluir, pero no es un campo del mes: una vez
    // armadas las personas, la lista ya esta contada dentro. Se aparta aqui a
    // mano en vez de dejar que Mongoose la descarte por `strict`, para que se
    // lea que quedarse fuera del documento es lo que toca y no un olvido.
    const { users: _lista, ...cabecera } = datos;

    try {
        const mes = await NominaModel.create({
            ...cabecera,
            title: titleOf(datos.year, datos.month),
            people,
            cuts,
            createdBy: req.session.userId,
        });

        const tasa = await getExchangeRate();

        return res.status(201).json({ status: 201, message: 'ok', month: withAmounts(mes.toObject(), tasa) });
    }
    catch (fallo: unknown) {
        // 11000 es el indice unico de (year, month): ya hay un agosto. Se
        // traduce a 409 con el nombre del mes en vez de dejar salir un error de
        // Mongo, porque no es un fallo del sistema sino algo que quien lo abre
        // tiene que saber: el mes ya esta y hay que abrir ESE, no otro.
        if ((fallo as { code?: number })?.code === 11000) {
            return res.status(409).json({
                status: 409,
                error: 'conflict',
                message: `${titleOf(datos.year, datos.month)} ya está abierto. Ábrelo desde la lista en vez de crear otro.`,
            });
        }
        throw fallo;
    }
}));


/**
 * PUT /nomina/id=:id/corte=:kind/fila/id=:userId — lo que se le teclea a una
 * persona en UN corte.
 *
 * ES UN REEMPLAZO COMPLETO de los movimientos de esa fila: lo que no venga se
 * guarda como cero. Es lo que hace que la pantalla pueda mandar la fila tal
 * como quedo sin llevar la cuenta de que celda se toco.
 *
 * QUE SE PUEDE TECLEAR DEPENDE DEL CORTE, y lo decide `validateRow` por el
 * tipo de la URL: en una quincena, los tres conteos y los dos descuentos; en
 * margen "0" y en bono, solo el descuento. Mandar horas extras a un bono no es
 * un error del usuario, es una llamada mal armada, y `stripUnknown` la deja en
 * nada en vez de pagar dias que ese corte no cubre.
 *
 * Se escribe con `$set` sobre `cuts.$[c].rows.$[f]` y no cargando el mes para
 * guardarlo entero: el dia del cierre hay varias personas tecleando el mismo
 * corte a la vez, y un `save()` del documento completo devolveria al disco la
 * copia vieja de todas las demas filas, borrando lo que el otro acababa de
 * escribir.
 *
 * Un corte cerrado no se toca: eso ya se pago. Los otros tres del mismo mes
 * siguen abiertos, que es justo el punto de cerrarlos por separado.
 */
routerNomina.put(`${nameApi}/nomina/id=:id/corte=:kind/fila/id=:userId`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id, userId } = req.params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(userId)) return idInvalido(res);

    const kind = tipoDeCorte(req.params.kind, res);
    if (!kind) return undefined;

    const datos = await validateRow(kind, req.body, OPCIONES_VALIDACION);

    // Se lee antes de escribir para poder decir QUE falla: el mes, el corte, la
    // persona o el estado. Un `$set` que no encuentra su fila no da error, se
    // pierde en silencio, y quien teclea se queda creyendo que guardo.
    //
    // La tasa se pide EN PARALELO con esa lectura y no despues de escribir:
    // esta es la llamada mas repetida del modulo —cinco campos por persona, el
    // dia del cierre— y colgada del mismo `Promise.all` no le suma un viaje.
    //
    // De `people` se trae SOLO al interesado con `$elemMatch`, y de `cuts` solo
    // el estado de cada uno: sin eso, cada tecla arrastraria el mes completo
    // —cuatro cortes por ciento y pico de filas— para responder por una fila.
    const [mes, tasa] = await Promise.all([
        NominaModel.findById(id)
            .select({
                payPeriodsPerMonth: 1,
                'cuts.kind': 1,
                'cuts.status': 1,
                people: { $elemMatch: { user: new Types.ObjectId(userId) } },
            })
            .lean(),
        getExchangeRate(),
    ]);
    if (!mes) return noExiste(res);

    const corte = mes.cuts?.find(c => c.kind === kind);
    if (!corte) return noExiste(res);

    if (corte.status === 'cerrado') {
        return res.status(409).json({
            status: 409,
            error: 'conflict',
            message: 'Ese corte está cerrado: lo que ya se pagó no se corrige',
        });
    }

    const persona = mes.people?.[0];
    if (!persona) {
        return res.status(404).json({ status: 404, error: 'Not found', message: 'Esa persona no está en este mes' });
    }

    // Los valores de los `arrayFilters` van como ObjectId construidos a mano:
    // Mongoose no los castea contra el esquema como hace con el filtro normal,
    // y una cadena no coincide con el ObjectId guardado.
    //
    // Sin proyeccion de vuelta (`new: false` por defecto): lo que se acaba de
    // escribir es exactamente `datos`, ya validado y con sus defectos puestos,
    // asi que releerlo solo serviria para arrastrar el mes entero de vuelta.
    const escrito = await NominaModel.updateOne(
        { _id: id, cuts: { $elemMatch: { kind, status: 'abierto' } } },
        {
            $set: {
                'cuts.$[c].rows.$[f].sundays': datos.sundays ?? 0,
                'cuts.$[c].rows.$[f].additionalDays': datos.additionalDays ?? 0,
                'cuts.$[c].rows.$[f].overtimeHours': datos.overtimeHours ?? 0,
                'cuts.$[c].rows.$[f].zeroMarginDeduction': datos.zeroMarginDeduction ?? 0,
                'cuts.$[c].rows.$[f].otherDeductions': datos.otherDeductions ?? 0,
                updatedBy: req.session.userId,
            },
        },
        {
            runValidators: true,
            arrayFilters: [
                { 'c.kind': kind },
                { 'f.user': new Types.ObjectId(userId) },
            ],
        },
    );

    // Llegado aqui el mes y el corte EXISTEN y estaban abiertos: se leyeron
    // antes de escribir. Que no case ninguno solo puede ser porque el corte
    // dejo de estar abierto entre la lectura y la escritura, o sea que alguien
    // lo cerro en el medio. Un 404 mandaria a buscar un corte que esta ahi; el
    // 409 dice lo unico que hace falta saber, que el cambio no entro.
    if (escrito.matchedCount === 0) {
        return res.status(409).json({
            status: 409,
            error: 'conflict',
            message: 'El corte se cerró mientras guardabas: lo que escribiste no entró',
        });
    }

    // Se responde con lo que quedo guardado, armado desde `datos` y no releido:
    // son los mismos numeros, y releerlos costaria traer el mes entero.
    const fila = {
        user: userId,
        sundays: datos.sundays ?? 0,
        additionalDays: datos.additionalDays ?? 0,
        overtimeHours: datos.overtimeHours ?? 0,
        zeroMarginDeduction: datos.zeroMarginDeduction ?? 0,
        otherDeductions: datos.otherDeductions ?? 0,
        settled: null,
    };

    // Los bolivares salen convertidos de aqui y no se le dejan al front: la
    // hoja pinta una sola columna en bolivares y tiene que dar lo mismo venga
    // de esta ruta o del GET del mes. `amounts` guarda la misma forma en las
    // dos, que es lo que permite pegar la fila devuelta encima de la que la
    // pantalla ya tiene.
    return res.status(200).json({
        status: 200,
        message: 'ok',
        kind,
        row: fila,
        amounts: withBs(rowAmounts(kind, fila, persona.position, mes.payPeriodsPerMonth), tasa),
        currentExchangeRate: tasa,
    });
}));


/**
 * PUT /nomina/id=:id/corte=:kind/cerrar — firma UN corte y lo da por pagado.
 *
 * Se cierra de a uno porque cada corte se paga en su fecha: la primera
 * quincena el 15, el bono cuando toque. Cerrar uno no toca a los otros tres, y
 * el mes queda cerrado cuando lo estan los cuatro, cosa que se deduce al leer.
 *
 * Hasta aqui los DOLARES se derivaban al leer; desde aqui quedan escritos en
 * `settled` y manda lo escrito. Es lo que permite que dentro de un año se
 * pueda responder por el numero exacto que cobro cada persona aunque el
 * tabulador y hasta la formula sean otros.
 *
 * LA TASA NO ENTRA EN EL SELLO. `rowAmounts` devuelve solo dolares, que es
 * exactamente lo que `settled` guarda; los bolivares del corte cerrado se
 * siguen derivando cada vez que alguien lo abre. Un corte de enero dira
 * siempre los mismos dolares y los bolivares de hoy, y a que tasa se pago
 * aquel dia lo dice el historial del recurso de la tasa cruzado con
 * `closedAt`, que es donde ese rastro esta completo.
 */
routerNomina.put(`${nameApi}/nomina/id=:id/corte=:kind/cerrar`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) return idInvalido(res);

    const kind = tipoDeCorte(req.params.kind, res);
    if (!kind) return undefined;

    const mes = await NominaModel.findById(id).lean();
    if (!mes) return noExiste(res);

    const corte = mes.cuts?.find(c => c.kind === kind);
    if (!corte) return noExiste(res);

    if (corte.status === 'cerrado') {
        return res.status(409).json({ status: 409, error: 'conflict', message: 'Ese corte ya está cerrado' });
    }

    const sello = new Map(mes.people.map(p => [String(p.user), p.position]));

    // SE ESCRIBE `settled` Y NADA MAS, una entrada por fila con su propio
    // filtro. Reescribir el arreglo entero —que es lo natural despues de
    // haberlo leido— devuelve al disco la copia vieja de los movimientos, y el
    // dia del cierre hay varias personas tecleando el mismo corte: lo que otro
    // guardo en esos milisegundos desapareceria sin error y quedaria firmado en
    // cero. Es la misma razon por la que el PUT de fila usa `arrayFilters`.
    const $set: Record<string, unknown> = {
        'cuts.$[c].status': 'cerrado',
        'cuts.$[c].closedAt': new Date(),
        'cuts.$[c].closedBy': req.session.userId,
        updatedBy: req.session.userId,
    };
    const arrayFilters: Record<string, unknown>[] = [{ 'c.kind': kind }];

    corte.rows.forEach((fila, i) => {
        const marca = `f${i}`;
        $set[`cuts.$[c].rows.$[${marca}].settled`] =
            rowAmounts(kind, fila, sello.get(String(fila.user)), mes.payPeriodsPerMonth);
        arrayFilters.push({ [`${marca}.user`]: fila.user });
    });

    // Y ADEMAS `updatedAt` EN EL FILTRO. Escribir solo `settled` evita pisar los
    // movimientos, pero no evita firmarlos con un numero viejo: si alguien
    // guardo una novedad entre la lectura y esta linea, el sello no coincidiria
    // con lo tecleado. Con la marca de tiempo el cierre falla en vez de mentir,
    // y basta recargar y reintentar.
    //
    // OJO: `updatedAt` es del MES, y teclear en cualquiera de los cuatro cortes
    // lo mueve. Que cerrar una quincena falle porque alguien tecleaba el bono
    // es un reintento de mas; firmar cifras que no son las tecleadas no tiene
    // arreglo, asi que el guardia se queda del lado seguro.
    const cerrado = await NominaModel.findOneAndUpdate(
        {
            _id: id,
            updatedAt: mes.updatedAt,
            cuts: { $elemMatch: { kind, status: 'abierto' } },
        },
        { $set },
        { new: true, runValidators: true, arrayFilters },
    ).lean();

    if (!cerrado) {
        return res.status(409).json({
            status: 409,
            error: 'conflict',
            message: 'Alguien tocó el mes mientras se cerraba el corte, o ya estaba cerrado. Recargá y volvé a intentar',
        });
    }

    const tasa = await getExchangeRate();

    return res.status(200).json({ status: 200, message: 'ok', month: withAmounts(cerrado, tasa) });
}));


/**
 * DELETE /nomina/id=:id — borra un mes en el que NO se cerro ningun corte.
 *
 * Un corte cerrado no se borra ni se desactiva: es el respaldo de un pago que
 * ya salio, y sin el no queda con que responder por ese dinero. Como los
 * cuatro viven en el mismo documento, basta que UNO este cerrado para que el
 * mes no se pueda borrar: llevarselo se llevaria tambien esa prueba.
 *
 * El estado va en el filtro del borrado y no en una consulta previa para que no
 * haya hueco entre comprobar y borrar; la segunda consulta solo corre cuando
 * hay que explicar por que no se borro.
 */
routerNomina.delete(`${nameApi}/nomina/id=:id`, validateSession, validateAdminUser, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) return idInvalido(res);

    const borrado = await NominaModel
        .findOneAndDelete({ _id: id, cuts: { $not: { $elemMatch: { status: 'cerrado' } } } })
        .select('_id')
        .lean();

    if (!borrado) {
        const existe = await NominaModel.exists({ _id: id });
        if (!existe) return noExiste(res);

        return res.status(409).json({
            status: 409,
            error: 'conflict',
            message: 'El mes tiene cortes cerrados: lo que ya se pagó no se borra',
        });
    }

    return res.status(200).json({ status: 200, message: 'ok' });
}));


export { routerNomina };
