import colors from 'colors';
import moment from 'moment-timezone';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import os from 'os';
import DvrFailureModel from '../dvrFailure/dvrFailure.model.js';
import { debeRechazarLaAlerta, resolveDvrEffect, ALERTA_DVR_LEGADA } from '../dvrFailure/dvrGate.lib.js';
import NoveltieModel, { CommentSchema } from './noveltie.model.js';
import LocalModel from '../local/local.model.js';
import { commentYupSchema } from './novelty.squema.js';

import MenuModel from '../menu/menu.model.js';
import UserModel from '../user/user.model.js';
import { buildBonusSeal } from '../bonus/bonusSeal.lib.js';
import FileNoveltieModel from './fileNoveltie.model.js';
import { join } from 'path';
import fs, { readFileSync } from 'fs';
import { Types } from 'mongoose';
import { config } from 'dotenv';
import * as url from 'url';
import nameApi from '../../libs/name_api.js';

import { Request, Response } from 'express';

import { io } from '../../services/socket/io.js';
import MonitoringStateModel from '../../services/monitoring/monitoringState.model.js';
import { getOperationalDay } from '../../services/noveltyReport/noveltyReport.service.js';

/** La zona de la operación; la misma variable que usa el reporte de novedades. */
const REPORT_TZ = process.env.MONITORING_TZ || 'America/Caracas';

//call servises publisher

import publisher from '../../services/publisher/publisher.layer.js';
import { IsDaylightSavingTimeBoolean } from '../time/time.model.js';
import session from 'express-session';
import { rejects } from 'assert';


config();


const __dirname: string = url.fileURLToPath(new URL('.', import.meta.url));
const documentsPath: any = process.env.DEBUG === 'true' ? '\\\\72.68.60.254\\d' : 'D:\\';


// ══════════════════════════════════════════════════════════════════════
// EL LIBRO DE BONOS
// ══════════════════════════════════════════════════════════════════════
// Lo que en la hoja de cálculo es `Op_DataBase`, cargado a mano: una fila por
// día, turno, local, operador y código, con su cantidad.

/** Por qué columnas se puede agrupar, y de dónde sale cada una. */
const LEDGER_COLUMNAS: any = {
    dia: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
    turno: '$shift',
    // Los dos lugares donde puede estar el local, según la edad del documento.
    local: { $ifNull: ['$establishment', '$local.idLocal'] },
    operador: '$sharedByUser.user.id',
    alerta: '$menuRef',
};

/** Ningún rango más largo que esto. Tres meses y un poco de aire. */
const LEDGER_MAX_DIAS = 92;

/** Cuántas novedades se agrupan sin pensarlo dos veces. */
const LEDGER_MAX_NOVEDADES = 400000;

const UN_DIA = 24 * 60 * 60 * 1000;


export default class ControllerNovelty {

    private socketAdapter: any;



    constructor(socketAdapter: any) {
        this.socketAdapter = socketAdapter;
    };



    getNovelties = async (req: Request, res: Response): Promise<void> => {
        try {
            const allNovwelties: any = await NoveltieModel.find();
            res.json(allNovwelties);
        }
        catch (err) {
            console.log(err);
            res.status(500).send('Error server internal.');
        }
    };



    getNoveltie = async (req: Request, res: any): Promise<void> => {
        try {
            const since: string = req.params.since;
            const until: string = req.params.until;

            const query = { date: { $gte: new Date(since).toISOString(), $lt: new Date(until).toISOString() } };
            const result = await NoveltieModel.find(query).select('-fileNoveltie').populate('sharedByUser.user.id menuEditedBy.user.id validationResult.validatedByUser.user.id establishment');
            res.zip(JSON.stringify(result), 'resultado');
        }
        catch (error) {
            console.log(error);
            res.status(500);
        }
    }




    getNovelty = async (req: Request, res: any): Promise<void> => {
        try {
            const establishments: any = req.query.establishmentName;
            const dayQuery: any = req.query.since;
            const shiftQuery: any = req.query.shift;

            const regex = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-(19|20)\d\d$/;
            if (!regex.test(dayQuery)) return res.status(400).json({ error: 'The ‘since’ parameter must be in this format: ‘mm-dd-year’' });

            const since: any = `${dayQuery.split('-')[2]}-${dayQuery.split('-')[0]}-${dayQuery.split('-')[1]}`;
            const until: any = `${dayQuery.split('-')[2]}-${dayQuery.split('-')[0]}-${Number(dayQuery.split('-')[1]) + 1}`;

            const isDaylightSavingTimeBoolean = await IsDaylightSavingTimeBoolean.findOne();

            let queryDateDay: string = '';
            let queryDateNight: string = '';

            const nightInit: string = isDaylightSavingTimeBoolean.isDaylightSavingTime ? '18:00:00' : '17:00:00';

            if (shiftQuery === 'day') {
                queryDateDay = `${since} 08:00:00`;
                queryDateNight = `${since} ${nightInit}`;
            }
            else if (shiftQuery === 'night') {
                queryDateDay = `${since} ${nightInit}`;
                queryDateNight = `${until} 01:00:00`;
            }
            else if (typeof shiftQuery === 'undefined') {
                queryDateDay = `${since} 00:00:00`;
                queryDateNight = `${until} 23:59:59`;
            }
            else {
                res.status(400).json({ error: '“The ‘shift’ parameter is optional, but when used, it must be declared with the following text: ‘day’ or ‘night’.”' });
            }

            if (!establishments) res.status(400).json({ error: `Bad request, establishments as a parameter is not established` });
            if (!dayQuery) res.status(400).json({ error: `Bad request, since as a parameter is not established` });


            const query = {
                'local.name': establishments,
                date: {
                    $gte: new Date(queryDateDay).toISOString(),
                    $lt: new Date(queryDateNight).toISOString()
                }
            };

            const resultNoveltie = await NoveltieModel.find(query).select('-userPublic').populate('menuRef');

            res.status(200).json(resultNoveltie);
        }
        catch (error) {
            console.log(error);
            res.status(400).json({ error: error });
        }
    }




