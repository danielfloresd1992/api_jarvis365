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

                managerReferenceId: body.managerReferenceId,
                managerReferenceTitle: body.managerReferenceTitle,
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
            // Se incluye la auditoría (select:false por defecto) populada, para
            // poder mostrar quién editó cada campo al abrir el menú en el form.
            Menu.find({ _id: id })
                .select('+updateByUser')
                .populate('createdBy', 'name surName img')
                .populate('updateByUser.user', 'name surName img')
                .then(docs => resolve(docs))
                .catch(err => reject(err));
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


    // Actualización PARCIAL con auditoría: el front envía SOLO los campos que
    // cambiaron (+ _id). Se hace $set de esos campos y $push al historial
    // updateByUser con quién editó (userId de la sesión) y la key/value de cada
    // cambio. Enviar el documento completo borraría campos no incluidos, por eso
    // se persiste únicamente lo recibido.
    putMenu(body, userId){
        return new Promise((resolve, reject) => {
            const { _id, ...fields } = body || {};
            if(_id === null || _id === undefined) return reject('404 not found');

            // Ignorar meta-campos que no son datos editables del menú
            delete fields.updateByUser;
            delete fields.__v;
            delete fields.createdBy;   // el autor de la creación es inmutable
            // El bloqueo administrativo SOLO se cambia por su endpoint dedicado
            // (PATCH /menu/lock): el PUT normal no puede ponerlo ni quitarlo.
            delete fields.isLocked;

            const change = Object.keys(fields).map(key => ({ key, value: fields[key] }));
            if(change.length === 0) return reject('Sin cambios para guardar');

            const update = {
                $set: fields,
                $push: { updateByUser: { user: userId, change, date: new Date() } }
            };

            // Documento bloqueado por administración → no se edita (423)
            Menu.findById(_id).select('isLocked')
                .then(current => {
                    if(!current) return reject('404 not found');
                    if(current.isLocked === true) return reject('423 locked');

                    return Menu.findByIdAndUpdate(_id, update, { new: true, runValidators: true })
                        .then(doc => {
                            if(!doc) return reject('404 not found');
                            return resolve(doc);
                        });
                })
                .catch(err => reject(err));
        });
    },


    getDeleteMenu(id){
        return new Promise(( resolve, reject ) => {
            // Documento bloqueado por administración → no se borra (423)
            Menu.findById(id).select('isLocked')
                .then(current => {
                    if(!current) return reject('404 not found');
                    if(current.isLocked === true) return reject('423 locked');

                    Menu.deleteOne({ _id: id }).exec((err, result) => {
                        if(err) return reject(err);

                        resolve(result);
                    });
                })
                .catch(err => reject(err));
        });
    }

};