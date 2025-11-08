import Menu from './menu.model.js';

export default {


    setMenu(body){
        return new Promise((resolve, reject) => {
            
            if(body.es === '' || body.en === '') reject('Los titulos no puedenn estar vacío');
            let especial = null;
            let textHeader = null;
            if(body.especial){
                especial = {
                    time:{
                        timeInitTitle: {
                            es: body.especial.time.timeInitTitle.es ,
                            en: body.especial.time.timeInitTitle.en
                        }, 
                        timeEndTitle: {
                            es: body.especial.time.timeEndTitle.es ,
                            en: body.especial.time.timeEndTitle.en
                        }
                    }
                };
            }
            if(body.textHeader){
                textHeader = {
                    es: body.textHeader.es,
                    en: body.textHeader.en
                }
            }
            const menu = new Menu({
                es: body.es,
                en: body.en,
                textHeader: textHeader,
                time: body.time,
                amountOfSomething: body.amountOfSomething,
                table: body.table,
                photos :{
                    length: body.photos.length,
                    caption: body.photos.caption
                },
                category : body.category,
                especial: body.especial,
                car: body.car,
                isArea: body.isArea,
                isDescriptionPerson: body.isDescriptionPerson,
                rulesForBonus : {
                    forLocal: body.rulesForBonus.forLocal,
                    worth: body.rulesForBonus.worth,
                    amulative: body.rulesForBonus.amulative
                },

                useOnlyForTheReportingDocument: body.useOnlyForTheReportingDocument,
                useOfLiveAlertForTheCustomer: body.useOfLiveAlertForTheCustomer,
                //agrupación en el documento de reporte

                groupingInTheReport:  body.groupingInTheReport,

                
                
                descriptionNoteForReportDocument: body.descriptionNoteForReportDocument,
                doesItrequireVideo: body.doesItrequireVideo
            });

            menu.save()
            .then(result => {
                return resolve(result);
            })
            .catch(err => {
                console.log();
                return reject(err);
            });
        });
    },



    getAllmenu(){
        return new Promise((resolve, reject) => {
            Menu.find().exec((err, docs) => {
                if(err) return reject(err);

                
                resolve(docs);
            });
        });
    },


    getMenuById(id){
        return new Promise((resolve, reject) => {
            Menu.find({ _id: id }).exec((err, docs) => {
                if(err) reject(err);
                resolve(docs);
            });
        });
    },



    getCategoryMenu(text){
        return new Promise((resolve, reject) => {

            Menu.find({ category: text  }).exec((err, docs) => {
                if(err) return reject(err);
                if(docs.length < 1) return reject('404 not found');
                resolve(docs);

            });
        });
    },


    putMenu(body){
        return new Promise((resolve, reject) => {
            if(body._id === null || body._id === undefined) return reject('404 not found');
            /*
            let especial = null;
            if(body.especial){
                especial = {
                    time:{
                        timeInitTitle: {
                            es: body.especial.time.timeInitTitle.es ,
                            en: body.especial.time.timeInitTitle.en
                        }, 
                        timeEndTitle: {
                            es: body.especial.time.timeEndTitle.es ,
                            en: body.especial.time.timeEndTitle.en
                        }
                    }
                };
            }
            const menu = {
                es: body.es,
                en: body.en,
                timeUnique: body.timeUnique,
                time: body.time,
                table: body.table,
                photos :{
                    length: body.photos.length,
                    caption: body.photos.caption
                },
                category : body.category,
                especial: body.especial,
                rulesForBonus : {
                    worth: body.rules.worth,
                    amulative: body.rules.amulative
                }
            }
            */
            Menu.updateOne({_id: body._id,} , body).exec((err, docs) => {
                if(err) return reject(err);

                return resolve(docs);
           });
        });
    },


    getDeleteMenu(id){
        return new Promise(( resolve, reject ) => {
            Menu.deleteOne({ _id: id }).exec((err, result) => {
                if(err) return reject(err);

                resolve(result);
            });
        });
    }

};