    /**
     * Novedades que REPORTÓ un usuario dentro de un rango de fechas.
     *
     * GET /novelties/by-user?userId=<id>&since=YYYY-MM-DD&until=YYYY-MM-DD
     *
     * Alimenta el cálculo de bonificación, así que devuelve dos cosas: el
     * listado con los datos de la validación de cada novedad, y el resumen ya
     * contado —cuántas aprobadas, rechazadas y sin decidir—.
     *
     * EL RESUMEN SE CUENTA ACÁ, NO EN EL CLIENTE
     *
     * Si el listado se paginara y el cliente sumara lo que recibe, el total
     * sería el de la página y no el del período. Contándolo acá, el resumen es
     * del rango completo aunque el listado venga recortado.
     *
     * EL DÍA `until` ENTRA COMPLETO
     *
     * Quien pide "del 1 al 15" espera que el 15 cuente. Cortar en la medianoche
     * del 15 perdería todo lo reportado ese día, que es justo el error por el
     * que a alguien le faltaría un bono.
     */
    getNoveltiesByUser = async (req: Request, res: any): Promise<void> => {
        try {
            const { userId, since, until } = req.query as Record<string, string>;

            if (!userId || !Types.ObjectId.isValid(userId)) {
                res.status(400).json({
                    status: 400, error: 'Bad request',
                    message: 'Se requiere "userId" válido.',
                });
                return;
            }

            const desde = since ? new Date(`${since}T00:00:00.000Z`) : null;
            const hasta = until ? new Date(`${until}T00:00:00.000Z`) : null;

            if ((desde && Number.isNaN(desde.getTime())) || (hasta && Number.isNaN(hasta.getTime()))) {
                res.status(400).json({
                    status: 400, error: 'Bad request',
                    message: 'Las fechas deben tener el formato YYYY-MM-DD.',
                });
                return;
            }
            if (desde && hasta && desde > hasta) {
                res.status(400).json({
                    status: 400, error: 'Bad request',
                    message: 'La fecha inicial no puede ser posterior a la final.',
                });
                return;
            }

            const query: any = { 'sharedByUser.user.id': new Types.ObjectId(userId) };

            if (desde || hasta) {
                query.createdAt = {};
                if (desde) query.createdAt.$gte = desde;
                if (hasta) {
                    // El día final entra entero: se corta al empezar el siguiente.
                    const finDelDia = new Date(hasta);
                    finDelDia.setUTCDate(finDelDia.getUTCDate() + 1);
                    query.createdAt.$lt = finDelDia;
                }
            }

            const novedades: any[] = await NoveltieModel
                .find(query)
                .populate('sharedByUser.user.id validationResult.validatedByUser.user.id establishment')
                .sort({ createdAt: -1 })
                // Fuera lo pesado y lo obsoleto: acá se cuenta y se revisa, no
                // se reproducen imágenes ni videos.
                .select('-fileNoveltie -isValidate -menu -userPublic -description -local -imageUrl -videoUrl -imageToShare')
                .lean();

            // `isApproved` puede venir true, false o sin definir, y los tres
            // significan cosas distintas: aprobada, rechazada y sin revisar.
            const aprobadas = novedades.filter(n => n?.validationResult?.isApproved === true).length;
            const rechazadas = novedades.filter(n => n?.validationResult?.isApproved === false).length;

            res.status(200).json({
                status: 200,
                userId,
                since: since || null,
                until: until || null,
                resumen: {
                    total: novedades.length,
                    aprobadas,
                    rechazadas,
                    sinValidar: novedades.length - aprobadas - rechazadas,
                },
                novelties: novedades,
            });
        }
        catch (err) {
            console.log(err);
            res.status(500).json({ status: 500, error: 'Error server internal', message: (err as Error).message });
        }
    };


