const controller = {};
import ChatModel from '../chat/model.js';

import { io } from '../../services/socket/io.js';




controller.getChatPaginate = async (req, res) => {
    try {
        const { page, limit } = req.query;

        console.log( { page, limit } );


            const chat = await ChatModel.find().sort({
              $natural: -1
            }).skip(Number(page) * Number(limit)).limit(Number(limit));
        

        return res.json({ result: chat, })
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Server internal', status: 500, message: error });
    }
};




controller.setMessage = async (req, res) => {
    try {
     
        const body = { ...req.body };

        // El texto del mensaje es OPCIONAL si la solicitud trae una alerta
        // compartida (sharedAlert) o archivos adjuntos (media). Sin nada -> 400.
        const hasText = typeof body.message === 'string' && body.message.trim() !== '';
        const hasAlert = !!body.sharedAlert;
        const hasMedia = Array.isArray(body.media) && body.media.length > 0;
        if (!hasText && !hasAlert && !hasMedia) {
            return res.status(400).json({ status: 400, error: 'Bad request', message: 'Se requiere un mensaje, una alerta compartida o un archivo.' });
        }

        if (req.body.establishment){
            body.establishment = {
                name: req.body.establishment.name,
                establishmentId: req.body.establishment.establishmentId
            }
        }

        // Cita de un mensaje específico (whitelisting de campos)
        if (req.body.replyTo){
            body.replyTo = {
                messageId: req.body.replyTo.messageId,
                message: req.body.replyTo.message,
                name: req.body.replyTo.name
            }
        }

        // Alerta compartida del muro (whitelisting de campos)
        if (req.body.sharedAlert){
            body.sharedAlert = {
                noveltyId: req.body.sharedAlert.noveltyId,
                title: req.body.sharedAlert.title,
                menu: req.body.sharedAlert.menu,
                validation: req.body.sharedAlert.validation,
                localName: req.body.sharedAlert.localName,
                image: req.body.sharedAlert.image
            }
        }

        // Archivos adjuntos (whitelisting de campos)
        if (Array.isArray(req.body.media)){
            body.media = req.body.media.map(m => ({
                url: m.url,
                kind: m.kind,
                mimeType: m.mimeType,
                name: m.name,
                size: m.size
            }));
        }

        body.submittedByUser = {
            name: req.session.name,
            userId: req.session.userId
        }

        const message = new ChatModel(body);
        
        const message_saved = await message.save();

        if(io){
            io.emit('receive_message', message_saved);
        }

        return res.status(200).json({ result: message_saved })

    }
    catch (error) {
        console.log(error);
   
        return res.status(500).json({ error: 'Server internal', status: 500, message: error });
    }
};




export default controller;