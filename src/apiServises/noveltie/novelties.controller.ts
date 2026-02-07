import colors from 'colors';
import os from 'os';
import  NoveltieModel, { CommentSchema } from './noveltie.model.js';
import { commentYupSchema } from './novelty.squema.js';

import MenuModel from '../menu/menu.model.js';
import FileNoveltieModel from './fileNoveltie.model.js';
import { join } from 'path';
import fs, { readFileSync } from 'fs';
import { Types } from 'mongoose';
import { config } from 'dotenv';
import * as url from 'url';
import nameApi from '../../libs/name_api.js';

import { Request, Response } from 'express';

import { Server } from 'socket.io';

//call servises publisher

import publisher from '../../services/publisher/publisher.layer.js';
import { IsDaylightSavingTimeBoolean } from '../time/time.model.js';
import session from 'express-session';
import { rejects } from 'assert';


config();


const __dirname: string =  url.fileURLToPath(new URL('.', import.meta.url));
const documentsPath: any = process.env.DEBUG === 'true' ? '\\\\72.68.60.254\\d' : 'D:\\';



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
            const result = await NoveltieModel.find(query).select('-fileNoveltie')
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

            const resultNoveltie = await NoveltieModel.find(query).select('-rulesForBonus -userPublic').populate('menuRef');

            res.status(200).json(resultNoveltie);
        }
        catch (error) {
            console.log(error);
            res.status(400).json({ error: error });
        }
    }




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
                .sort({ $natural: -1 })
                .select('-fileNoveltie -rulesForBonus -isValidate -menu -userPublic -description -local')
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

            const noveltiesPaginate = await NoveltieModel.find({}).sort({ $natural: -1 }).skip(page * numberItems).limit(numberItems)
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
            const noveltie = await NoveltieModel.find({ _id: id }).populate('fileNoveltie')
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

        /*
            let rules: any // LOGIC IS DEPRECATED
            if (novelties.body.rulesForBonus === 'undefined' || novelties.body.rulesForBonus === undefined || novelties.body.rulesForBonus === null) {
                rules = {
                    worth: 0,
                    amulative: 0
                }
            }
            else {

                rules = novelties.body.rulesForBonus;
            }

            */

            const newNoveltie = new NoveltieModel({

                date: Date(),

                title: novelties.body.title,
                table: novelties.body.table,

                menu: novelties.body.menu,

              
                isValidate: {
                    validation: 'null',
                    for: null
                },

                local: {
                    name: novelties.body.localName,
                    idLocal: novelties.body.localId,
                    lang: novelties.body.lang
                },

                 /*
                userPublic: {
                    name: novelties.body.userName,
                    userId: novelties.body.userId,
                },
               
                rulesForBonus: {
                    worth: rules.worth,
                    amulative: rules.amulative
                },
                */

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
                menuRef: novelties.body.alertId ? new Types.ObjectId(novelties.body.alertId) : null
            });

            if (novelties.body.numberTiket) newNoveltie.orderTicketNumber = novelties.body.numberTiket;
            if (novelties.body.timePeriod) newNoveltie.timePeriod = novelties.body.timePeriod;
            if (novelties.body.nameDish) newNoveltie.nameDish = novelties.body.nameDish;
         
            if (novelties.body.amount) newNoveltie.amount = novelties.body.amount;

            if ('for_the_report' in novelties.body) newNoveltie.for_the_report = novelties.body.for_the_report;

            const resultNovelty = await newNoveltie.save();

            newBodyRequest.idCategory = resultNovelty._id;
            const result = await publisher.createPublication(newBodyRequest);


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
                            id: req.session.userId
                        },
                        requestOrigin: {
                            applicationName: req.headers['source-application'] ?? 'APP-LEGACY',
                            version: req.headers['version-app'] ?? 'APP-LEGACY'
                        }
                    }
                }
            }
            const updateDocument = await NoveltieModel.findOneAndUpdate({ _id: id }, body, { new: true, runValidators: true }); 
            if (this.socketAdapter) {   
                this.socketAdapter.emitToRoom(
                    'lobby',
                    'document_updated',
                    {doc: updateDocument, user:{ idUser: req.session.userId, nameUser: `${req.session.name}` }}
                );
            }


            return res.status(200).json(updateDocument);
        }
        catch (error: any) {
            console.log(error);
            if (error.details?.code) return res.status(error.details?.code).json({ error: error.message });

            res.status(500).json({ error: error });
        }
    };





    setComment = async (req: any, res: Response) => {
        try {
            const id: string | undefined = req.query?.id;
            
            if(!id) return res.status(400).json({  status: 400, error: 'Bad request', message: 'Id is undefined' });
            if(!Types.ObjectId.isValid(id)) return res.status(400).json({  status: 400, error: 'Bad request', message: 'Id is invalid' });

            const body = req.body;
            body.user = req.session?.userId;
            
            const bodyValidate = await commentYupSchema.validate(body);
            
            const alertFound = await NoveltieModel.findById(id);

            return res.json(alertFound);

            
            const novelty = await NoveltieModel.findByIdAndUpdate(id, { $push: { commentSystem: bodyValidate }}, {new: true, runValidators: true});

            if(!novelty) return res.status(404).json({ status: 404, error: 'Document not found', message: `T he document with the following ID does not exist, ${id}` });

            console.log(bodyValidate);
            return res.json(novelty);

        } 
        catch (error: any) {
            console.log(error)
            if(error.name === 'ValidationError') return res.status(400).json({ status: 400, error: error.errors, message: 'Bad request' });
            return res.status(500).json({ massege: 'Error erver internal', status: 500, error: error })
        }
    };
};