    getNoveltiesFilter = async (req: Request, res: any): Promise<void> => {
        try {
            const name = req.params.local;
            const since = req.params.since;
            const until = req.params.until;
            const page: any = req.params.page;
            const query: any = { 'local.name': name };

            if (since !== '0' && until !== '0') {
                query.date = {
                    $gte: new Date(since).toISOString(),
                    $lt: new Date(until).toISOString()
                }
            }

            const searchPromise = await NoveltieModel
                .find(query)
                .populate('sharedByUser.user.id menuEditedBy.user.id validationResult.validatedByUser.user.id establishment')
                .sort({ $natural: -1 })
                .select('-fileNoveltie -isValidate -menu -userPublic -description -local')
                .skip(page * 10)
                .limit(10);

            const countPromise = await NoveltieModel.countDocuments(query);

            const [docs, count] = await Promise.all([searchPromise, countPromise]);

            res.json({ novelties: docs, collection: count });
        }
        catch (err) {
            console.log(err);
            res.status(400).json(err);
        }
    };






    getNoveltiesById = async (req: Request, res: any): Promise<void> => {
        try {
            const id = req.params.id;


            const noveltie = await NoveltieModel.find({ _id: id })


            res.json(noveltie);
        }
        catch (err) {
            console.log(err);
            res.status(500).send('Error server internal.');
        }
    };






    getNoveltiesPaginate = async (req: Request, res: any): Promise<void> => {
        try {
            const page: any = req.params.page;
            const numberItems: any = req.params.items;

            // Filtro por estado de validación (opcional; sin él trae todas):
            //   validadas   → validationResult.isApproved === true
            //   invalidadas → validationResult.isApproved === false
            //   ignoradas   → isApproved ausente/null (nadie la validó aún)
            const state: any = req.query.state;
            let filter: any = {};
            if (state === 'validadas') filter = { 'validationResult.isApproved': true };
            else if (state === 'invalidadas') filter = { 'validationResult.isApproved': false };
            else if (state === 'ignoradas') filter = { $or: [{ 'validationResult.isApproved': null }, { 'validationResult.isApproved': { $exists: false } }] };

            const noveltiesPaginate = await NoveltieModel.find(filter).sort({ $natural: -1 }).skip(page * numberItems).limit(numberItems)
            return res.json(noveltiesPaginate);
        }
        catch (err) {
            console.log(err);
            res.status(500).send('Error server internal.');
        }
    };




    getNoveltieImgById = async (req: Request, res: any): Promise<void> => {
        try {
            const id = req.params.id;
            const noveltie = await NoveltieModel.find({ _id: id }).populate('fileNoveltie sharedByUser.user.id menuEditedBy.user.id validationResult.validatedByUser.user.id establishment')
            res.json(noveltie);
        }
        catch (err) {
            console.log(err);
            res.status(500).send('Error server internal.');
        }
    };





    findAndSelectMenu = async (req: Request, res: any): Promise<void> => {
        try {
            const id = req.params.id;
            const menu = await NoveltieModel.find({ _id: id }).select('menu');
            res.json(menu);
        }
        catch (err) {
            console.log(err);
            res.status(500).send('Error server internal');
        }
    };





