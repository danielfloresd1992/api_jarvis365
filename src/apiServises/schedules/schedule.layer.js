import Schedules from './schedule.model.js';

export default {


    getDateByIdLocal(idLocal){
        return new Promise((resolve, reject) => {
            Schedules.find({ idLocal: idLocal})
                .exec(( err, docs ) => {
                    if(err){ 
                        reject(err);
                    };
                    resolve(docs);
                });
        });
    },



    setDateLocal(body){
            return new Promise((resolve, reject) => {
                const schedules = new Schedules({
                    idLocal : body.idLocal,
                    dayMonitoring: []
                });
                
                schedules.save()
                    .then(result => {
                        resolve(result);
                    })
                    .catch(err => {
                        console.log(err);
                        reject(err);
                    });
            });
    },



    putDateByIdLocal( id, body ){
        return new Promise((resolve, reject) => {
            Schedules.find({ idLocal: id})
                .exec((err, docs) => {
                    if(err) return reject(err);
                    if( docs.length === 0 ) return resolve(docs);   // el controller responde 404

                    Schedules.findByIdAndUpdate(docs[0]._id, body, { new: true, runValidators: true })
                        .exec((err, result) => {
                            if(err) return reject(err);
                            resolve(result);
                        });
                });
        });
    }


}


