import express from 'express';
import { Types } from 'mongoose';
import DocumentDiaryModel from './document.model.js';
import documentConfigModel from './document.config.model.js';
import LocalModel from '../local/local.model.js';
import nameApi from '../../libs/name_api.js';
import { config } from 'dotenv';
import { join } from 'path';
import { io } from '../../services/socket/io.js';
import { validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import { uploadConfigReport, dirConfigImgReport, uploadReportDocument, dirPageImgReport } from '../../util/multer.js';
import SMU_MODEL from '../auth/auth.model.js';
import PageDocument from './page.model.js';
import DocumentModel from './document.model.js';
import { documentSchema, documentSchemaComplete, documentSchemaPartial } from '../../libs/schema/document.schema.js'
import shiftToEs from '../../libs/string/shitfToEs.js';


config();
const routerDocument = express.Router();




routerDocument.get(`${nameApi}/document/exit`, validateSession, async (req, res) => {
  try {

        const findTask = await SMU_MODEL.findOne({ idUser: req.session.userId});
        const d = await SMU_MODEL.findById(req.session?.activity?._id);

        if (console.log(req.session), console.log(d), !findTask) return res.status(404).json({error: 'Document not found',status: 404, message: 'The user does not have any tasks assigned'});
        const deletedElement = await SMU_MODEL.deleteOne({idUser: req.session.userId});

        const savedDelete = req.session.dataUser.activity;
        delete req.session.dataUser.activity;
    
        io.emit('jarvis365reporte-alert-receive', {title: 'Reporte finalizado',description: `${req.session.name} finalizó el reporte en ${savedDelete.SMU.establishmentName}, ${savedDelete.SMU.date}, turno: ${shiftToEs(savedDelete.SMU.shift)}`})

        return res.status(200).json({status: 200,message: 'Task eliminate',data: deletedElement});
    } 
    catch (a) {
        return console.log(a), res.status(500).json({status: 500, error: a,message: 'Error server internal' });
    }
}), 




routerDocument.get(`${nameApi}/document/paginate`, validateSession, async (req, res) => {  //  paginate 
    try {
        const { page, limit, date, franchise, establishment, shift } = req.query;
        if (!page || !limit) return res.status(400).json({ error: 'Bad request', status: 200, message: '' })


        const query = {};
        if (establishment) query.establishmentName = establishment;
        if (shift) query.shift = shift;
        if (date) query.date = date;

        const documents = await DocumentModel.find(query)
            .sort({ $natural: -1 })
            .skip(page * limit)
            .limit(limit);


        return res.status(200).json({ data: documents });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.post(`${nameApi}/document`, validateSession, async (req, res) => {
    try {
        const bodyValidate = await documentSchema.validate(req.body, { stripUnknown: true });

        const existTask = await SMU_MODEL.findOne({ idUser: req.session.userId });

        if (existTask) return res.status(409).json({ status: 409, message: 'the user is already in a task', error: 'conflict', data: existTask.SMU });

        const findConfig = await documentConfigModel.findOne({ idEstablesment: bodyValidate.establishmentId });

        const isExistsDocument = await DocumentModel.exists({ bodyValidate });

        const Document = new DocumentModel({
            ...bodyValidate,
            createdDocument: {
                nameUser: `${req.session.dataUser.name} ${req.session.dataUser.surName}`,
                _id: req.session.userId
            },
            pages: []
        });

        const document = await Document.save();

        const Task = new SMU_MODEL({
            idUser: req.session.userId,
            idDocument: document._id,
            SMU: bodyValidate
        });


        const task = await Task.save();
        req.session.dataUser.activity = task;

        io.emit('jarvis365reporte-alert-receive', { title: 'Reporte iniciado', description: `${req.session.name} ha iniciado un reporte en ${Task?.SMU?.establishmentName || Task?.SMU?.franchiseName}, ${Task?.SMU?.date}, turno: ${Task?.SMU?.shift}` });


        return res.status(200).json({ Document, task });
    }
    catch (error) {
        console.log(error);
        if (error?.name === 'ValidationError') return res.status(400).json({ status: 400, error, 'Bad request': error.message });
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});







routerDocument.get(`${nameApi}/document/resume/:id`, validateSession, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id params is undefined' });
        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });

        const existTask = await SMU_MODEL.findOne({ idUser: req.session.userId });
        console.log(existTask)
        if (existTask) return res.status(409).json({ status: 409, message: 'the user is already in a task', error: 'conflict', data: existTask.SMU });

        //const result = await DocumentDiaryModel.exists({ establishmentName, shift, date });

        const findDocument = await DocumentDiaryModel.findById(id)

        const task = new SMU_MODEL({
            idUser: req.session.userId,
            idDocument: findDocument._id,
            SMU: {
                shift: findDocument.shift,
                date: findDocument.date,
                establishmentName: findDocument?.establishmentName,
                establishmentId: findDocument?.establishmentId,
                franchiseName: findDocument?.franchiseName,
                franchiseId: findDocument?.franchiseId,
                type: findDocument.type
            }
        });

        findDocument.editedOrViewedBy = [...findDocument.editedOrViewedBy, { nameUser: `${req.session.dataUser.name} ${req.session.dataUser.surName}`, _id: req.session.userId }]
        await task.save();
        await findDocument.save();

        req.session.dataUser.activity = task;


        io.emit('jarvis365reporte-alert-receive', { title: 'Reporte reanudado', description: `${req.session.name} ha ingresado al reporte de ${task?.SMU?.establishmentName}, ${task?.SMU?.date}, turno: ${shiftToEs(task?.SMU?.shift)}`, _id: findDocument._id });

        return res.status(200).json({ status: 200, message: 'Task eliminate', data: task });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.get(`${nameApi}/document/:id`, validateSession, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id params is undefined' });

        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });

        console.log(req?.query?.populate)
        const result = await DocumentDiaryModel.findById(id).populate(req?.query?.populate);
        if (!result) return res.status(404).json({ error: 'Document not found', status: 404, message: 'it could have been eliminated or it does not exist' });

        return res.status(200).json(result);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.get(`${nameApi}/document/isExists/data`, validateSession, async (req, res) => {
    try {
        const { franchiseName, establishmentName, shift, date, type } = req.query;

        const query = {};
        if (franchiseName !== 'undefined') query.franchiseName = franchiseName;
        if (establishmentName !== 'undefined') query.establishmentName = establishmentName;

        if (!franchiseName && !establishmentName) return res.status(400).json({ error: 400, error: 'Bad request', message: 'franchiseName or establishmentName, query is undefined' });
        if (!shift || !date) return res.status(400).json({ error: 400, error: 'Bad request', message: 'shift,  date query is undefined' });

        const result = await DocumentDiaryModel.exists({ ...query, shift, date, type });
        return res.status(200).json({ result });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.get(`${nameApi}/document`, validateSession, async (req, res) => {
    try {
        const { date, shift, establishmentName, type, findByQuery } = req.query;
        const query = {};

        if (findByQuery) {
            query.date = date;
            query.shift = shift,
                query.establishmentName = establishmentName,
                query.type = type;
        }

        const result = await new DocumentDiaryModel.findOne(findByQuery);
        return res.status(200).json({ status: 200, message: 'ok', data: result });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});







routerDocument.put(`${nameApi}/document`, validateSession, async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id query is undefined' });
        if (Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'id is invelid' })

        const result = await DocumentDiaryModel.findByIdAndUpdate(id, req.body);

        return res.status(200).json({ status: 200, message: 'ok', data: result });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});


// documentSchemaComplete


routerDocument.put(`${nameApi}/document/update/:id`, validateSession, async (req, res) => {  //default
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id is undefined' });
        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });
        const exists = await DocumentDiaryModel.exists({ _id: id });
        if (!exists) return res.status(404).json({ error: 'Document not found', status: 404, message: `There is no document associated with the ${id} _id` });
        const validateData = await documentSchemaComplete.validate(req.body, { stripUnknown: true });
        if (validateData._id) delete validateData._id;
        const updateDocument = await DocumentDiaryModel.findByIdAndUpdate(id, validateData);

        return res.status(200).json({ updateDocument });
    }
    catch (error) {
        console.log(error)
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Bad request', status: 400, message: error.message })
        }
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.patch(`${nameApi}/document/update/:id`, validateSession, async (req, res) => {  //default
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id is undefined' });
        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });
        const exists = await DocumentDiaryModel.exists({ _id: id });
        if (!exists) return res.status(404).json({ error: 'Document not found', status: 404, message: `There is no document associated with the ${id} _id` });

        const validateData = await documentSchemaPartial.validate(req.body, { stripUnknown: true });
        if (validateData._id) delete validateData._id;

        const updateDocument = await DocumentDiaryModel.findByIdAndUpdate(id, { $set: validateData }, { new: true, runValidators: true });
        return res.status(200).json({ updateDocument, validateData });
    }
    catch (error) {
        console.log(error)
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Bad request', status: 400, message: error.message })
        }
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.put(`${nameApi}/document/addpage/:id`, validateSession, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id is undefined' });

        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });

        let document;
        const page = new PageDocument(req.body);


        if (page.unique) {
            document = await DocumentDiaryModel.findById(id).populate('pages');
            const indexPageUnique = document.pages.findIndex(item => item.type === page.type);
            if (indexPageUnique > -1) return res.status(400).json({ error: 400, message: 'Page duplicated', data: req.body, error: 'Bad request' });
        }

        document = await DocumentDiaryModel.findById(id);
        const resultPage = await page.save();
        document.pages.push(resultPage._id);

        await document.save();
        return res.status(200).json({ status: 200, message: 'ok', data: resultPage });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});