    createNovelties = async (req: any, res: any): Promise<void> => {
        try {

            if (!req.headers['source-application'] || !req.headers['version-app']) {
                const error: any = new Error('The origin name and the app version are missing in the header.');
                error.details = {
                    code: 400,
                    info: "Información adicional"
                };
                throw error;
            }

            const newBodyRequest = req.body
            const novelties = req;

            console.log(novelties.body)

            if (!Types.ObjectId.isValid(novelties.body.alertId)) return res.status(400).json({ error: 'the objectId in the alertConfig property is invalid' })

            const resultMenu = await MenuModel.findOne({ _id: novelties.body.alertId });

            //    if(!resultMenu) return res.status(400).json({ error: 'The result of the title property is not registered in the system' })


            // ══════════════════════════════════════════════════════════
            // UN LOCAL SIN CÁMARAS NO PUEDE REPORTAR NADA
            // ══════════════════════════════════════════════════════════
            // Si el establecimiento tiene una caída de DVR abierta, lo único que
            // se le acepta es la alerta que dice que la conexión VOLVIÓ.
            //
            // No es un capricho: sin cámaras no hay nada que ver, así que
            // cualquier otra alerta que entre en ese rato o viene de otra fuente
            // o está mal cargada. Y sobre todo, dejarlas pasar ensucia el
            // historial justo en el tramo en que el local estaba ciego, que es
            // el que después se usa para explicar por qué no reportó.
            //
            // La alerta de restablecimiento se reconoce por `Menu.dvrEffect ===
            // 'up'`, del catálogo. Hasta ahora eso vivía como un `_id` escrito a
            // mano en el front; ver la nota en menu.model.
            //
            // El efecto se resuelve en dos pasos: el catálogo manda
            // (`Menu.dvrEffect`) y, si no dice nada, se cae a los DOS `_id`
            // históricos — los mismos que Jarvis-express reconoce a mano desde
            // 2023. Sin ese respaldo la compuerta quedaba dormida: el campo es
            // nuevo, nadie lo marcó, y cualquier alerta pasaba con el local
            // caído.
            const idLocal = novelties.body.localId;
            const efectoDvr = resolveDvrEffect({
                alertId: novelties.body.alertId,
                dvrEffect: resultMenu?.dvrEffect,
            });

            if (idLocal && Types.ObjectId.isValid(String(idLocal)) && efectoDvr !== 'up') {

                const caidaAbierta = await DvrFailureModel
                    .findOne({ local: idLocal, active: true })
                    .select('localName failedAt reportedByName')
                    .lean();

                if (caidaAbierta) {
                    // La llave: una alerta capaz de reabrir el local. Vale la
                    // marcada en el catálogo o la legada por `_id` — si no
                    // existe NINGUNA, el candado no se echa, porque cerrarlo
                    // sin llave deja al local mudo para siempre.
                    const hayComoDesbloquear = Boolean(
                        await MenuModel.exists({ $or: [
                            { dvrEffect: 'up' },
                            { _id: ALERTA_DVR_LEGADA.up },
                        ] }),
                    );

                    if (debeRechazarLaAlerta({
                        dvrEffect: efectoDvr,
                        hayCaidaAbierta: true,
                        hayComoDesbloquear,
                    })) {
                        const desde = moment.tz(caidaAbierta.failedAt, REPORT_TZ).format('HH:mm');

                        // 409: no es que la petición esté mal formada —lo estaría
                        // igual mañana—, es que CHOCA con el estado actual del
                        // establecimiento. `code` viaja aparte del texto para que
                        // el cliente pueda distinguirlo de cualquier otro 409 sin
                        // leer el mensaje.
                        return res.status(409).json({
                            status: 409,
                            error: 'conflict',
                            code: 'DVR_DOWN',
                            message: `${caidaAbierta.localName || 'Este establecimiento'} tiene una falla de conexión con el DVR desde las ${desde}. No se pueden enviar alertas hasta que se reporte el restablecimiento de la conexión.`,
                            dvrFailure: {
                                localName: caidaAbierta.localName ?? '',
                                failedAt: caidaAbierta.failedAt,
                                failedAtLabel: desde,
                                reportedByName: caidaAbierta.reportedByName ?? '',
                            },
                        });
                    }
                }
            }

            // `shift` no se toca acá: conserva el valor por defecto del modelo.
            // Es la propiedad de siempre y jarvis-reportes depende de ella, así
            // que no se cambia su significado. Se asigna al validar, desde los
            // botones de turno del componente Noveltie.

            const newNoveltie = new NoveltieModel({

                date: Date(),

                title: novelties.body.title,
                table: novelties.body.table,

                menu: novelties.body.menu,


                isValidate: {
                    validation: 'null',
                    for: null
                },

                local: { //DEPRECATED, USE establishment property instead
                    name: novelties.body.localName,
                    idLocal: novelties.body.localId,
                    lang: novelties.body.lang
                },


                establishment: novelties.body.localId,

                sharedByUser: {
                    createdAt: Date.now(),
                    user: {
                        nameUser: req.session.name,
                        id: req.session.userId
                    },

                    requestOrigin: {
                        applicationName: req.headers['source-application'],
                        version: req.headers['version-app']
                    },
                    commentByUser: novelties.body.description
                },


                imageToShare: novelties.body.imageToShare,
                imageUrl: novelties.body.imageUrl ? novelties.body.imageUrl : null,
                videoUrl: novelties.body.videoUrl,
                menuRef: novelties.body.alertId ? new Types.ObjectId(novelties.body.alertId) : null,
            });

            if (novelties.body.numberTiket) newNoveltie.orderTicketNumber = novelties.body.numberTiket;
            if (novelties.body.timePeriod) newNoveltie.timePeriod = novelties.body.timePeriod;
            if (novelties.body.nameDish) newNoveltie.nameDish = novelties.body.nameDish;

            if(novelties.body.amount) newNoveltie.amount = novelties.body.amount;
            if(novelties.body.manager) newNoveltie.manager = novelties.body.manager;

            if ('for_the_report' in novelties.body) newNoveltie.for_the_report = novelties.body.for_the_report;

            const resultNovelty = await newNoveltie.save();


            newBodyRequest.idCategory = resultNovelty._id;
            const result = await publisher.createPublication(newBodyRequest);
            

            if (io) {
                
              

                io.emit(
                    'created_Alert',
                    { doc: result, user: { idUser: req.session.userId, nameUser: `${req.session.name}` } }
                );
            }

            return res.json(result);
        }
        catch (error: any) {
            console.log(error);
            if (error.details?.code) return res.status(error.details?.code).json({ error: error.message });
            res.status(500).json({ error: error, message: 'Error server internal', status: 500 })
        };
    };




