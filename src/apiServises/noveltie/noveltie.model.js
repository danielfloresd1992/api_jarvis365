import { model, Schema } from 'mongoose';


const CommentSchema = new Schema({ 
    user: { 
        type: Schema.Types.ObjectId,
        ref: 'user', // el modelo user se registra como 'user' (minúscula); 'User' rompe populate
        required: true
    }, 
    comment: { 
        type: String, 
        required: true, 
        trim: true 
    } 
}, { 
    timestamps: true // añade createdAt y updatedAt automáticamente 
});




const Novelties = new Schema({

    ///////////////// DATOS DE LA ALERTA

    fileNoveltie: { //DEPRECATED
        type: Schema.Types.ObjectId,
        ref: 'FileNoveltie',
    },

    date: { // DEPRECATED
        type: Date,
        require: true,
        immutable: true
    },
    title: {
        type: String, 
        require: true
    },
    table: {
        type: String,
        default: null
    },
    amount: {
        type: Number,
        default: null
    },
    nameDish: {
        type: String,
        default: null
    },
    menu: {
        type: String,
        require: true
    },
    orderTicketNumber: {
        type: Number,
        default: null
    },
    timePeriod: {
        default: null,
        type: Schema.Types.Mixed
    },

    manager: {
        default: null,
        type: Schema.Types.ObjectId, 
        ref: 'Manager'
    },

    time:{
        default: null,
        type: String
    },
    
    menuRef: {
        type: Schema.Types.ObjectId, 
        ref: 'Menu'
    },
    imageToShare: {
        type: String,
        require: true
    },

    imageUrl: [
        {
            index: {
                type: Number
            },

            url: {
                type: String
            },

            caption: {
                type: String,
            }
        }
    ],

    videoUrl: {
        type: String,
        default: null
    },  

    for_the_report: {
        type: Boolean,
        default : true
    },

    shift:  {
        type: String,
        enum: {
            values: ['day', 'night', null],
            message: "'{VALUE}' is not a valid value. Allowed values are: day or night"
        },
        default: null
    },





    ///////////////// DATOS DE LA VALIDACIÓN

    isValidate: {
        validation: {
            type: String,
        },
        for: {
            type: String,
        },
        menuEditedBy: {
            type: String,
            default: null
        },

        collection_status: {
            is_deprecated: {
                type: Boolean,
                default: true  
            },
            message_description: {
                type: String,
                default: 'This "isValidate" property is deprecated, use the "públicationDetail" property instead.'
            }
        }
    
    },




    
    givenToTheGroup: {// DEPRECATED
        type: Boolean,
        default: null
    },



    description: { // DEPRECATED
        type: String, 
        default: null
    },




    ///////////////// DATOS DE LA LOCALIDAD DE LA ALERTA
    local:{  // DEPRECATED
        name:{
            type: String,
            require: true
        },
        idLocal: {
            type: Schema.Types.ObjectId, 
            require: true
        },
        lang : {
            type: String
        },

        
        isDeprecated: {
            type: Boolean,
            default: true
        }
    },

    establishment: {
        type: Schema.Types.ObjectId,
        ref: 'Local'
    },



    /*
    userPublic:{ // DEPRECATED
        name:{
            type: String,
            required: true
        },
        userId: Schema.Types.ObjectId, 

    },
    */

    // ══════════════════════════════════════════════════════════════════
    // SELLO DE BONIFICACIÓN
    // ══════════════════════════════════════════════════════════════════
    // La regla que aplicaba EN EL MOMENTO de reportar, ya resuelta para este
    // establecimiento y este turno. Reemplaza al `rulesForBonus` que estaba
    // comentado acá.
    //
    // Se COPIA y no se consulta a la alerta. El reglamento se actualiza —el
    // vigente lleva fecha en el encabezado—, así que sin el sello un cambio de
    // hoy recalcularía lo que se pagó la semana pasada, y no habría forma de
    // reconstruir por qué se pagó lo que se pagó.
    //
    // `appliesBonus` tiene TRES estados y los tres significan cosas distintas:
    //     true   bonificaba, y acá está con cuánto
    //     false  no bonificaba, y fue una decisión
    //     null   la novedad es anterior al sistema
    //
    // Guarda la REGLA, no el resultado: "se considera bono a la 2ª vez" no se
    // puede decidir mirando una novedad suelta. El total se calcula al corte,
    // en libs/bonus/bonusTotals.lib.js.
    bonus: {
        appliesBonus: { type: Boolean, default: null },

        // De qué capa salió: 'disabled' | 'default' | 'franchise' | 'local'.
        // Es lo que después responde "¿por qué esta novedad valía 2?".
        appliedFrom: { type: String, default: null },

        bonusWorth: { type: Number, default: null },
        accumulationRequired: { type: Number, default: null },

        // Ya resuelto para el turno; no hay que volver a decidirlo al contar.
        pointValue: { type: Number, default: null },
        workShift: { type: String, default: null },

        thresholdParams: { type: Schema.Types.Mixed, default: null },
        regulationCode: { type: String, default: '' },
        frozenAt: { type: Date, default: null },
    },

    //  DATOS DEL USUARIO
    sharedByUser: {

        createdAt: {
            type: Date,
            require: true,
        },
        user: {
            nameUser:{
                type: String,
                required: true,
            },
            id: {
                type: Schema.Types.ObjectId,
                ref: 'user'
            }
        },
        requestOrigin: {
            applicationName: {
                type: String,
                required: true,
            },
            version: {
                type: String,
                required: true,
            }
        },
        commentByUser:{
            type: String,
            default: ''
        }
    },

    
    menuEditedBy: {
        updatedAt: {
            type: Date
        },
        user: {
            nameUser:{
                type: String,
            },
            id: {
                type: String,
            }
        },
        requestOrigin: {
            applicationName: {
                type: String,
            },
            version: {
                type: String,
            }
        }
    },

    
    ////////////////////////////////////////////////
    validationResult: {
        updatedAt: {
            type: Date
        },
        isApproved: {
            type: Boolean,
        },

        detail: {
            type: String,
        },
        validatedByUser: {
            user: {
                nameUser:{
                    type: String,
                },
                id: {
                    type: Schema.Types.ObjectId,
                    ref: 'user'
                }
            },
            requestOrigin: {
                applicationName: String,
                version: String
            }
        },
        

        validationToDiscard:{
            byTheClient:{
                type: Boolean,
                default: false
            },

            reportingDepartment:{
                type: Boolean,
                default: false
            }
        },

        commentSystem:{
            type: [CommentSchema],
            default: [ ]
        }
    },
    ///////////////////////////////////////////////////


    sharedByAmazonActive: {
        type: Boolean,
        default: false
    },



}, { timestamps: true });





let Noveltie;
try {
    Noveltie = model('Noveltie');
}
catch (error) {
    Noveltie = model('Noveltie', Novelties);
}

export default Noveltie;

export { CommentSchema }