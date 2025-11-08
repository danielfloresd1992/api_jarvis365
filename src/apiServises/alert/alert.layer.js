import { AlertModel, RecordsLiveModel } from './alert.model.js'
import { join } from 'path';
import { readFileSync } from 'fs';
import publisher from '../../services/publisher/publisher.layer.js';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export default {


    setAlert(body, file){
        return new Promise(( resolve, reject ) => {

            const alert = new AlertModel({
              
                shift: body.shift,
                img: {
                    data: readFileSync(join(__dirname, `../../../uploads/alerts/${file.filename}`)),
                    contentType: file.mimetype,
                    name: file.fieldname
                }
            });

            alert.save()
                .then(result => {
                    console.log(result);
                    const forPublisher = {
                        title: 'Reporte de alertas',
                        idAlert: result._id
                    };

                    publisher.createPublication(forPublisher)
                    .then(result => {
                       console.log('Publecacion creada');                  
                    })
                    .catch(err => {
                        console.log(err);
                    });
                })
        });
    },


    getAlertById(id){
        return new Promise((resolve, reject) => {
            AlertModel.find({ _id: id }).exec((err, docs) => {
                if(err) reject(err);
                resolve(docs);
            })
        });
    }


};