    saveNovelty = async (req: any, res: any): Promise<void> => {
        try {
            if (req.files.video[0].length < 1) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Video is requiered' })
            const videoUrl = process.env.NODE_ENV === 'development' ? `https://amazona365.ddns.net:3006${nameApi}/novelty/video=${req.files.video[0].filename}` : `https://amazona365.ddns.net/api_jarvis/v1/novelty/video=${req.files.video[0].filename}`;
            res.status(200).json({ url: videoUrl })
        }
        catch (error: any) {
            console.log(error);
            if (error.details?.code) return res.status(error.details?.code).json({ error: error.message });
            res.status(500).send('Error server internal.');
        }
    }



    findFileImg = async (req: any, res: any): Promise<void> => {
        try {
            const paramsImg = req.params.img;
            const paramsVideo = req.params.video;


            if (paramsImg) {
                const pathFile = join(documentsPath, `/imagen_clientApp/imageNovelty/${paramsImg}`);

                await fs.promises.access(pathFile, fs.constants.F_OK);

                res.sendFile(pathFile);
            }
            else if (paramsVideo) {
                const pathFile = join(documentsPath, `/imagen_clientApp/video/${paramsVideo}`);
                await fs.promises.access(pathFile, fs.constants.F_OK);
                res.sendFile(pathFile);
            }

        }
        catch (error) {
            console.log(error);
            res.status(404).json({ error: 'File not found', status: 404 })
        }
    };




    updateNovelties = async (req: any, res: any): Promise<void> => {
        try {
            if (!req.headers['source-application'] || !req.headers['version-app']) {
                const error: any = new Error('The origin name and the app version are missing in the header.');
                error.details = {
                    code: 400,
                    info: "Bad request"
                };
                //throw error;
            }

            const id = req.params.id;
            const body = req.body;

            if (!Types.ObjectId.isValid(id)) return res.status(400).error({ error: 'the objectId in the id param is invalid' });
            const findNovelty = await NoveltieModel.findOne({ _id: id });
            if (!findNovelty) return res.status(404).json({ error: 'Document not found' });


            if (body.validationResult) {
                body.validationResult = {
                    ...body.validationResult,
                    updatedAt: Date.now(),
                    validatedByUser: {
                        user: {
                            nameUser: req.session.name,
                            id: new Types.ObjectId(req.session.userId)
                        },
                        requestOrigin: {
                            applicationName: req.headers['source-application'] ?? 'APP-LEGACY',
                            version: req.headers['version-app'] ?? 'APP-LEGACY'
                        }
                    }
                }
            }


            // ══════════════════════════════════════════════════════════
            // SELLADO DE LA BONIFICACIÓN
            // ══════════════════════════════════════════════════════════
            // Solo al APROBAR, y solo la primera vez.
            //
            // AL APROBAR: antes de eso no hay nada que evaluar —el corte descarta
            // las no aprobadas— y un RECHAZO no debe sellar. Un rechazo se puede
            // revertir, y con `applies: null` no hay que decidir después si el
            // sello se sobrescribe. Ojo con la diferencia: `applies: false` NO es
            // "la rechazaron", es "la aprobaron y esta alerta no bonifica".
            //
            // LA PRIMERA VEZ: sin esa guarda, cada edición posterior volvería a
            // resolver con el valor del bono de HOY, que es exactamente lo que
            // congelar existe para evitar.
            const seVaAAprobar = body?.validationResult?.isApproved === true;
            const yaEstaSellada = findNovelty.bonus?.applies !== null
                && findNovelty.bonus?.applies !== undefined;

            if (seVaAAprobar && !yaEstaSellada) {
                const sello = await buildBonusSeal(findNovelty);

                // `null` = no se pudo resolver. Se deja sin sellar a propósito:
                // `applies: null` significa "no se evaluó" y se puede reprocesar,
                // mientras que un sello a medias queda congelado y mintiendo.
                if (sello) body.bonus = sello;
            }


            const updateDocument = await NoveltieModel.findOneAndUpdate({ _id: id }, body, { new: true, runValidators: true }).populate('sharedByUser.user.id menuEditedBy.user.id validationResult.validatedByUser.user.id establishment');


            if (io) {
                io.emit(
                    'document_updated',
                    { doc: updateDocument, user: { idUser: req.session.userId, nameUser: `${req.session.name}` } }
                );
            }

            // Si con este update la novedad quedó VALIDADA + ENVIADA AL GRUPO
            // (el mismo criterio que usa el corte de silencio) y antes no lo
            // estaba, el aviso rojo del local se limpia AL INSTANTE: se apaga
            // el flag durable y se avisa al front. Nunca rompe la respuesta.
            try {
                const wasCounted = Boolean(findNovelty.validationResult?.isApproved)
                    && Boolean(findNovelty.sharedByAmazonActive || findNovelty.givenToTheGroup);
                const isCounted = Boolean(updateDocument?.validationResult?.isApproved)
                    && Boolean(updateDocument?.sharedByAmazonActive || updateDocument?.givenToTheGroup);

                if (!wasCounted && isCounted) {
                    const idLocal = String(updateDocument?.establishment?._id ?? updateDocument?.local?.idLocal ?? '');
                    if (idLocal) {
                        const cleared = await MonitoringStateModel.findOneAndUpdate(
                            { idLocal, 'noveltyCheck.flagged': true },
                            { $set: { 'noveltyCheck.flagged': false } },
                        );
                        if (cleared && io) {
                            io.emit('monitoring-silence-clear', { idLocal, name: cleared.name, at: new Date().toISOString() });
                        }
                    }
                }
            }
            catch (silenceError: any) {
                console.log(colors.yellow(`[novelty-silence] no se pudo limpiar el aviso del local: ${silenceError?.message ?? silenceError}`));
            }


            return res.status(200).json(updateDocument);
        }
        catch (error: any) {
            console.log(error);
            if (error.details?.code) return res.status(error.details?.code).json({ error: error.message });

            res.status(500).json({ error: error });
        }
    };





