const controller = {};
import colors from 'colors';
import Corte from './corte.model.js';

import publisher from '../../services/publisher/publisher.layer.js';


controller.getCorte = (req, res) => {
        Corte.find()
        .then(results => {
            res.status(200).json(results);
        })
        .catch(error => {
            console.error(error);
            res.status(500);
        });
}


controller.setCorte = (req, res,) => {
    let body =  req.body;

    console.log(`Inserción de documentos Cortes365 ${new Date()}`.grey);
    let corte = new Corte({
        corte: body.corte,
        date: body.date,
        userId: body.userId
    });
    corte.save()
        .then(resultParent => {
            body.userName = req.session.name;
            body.IdCorte = resultParent._id;
            body.title = `Corte compartido ${req.session.name}`;
            
           
            publisher.createPublication(body)
                .then(result => {
                    console.log('Corte en la ruta SendCortesDoc365');
                    res.status(200).json(resultParent);
                })
                .catch(err => {
                    console.log(err);
                })
        })
        .catch(error => {
            console.error(error);
        });
}



export default controller;  