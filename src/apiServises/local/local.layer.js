import Local from './local.model.js';

export default {

    
    getLocalAndImgByName: localName => {
        return new Promise((resolve, reject) => {
            Local.find({ name: localName }).populate('img').exec((err, docs) => {
                if(err) reject(err);
                resolve(docs);
            });
        });
    },


    getCortLocal: () => {
        return new Promise((resolve, reject) => {
            Local.find({ status: 'activo' }).select('-managers -img -touchs -dishMenu -status -typeMonitoring -date -location -idLocal -lang').exec((err, docs) => {
                if(err) reject(err);
                resolve(docs);
            });
        });
    },


    getLocalAndManager: id => {
        return new Promise(async (resolve, reject) => {
            Local.findOne({ _id: id }).populate('managers').exec((err, docs) => {
                if(err) reject(err);
                resolve(docs)
            })
        });
    }


};