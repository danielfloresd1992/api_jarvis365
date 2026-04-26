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

                // Título alternativo para el documento de reporte (opcional)
                titleForDocumentReport: body.titleForDocumentReport
                    ? { es: body.titleForDocumentReport.es || null,
                        en: body.titleForDocumentReport.en || null }
                    : { es: null, en: null },

                textHeader: textHeader,

                // Flags de tiempo (mutuamente excluyentes en el formulario)
                time:       body.time,
                timeUnique: body.timeUnique,

                amountOfSomething: body.amountOfSomething,
                table:  body.table,
                photos: {
                    length:  body.photos.length,
                    caption: body.photos.caption
                },
                category:          body.category,
                especial:          especial,          // ya procesado arriba
                car:               body.car,
                isArea:            body.isArea,
                isDescriptionPerson: body.isDescriptionPerson,

                // DEPRECATED — se mantiene por compatibilidad con registros anteriores
                rulesForBonus: {
                    forLocal:  body.rulesForBonus?.forLocal  ?? 'Todos',
                    worth:     body.rulesForBonus?.worth     ?? 0,
                    amulative: body.rulesForBonus?.amulative ?? 0
                },

                // NUEVO sistema de bonificación (mapea al reglamento oficial)
                bonusCalculationRules: body.bonusCalculationRules
                    ? {
                        activate: body.bonusCalculationRules.activate ?? false,
                        defaultRule: {
                            worth:  body.bonusCalculationRules.defaultRule?.worth  ?? 1,
                            acum:   body.bonusCalculationRules.defaultRule?.acum   ?? 1,
                            valueBonusForTheStaffOnDuty: {
                                day:   body.bonusCalculationRules.defaultRule?.valueBonusForTheStaffOnDuty?.day   ?? 0.20,
                                nigth: body.bonusCalculationRules.defaultRule?.valueBonusForTheStaffOnDuty?.nigth ?? 0.30
                            },
                            reglamentoCode: body.bonusCalculationRules.defaultRule?.reglamentoCode ?? '',
                            description:    body.bonusCalculationRules.defaultRule?.description    ?? '',
                            defaultActive:  body.bonusCalculationRules.defaultRule?.defaultActive  ?? true
                        },
                        localSpecificRules: body.bonusCalculationRules.localSpecificRules ?? []
                    }
                    : undefined,

                useOnlyForTheReportingDocument:    body.useOnlyForTheReportingDocument,
                useOfLiveAlertForTheCustomer:      body.useOfLiveAlertForTheCustomer,
                noSubtitleInTheReport:             body.noSubtitleInTheReport,
                groupingInTheReport:               body.groupingInTheReport,
                descriptionNoteForReportDocument:  body.descriptionNoteForReportDocument,
                doesItrequireVideo:                body.doesItrequireVideo
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

            // Construir el documento de actualización con todos los campos del modelo.
            // Se excluye _id del payload para evitar error de campo inmutable.
            let especial = null;
            if(body.especial){
                especial = {
                    time: {
                        timeInitTitle: {
                            es: body.especial.time.timeInitTitle.es,
                            en: body.especial.time.timeInitTitle.en
                        },
                        timeEndTitle: {
                            es: body.especial.time.timeEndTitle.es,
                            en: body.especial.time.timeEndTitle.en
                        }
                    }
                };
            }

            const update = {
                es:                  body.es,
                en:                  body.en,
                titleForDocumentReport: body.titleForDocumentReport
                    ? { es: body.titleForDocumentReport.es || null,
                        en: body.titleForDocumentReport.en || null }
                    : { es: null, en: null },
                textHeader:          body.textHeader || null,
                time:                body.time,
                       timeUnique:   body.timeUnique,
                amountOfSomething:   body.amountOfSomething,
                            table:   body.table,
                photos:  { length: body.photos.length, caption: body.photos.caption },
                category:            body.category,
                especial:            especial,
                car:                 body.car,
                isArea:              body.isArea,
                isDescriptionPerson: body.isDescriptionPerson,
                // DEPRECATED — se preserva para registros existentes
                rulesForBonus: {
                    forLocal:        body.rulesForBonus?.forLocal  ?? 'Todos',
                    worth:           body.rulesForBonus?.worth     ?? 0,
                    amulative:       body.rulesForBonus?.amulative ?? 0
                },
                // Nuevo sistema de bonificación
                bonusCalculationRules: body.bonusCalculationRules ?? undefined,
                useOnlyForTheReportingDocument:   body.useOnlyForTheReportingDocument,
                useOfLiveAlertForTheCustomer:     body.useOfLiveAlertForTheCustomer,
                noSubtitleInTheReport:            body.noSubtitleInTheReport,
                groupingInTheReport:              body.groupingInTheReport,
                descriptionNoteForReportDocument: body.descriptionNoteForReportDocument,
                doesItrequireVideo:               body.doesItrequireVideo
            };

            Menu.updateOne({ _id: body._id }, update).exec((err, docs) => {
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