    setComment = asyncHandler(async (req: any, res: Response) => {
        const id: string | undefined = req.query?.id;

        if (!id) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id is undefined' });
        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id is invalid' });

        const body = req.body;
        body.user = req.session?.userId;

        const bodyValidate = await commentYupSchema.validate(body);

        const alertFound = await NoveltieModel.findById(id);

        return res.json(alertFound);


        const novelty = await NoveltieModel.findByIdAndUpdate(id, { $push: { commentSystem: bodyValidate } }, { new: true, runValidators: true });

        if (!novelty) return res.status(404).json({ status: 404, error: 'Document not found', message: `T he document with the following ID does not exist, ${id}` });

        console.log(bodyValidate);
        return res.json(novelty);

    });


    /**
     * EL LIBRO DE BONOS DE UN RANGO.
     *
     *   /noveltie/bonos/since=2026-08-01/until=2026-08-16
     *                  /operador=0/local=0/agrupar=operador
     *
     * Los tres últimos aceptan `0` como "todos", igual que en el resto de las
     * rutas de este archivo.
     *
     *
     * DEVUELVE EL AGRUPADO, NO LAS NOVEDADES.
     *
     * Tres meses son del orden de cien mil documentos con imágenes y
     * validaciones adentro; agrupados por (día, turno, local, operador,
     * alerta) quedan unos pocos miles de filas. Mandar los documentos crudos
     * no es "más flexible": es la forma segura de quedarse sin memoria en el
     * server y de colgar el navegador después. Mongo hace el trabajo y este
     * proceso nunca ve una novedad.
     *
     * `agrupar` decide el tamaño de la respuesta:
     *
     *     agrupar=operador       ~60 filas    el resumen general
     *     agrupar=alerta         ~84 filas    el top de alertas
     *     agrupar=dia,operador  ~5.000 filas  la serie del período
     *     agrupar=0             ~9.000 filas  el detalle completo
     *
     * OJO: hace falta un índice sobre `date` en la colección. Sin él este
     * $match recorre todo y ahí sí se cae el servidor:
     *
     *     db.noveltie.createIndex({ date: 1 })
     *     db.noveltie.createIndex({ 'sharedByUser.user.id': 1, date: 1 })
     *     db.noveltie.createIndex({ establishment: 1, date: 1 })
     */
    getBonusLedger = async (req: Request, res: any): Promise<void> => {
        try {
            const { since, until, operador, local, agrupar } = req.params;

            const error = (status: number, error: string, message: string, extra: any = {}) =>
                res.status(status).json({ status, error, message, ...extra });


            // ── 1. El rango ───────────────────────────────────────────
            // Obligatorio y con tope. Sin tope, un `since` de 2020 recorre la
            // colección entera y no hay índice que lo salve. Se valida acá,
            // antes de tocar Mongo: un rango absurdo cuesta un 400 y nada más.
            const desde = new Date(`${since}T00:00:00`);
            const hasta = new Date(`${until}T23:59:59.999`);

            if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) {
                return error(400, 'Bad request', 'Las fechas tienen que venir como AAAA-MM-DD.');
            }

            if (desde > hasta) {
                return error(400, 'Bad request', 'La fecha inicial tiene que ser anterior a la final.');
            }

            const dias = Math.round((hasta.getTime() - desde.getTime()) / UN_DIA) + 1;

            if (dias > LEDGER_MAX_DIAS) {
                return error(400, 'Bad request', `El rango pide ${dias} días y el máximo es ${LEDGER_MAX_DIAS}.`);
            }


            // ── 2. El filtro ──────────────────────────────────────────
            // Va primero en la consulta y es lo único que puede usar índice,
            // así que todo lo que se pueda filtrar acá NO se filtra después.
            const query: any = { date: { $gte: desde, $lte: hasta } };

            if (operador !== '0') {
                if (!Types.ObjectId.isValid(operador)) {
                    return error(400, 'Bad request', `El operador "${operador}" no es un identificador válido.`);
                }
                query['sharedByUser.user.id'] = new Types.ObjectId(operador);
            }

            if (local !== '0') {
                if (!Types.ObjectId.isValid(local)) {
                    return error(400, 'Bad request', `El local "${local}" no es un identificador válido.`);
                }
                // Los dos lugares donde puede estar, según la edad del documento.
                query.$or = [
                    { establishment: new Types.ObjectId(local) },
                    { 'local.idLocal': new Types.ObjectId(local) },
                ];
            }


            // ── 3. Las columnas del agrupado ──────────────────────────
            // Lista cerrada: sus nombres entran al $group, y aceptar texto
            // libre sería dejar que quien llama arme pedazos de la consulta.
            const pedidas = agrupar === '0' ? [] : String(agrupar).split(',').map(c => c.trim());
            const invalida = pedidas.find(c => !LEDGER_COLUMNAS[c]);

            if (invalida) {
                return error(400, 'Bad request',
                    `"${invalida}" no es una columna agrupable. Las que hay: ${Object.keys(LEDGER_COLUMNAS).join(', ')}.`);
            }

            // Sin nada pedido se agrupa por todas, o sea el detalle completo.
            const columnas = Object.keys(LEDGER_COLUMNAS)
                .filter(c => pedidas.length === 0 || pedidas.includes(c));

            const claves = (prefijo: string) =>
                Object.fromEntries(columnas.map(c => [c, `${prefijo}${c}`]));


            // ── 4. Contar antes de agrupar ────────────────────────────
            // El conteo usa el índice y es barato. Si el rango trae una
            // barbaridad, mejor decirlo con el número que dejar la agregación
            // corriendo diez minutos para caerse igual.
            const novedades = await NoveltieModel.countDocuments(query);

            if (novedades > LEDGER_MAX_NOVEDADES) {
                return error(413, 'Payload too large',
                    `El rango abarca ${novedades} novedades, más de las que se pueden agrupar de una. `
                    + 'Achicá el rango o filtrá por operador o establecimiento.',
                    { novedades, maximo: LEDGER_MAX_NOVEDADES });
            }


            // ── 5. La agregación ──────────────────────────────────────
            // `allowDiskUse` no es opcional: un $group sobre tres meses pasa
            // el límite de 100 MB por etapa y tira justo cuando el rango es
            // grande, que es cuando más se necesita.
            const filas = await NoveltieModel.aggregate([

                { $match: query },

                // Proyección temprana: de acá en adelante Mongo mueve un
                // puñado de campos por documento en vez del documento entero,
                // imágenes incluidas. Y solo las columnas pedidas: agrupar por
                // operador no necesita la fecha de cien mil documentos.
                {
                    $project: {
                        _id: 0,
                        ...Object.fromEntries(columnas.map(c => [c, LEDGER_COLUMNAS[c]])),
                        // `applies` en true es el único caso que paga. Un null
                        // es "todavía no se evaluó", no "vale cero".
                        bono: {
                            $cond: [
                                { $eq: ['$bonus.applies', true] },
                                { $ifNull: ['$bonus.bonusPerAlert', 0] },
                                0,
                            ],
                        },
                        sellada: { $cond: [{ $eq: [{ $type: '$bonus.applies' }, 'bool'] }, 1, 0] },
                    },
                },

                {
                    $group: {
                        _id: claves('$'),
                        alertas: { $sum: 1 },
                        bonos: { $sum: '$bono' },
                        selladas: { $sum: '$sellada' },
                    },
                },

                // El orden se decide acá y no en el cliente: ordenar miles de
                // filas en el navegador es trabajo que Mongo ya tiene hecho.
                { $sort: Object.fromEntries(columnas.map(c => [`_id.${c}`, 1])) },

                {
                    $project: {
                        _id: 0,
                        ...claves('$_id.'),
                        alertas: 1,
                        bonos: 1,
                        selladas: 1,
                    },
                },

            ]).allowDiskUse(true);


            // ── 6. La respuesta ───────────────────────────────────────
            const catalogos = await this.getLedgerNames(filas);

            res.json({
                status: 200,
                rango: { desde, hasta, dias, maximoDias: LEDGER_MAX_DIAS },
                agrupadoPor: columnas,
                totales: {
                    novedades,
                    filas: filas.length,
                    bonos: filas.reduce((suma: number, f: any) => suma + (f.bonos || 0), 0),
                    selladas: filas.reduce((suma: number, f: any) => suma + (f.selladas || 0), 0),
                },
                catalogos,
                filas,
            });
        }
        catch (err) {
            console.log(err);
            res.status(500).json({
                status: 500,
                error: 'Internal server error',
                message: 'No se pudo armar el libro de bonos.',
            });
        }
    };






    /**
     * Los nombres de los ids que aparecieron, una sola vez cada uno.
     *
     * Es la diferencia entre mandar "Bocas Grill Doral" nueve mil veces y
     * mandarlo una: sobre un resultado así, repetir los nombres en cada fila
     * más que duplica el JSON. Son tres consultas chicas por `$in`, no un
     * `$lookup` por fila.
     */
    private getLedgerNames = async (filas: any[]): Promise<any> => {

        const idsDe = (columna: string) =>
            [...new Set(filas.map(f => f[columna]).filter(Boolean).map(String))];

        // Sin ids no se consulta: agrupar por operador no necesita el catálogo
        // de locales, y un `$in: []` es una consulta que igual va y vuelve.
        const buscar = (ids: string[], consulta: any) => (ids.length ? consulta : []);

        const [locales, operadores, alertas] = await Promise.all([
            buscar(idsDe('local'), LocalModel.find({ _id: { $in: idsDe('local') } }).select('name').lean()),
            buscar(idsDe('operador'), UserModel.find({ _id: { $in: idsDe('operador') } }).select('name surName').lean()),
            buscar(idsDe('alerta'), MenuModel.find({ _id: { $in: idsDe('alerta') } }).select('es en category').lean()),
        ]);

        const porId = (lista: any[], nombre: (x: any) => any) =>
            Object.fromEntries(lista.map(x => [String(x._id), nombre(x)]));

        return {
            locales: porId(locales as any[], (l: any) => l.name ?? null),
            operadores: porId(operadores as any[], (u: any) => [u.name, u.surName].filter(Boolean).join(' ') || null),
            alertas: porId(alertas as any[], (m: any) => ({ es: m.es ?? null, en: m.en ?? null, category: m.category ?? null })),
        };
    };



    /**
     * LAS ALERTAS DE UN ESTABLECIMIENTO EN EL DÍA.
     *
     *   /noveltie/establecimiento/id=<idLocal>/dia=0
     *
     * `dia=0` es hoy; cualquier otro valor es una fecha `AAAA-MM-DD`.
     *
     * Devuelve lo justo para una lista desplegable: qué alerta fue, a qué hora
     * y cómo quedó la validación. Nada de imágenes, videos ni comentarios —es
     * lo que se abre al tocar una fila, no la ficha de la novedad.
     *
     *
     * EL MISMO DÍA QUE LOS CONTEOS DE LA FILA
     *
     * Usa `getOperationalDay` —de 08:00 a 07:00 del día siguiente— que es el
     * que ya usan el reporte y los conteos que la fila muestra al lado. Si acá
     * se usara el día civil, el desplegable mostraría siete alertas donde el
     * contador dice nueve, y eso se lee como que el sistema está roto.
     *
     * Por lo mismo el establecimiento se busca en los DOS lugares donde puede
     * estar: `establishment` en los documentos vigentes, `local.idLocal` en
     * los viejos.
     */
    getNoveltiesOfLocalByDay = async (req: Request, res: any): Promise<void> => {
        try {
            const { id, dia } = req.params;

            if (!Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    status: 400,
                    error: 'Bad request',
                    message: `El establecimiento "${id}" no es un identificador válido.`,
                });
            }

            // El día operativo pedido. Sin fecha, el de ahora.
            const referencia = dia && dia !== '0' ? moment.tz(dia, 'YYYY-MM-DD', REPORT_TZ).hour(12) : undefined;

            if (referencia && !referencia.isValid()) {
                return res.status(400).json({
                    status: 400,
                    error: 'Bad request',
                    message: `La fecha "${dia}" no es válida. Se espera AAAA-MM-DD, o 0 para hoy.`,
                });
            }

            const { start, end } = getOperationalDay(referencia);

            const idLocal = new Types.ObjectId(id);
            const query: any = {
                date: { $gte: start.toDate(), $lt: end.toDate() },
                $or: [{ establishment: idLocal }, { 'local.idLocal': idLocal }],
            };

            // Se proyecta lo que se va a mostrar y nada más. Una novedad
            // completa trae imágenes, video y comentarios: traer cincuenta de
            // esas para pintar una lista de tres columnas es mover megabytes
            // para mostrar texto.
            const novedades = await NoveltieModel
                .find(query)
                .select('title date shift validationResult.isApproved validationResult.detail sharedByUser.user.nameUser')
                .sort({ date: 1 })
                .lean();

            const alertas = novedades.map((n: any) => ({
                id: String(n._id),
                title: n.title ?? null,
                hora: n.date ?? null,
                turno: n.shift ?? null,
                operador: n.sharedByUser?.user?.nameUser ?? null,
                // Tres estados, no dos: `null` es "todavía nadie la miró", que
                // no es lo mismo que rechazada.
                validacion: typeof n.validationResult?.isApproved === 'boolean'
                    ? (n.validationResult.isApproved ? 'aprobada' : 'rechazada')
                    : 'sin validar',
                detalle: n.validationResult?.detail ?? null,
            }));

            res.json({
                status: 200,
                dia: { desde: start.toDate(), hasta: end.toDate() },
                resumen: {
                    total: alertas.length,
                    aprobadas: alertas.filter(a => a.validacion === 'aprobada').length,
                    rechazadas: alertas.filter(a => a.validacion === 'rechazada').length,
                    sinValidar: alertas.filter(a => a.validacion === 'sin validar').length,
                },
                alertas,
            });
        }
        catch (err) {
            console.log(err);
            res.status(500).json({
                status: 500,
                error: 'Internal server error',
                message: 'No se pudieron traer las alertas del establecimiento.',
            });
        }
    };

};