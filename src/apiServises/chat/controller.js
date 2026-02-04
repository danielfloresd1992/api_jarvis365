const controller = {};
import ChatModel from '../chat/model.js';

import { Message } from '../../libs/schema/chat.js'

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

        if(!body.message) return res.status(400).json({ status: 400, error: 'Bad request', message: 'message is required' });

        if (req.body.establishment){
            body.establishment = {
                name: req.body.establishment.name,
                establishmentId: req.body.establishment.establishmentId
            }
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