import Manager from './manager.model.js';

export default {


    managerActive: () => {
        return new Promise((resolve, reject) =>  {
            Manager.find().exec((err, docs) => { 
                if(err) reject(err);
                resolve(docs);
            })
        })
    },


    getByNameLocal: nameLocal => {
        return new Promise((resolve, reject) =>  {
            Manager.find({ localName: nameLocal }).exec((err, docs) => { 
                if(err) reject(err);
                resolve(docs);
            })
        })
    },


    managerLocalAndImgById: id => {
        return new Promise((resolve, reject) => {
            Manager.find({ _id: id }).populate('managerimg').exec((err, docs) => { 
                if(err) reject(err);
                resolve(docs);
            });
        });
    },


    putManager: (id, body) => {
        return new Promise((resolve, reject) => {
            Manager.findByIdAndUpdate({ _id: id }, body).exec((err, docs) => {
                if(err) reject(err);
                resolve(docs);
            });
        });
    }


};