routerDocument.get(`${nameApi}/document/getPage/:id`, validateSession, async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id params is undefined' });
        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'id is inavalid' });


        const result = await PageDocument.findById(id);

        return res.status(200).json({ status: 200, message: 'ok', data: result });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.put(`${nameApi}/document/updatePage/:id`, validateSession, async (req, res) => {
    try {
        const id = req.params.id;
        const body = req.body;
        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id params is undefined' });
        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'id is inavalid' });

        let resulPage = await PageDocument.findById(id);
        resulPage.data = body.data;
        const page_save_result = await resulPage.save();

        return res.status(200).json({ status: 200, message: 'ok', data: page_save_result });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});



routerDocument.post(`${nameApi}/document/file`, validateSession, uploadReportDocument.single('file'), async (req, res) => {
    try {
        const file = req.file;

        const urlImg = process.env.NODE_ENV === 'production' ?
            `https://amazona365.ddns.net${nameApi}/document/page/img/file=${file.filename}`
            :
            `https://72.68.60.201:3006${nameApi}/document/page/img/file=${file.filename}`;


        return res.status(200).json({ status: 200, message: 'ok', urlFile: urlImg });

    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.put(`${nameApi}/document/updatePage-preshift/=:id/file`, validateSession, uploadReportDocument.single('file'), async (req, res) => {
    try {
        const id = req.params.id;
        const file = req.file;
        const body = req.body;

        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id params is undefined' });
        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'id is inavalid' });

        let resulPage = await PageDocument.findById(id);
        const newData = { ...resulPage }._doc;
        console.log(newData.data.preshift.result);
        const urlImg =
            process.env.NODE_ENV === 'production' ?
                `https://amazona365.ddns.net${nameApi}/document/page/img/file=${file.filename}`
                :
                `https://72.68.60.201:3006${nameApi}/document/page/img/file=${file.filename}`;

        if (body.index === '1') {
            newData.data.preshift.result.firt.image = urlImg;
        }
        else if (body.index === '2') {
            newData.data.preshift.result.second.image = urlImg;
        }

        delete newData._id;
        const updatePage = await PageDocument.findOneAndUpdate({ _id: id }, newData, { new: true });
        //const save_result = await resulPage.save();


        console.log(newData.data.preshift.result);
        return res.status(200).json({ status: 200, message: 'ok', data: updatePage });

    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.put(`${nameApi}/document/updatePage=:id/file/`, validateSession, uploadReportDocument.single('file'), async (req, res) => {
    try {
        const id = req.params.id;
        const file = req.file;
        const body = req.body;  //


        if (!id) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id params is undefined' });
        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'id is inavalid' });

        let resulPage = await PageDocument.findById(id);
        const urlImg =
            process.env.NODE_ENV === 'production' ?
                `https://amazona365.ddns.net${nameApi}/document/page/img/file=${file.filename}`
                :
                `https://72.68.60.201:3006${nameApi}/document/page/img/file=${file.filename}`;


        if (!resulPage?.data?.img) resulPage.data.img = [];
        const newData = { ...resulPage.data, img: [...resulPage.data.img] };
        newData.img[body.index] = urlImg;
        resulPage.data = newData;

        const page_save_result = await resulPage.save();
        return res.status(200).json({ status: 200, message: 'ok', data: page_save_result });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.delete(`${nameApi}/document`, validateSession, validateSessionAndUserSuper, async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Bad request', message: 'id of document is undefined', status: 400 });
        if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Bad request', message: 'Id is invalid', status: 400 });

        const findDocumentAndDelete = await DocumentDiaryModel.findByIdAndDelete(id)
        if (!findDocumentAndDelete) return res.status(404).json({ error: 'Document not found', message: 'The document does not exist or is no longer available', status: 404 });

        if (typeof io !== undefined) io.emit('delete-document', { _id: findDocumentAndDelete._id });

        const deletesPages = await DocumentDiaryModel.deleteMany({ _id: { $in: findDocumentAndDelete.pages } });

        return res.status(200).json({ findDocumentAndDelete, deletesPages });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.get(`${nameApi}/document/page/img/file=:filename`, async (req, res) => {
    try {
        const { filename } = req.params;
        console.log(dirPageImgReport)
        const pathFile = join(dirPageImgReport, `/${filename}`);
        return res.sendFile(pathFile);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.delete(`${nameApi}/document/Page/document=:idDocument/page=:idPage`, validateSession, async (req, res) => {
    try {
        const idDocument = req.params.idDocument;
        const idPage = req.params.idPage;

        if (!idDocument || !idPage) return res.status(400).json({ error: 400, error: 'Bad request', message: 'id params is undefined' });
        if (!Types.ObjectId.isValid(idDocument) || !Types.ObjectId.isValid(idPage)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'id is inavalid' });

        const document = await DocumentDiaryModel.findById(idDocument);
        if (!document) return res.status(404).json({ error: 'Document not fount', status: 404, message: 'The requested document does not exist' });
        document.pages = document.pages.filter(page => page.toString() !== idPage);


        const resultDeletePageInDocument = await document.save();

        return res.status(200).json({ status: 200, message: 'ok', data: resultDeletePageInDocument });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




/////////////////////////           DOCUMENT          ////////////////////////////////



routerDocument.get(`${nameApi}/document/config/:id`, validateSession, async (req, res) => {
    try {
        const idParams = req.params.id;
        if (!Types.ObjectId.isValid(idParams)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });

        const result = await documentConfigModel.findOne({ idEstablesment: idParams });
        if (!result) return res.status(404).json({ status: 404, error: 'Not found', message: 'Document not found' });


        return res.send(result);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.post(`${nameApi}/document/config/establishment=:id`, validateSession, async (req, res) => {
    try {
        const idDocumentParams = req.params.id;
        const body = req.body;
        if (!Types.ObjectId.isValid(idDocumentParams)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });

        const existsDocument = await LocalModel.findById({ _id: idDocumentParams });
        if (!existsDocument) return res.status(404).json({ status: 404, error: 'Not found', message: 'Document not found' });


        const newDocumentConfig = new documentConfigModel(body);
        const saveNewDocument = await newDocumentConfig.save();

        existsDocument.config_report = newDocumentConfig._id;
        existsDocument.save();

        return res.status(200).json({ status: 200, data: saveNewDocument });

    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.put(`${nameApi}/document/config/:id`, validateSession, async (req, res) => {
    try {
        const idDocumentParams = req.params.id;
        const body = req.body;
        if (!Types.ObjectId.isValid(idDocumentParams)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });

        const result = await documentConfigModel.findByIdAndUpdate(idDocumentParams, body);
        return res.status(200).json({ status: 200, message: 'sucessfull', data: result })
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});


/*

routerDocument.put(`${nameApi}/document/config/:id`, validateSession, async (req, res) => {
    try {
        const idDocumentParams = req.params.id;
        const body = req.body;
        if (!Types.ObjectId.isValid(idDocumentParams)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });

        const result = await documentConfigModel.findByIdAndUpdate(idDocumentParams, body);

        return res.status(200).json({ status: 200, message: 'sucessfull', data: result });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});

*/



routerDocument.put(`${nameApi}/document/config/img/:id`, validateSession, uploadConfigReport.fields([
    { name: 'urlImgFront', maxCount: 1 },
    { name: 'urlImgLogo', maxCount: 1 },
]), async (req, res) => {
    try {
        const idDocumentParams = req.params.id;
        const body = req.body;
        const file = req.files.urlImgFront[0]
        if (!Types.ObjectId.isValid(idDocumentParams)) return res.status(400).json({ status: 400, error: 'Bad request', message: 'Id invalid' });

        const resultDocumentConfig = await documentConfigModel.findById(idDocumentParams);
        resultDocumentConfig[file.fieldname] = process.env.NODE_ENV === 'production' ?
            `https://amazona365.ddns.net${nameApi}/document/config/file/${file.filename}`
            :
            `https://amazona365.ddns.net:3006${nameApi}/document/config/file/${file.filename}`;

        const save = await resultDocumentConfig.save();
        return res.json({ data: save, status: 200, message: 'sucessfull' });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




routerDocument.get(`${nameApi}/document/config/file/:nameFile`, async (req, res) => {
    try {
        const nameFile = req.params.nameFile;
        return res.sendFile(join(dirConfigImgReport, nameFile));
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, error: error, message: 'Error server internal' });
    }
});




export { routerDocument };