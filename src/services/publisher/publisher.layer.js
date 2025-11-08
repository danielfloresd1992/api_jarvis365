import Publisher from './publisher.model.js';
import Noveltie from '../../apiServises/noveltie/noveltie.model.js';
import { ObjectId } from 'mongodb'
import { io } from '../socket/io.js';

export default {


    createPublication: publication => {
        return new Promise(( resolve, reject ) => {
        
            const newPublisher = new Publisher({
                date: Date(),
                title: publication.title ,
                userPublicate: {
                    name: publication.userName
                },
                local: {
                    localName: publication.localName,
                    id: publication.localId
                },
                noveltie: publication.idCategory || null,
                corte: publication.IdCorte || null,
                alert: publication.idAlert || null
            });

            newPublisher.save()
                .then(result => {
                    resolve(result)
                    io.emit('sendPublisher', result);
                })
                .catch(err => reject(err));
        });
    },


    getAllPublisher: () => {
        return new Promise((resolve, reject) => {
            Publisher.find({})
                .exec((err, docs) => {
                    if(err) reject(err);

                    resolve(docs);
                });
        });
    },


    getPublisherAndArticle(id){
        return new Promise((resolve, reject) => {
            
            Publisher.findOne({ _id : id })
                .populate({ path: 'noveltie', populate: 'fileNoveltie' })
                .populate({ path: 'corte' }).populate({ path: 'alert' })
                .exec((err, docs) => {
                    if(err) reject(err);
                    console.log(id);
                    resolve(docs);
                });
        });
    },


    getPublisherPaginate: (page, numberItems) => {
        return new Promise((resolve, reject) => {
            Publisher.find({}).sort({$natural: -1})
                .skip(page * numberItems)
                .limit(numberItems)
                .exec((err, docs) => {
                    if(err) reject(err);

                    resolve(docs);
                });
        });
    },


    searchPublishers: (text, page, numberItems) => {

        
        return new Promise((resolve, reject) => {
            Publisher
                .find({$text: { $search: text }})
                .sort({ createdAt: -1 })
                .skip(page * numberItems)
                .limit(numberItems)
                .exec((err, docs) => {
                    if(err) reject(err);

                    resolve(docs);
                });
        });
    },


    deletePublisher: ( id ) => {
        return new Promise((resolve, reject) => {
            Publisher
                .findByIdAndDelete(id)
                .exec((err, docs) => {

                    if(err) reject({status: 500, sms: 'Error server internal', err: err});

                    if(!docs) return reject({status: 404, sms: 'Doc not found'});
                    
                    if(docs?.noveltie){
                        Noveltie.deleteOne({ _id: docs.noveltie }).exec((errNoveltie, noveltie) => {
                            if(errNoveltie) reject({status: 500, sms: 'Error server internal', err: err});
                            console.log(`Novedad eliminada`);
                            resolve({status: 200, sms: 'doc deleted', err: null, doc: noveltie})
                        });
                    }
                });
        });
    }
};