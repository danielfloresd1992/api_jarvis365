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
    // BONIFICACIÓN CONGELADA
    // ══════════════════════════════════════════════════════════════════
    // Cuánto bonificó ESTA novedad, resuelto y guardado en el momento en que un
    // validador la aprobó.
    //
    //
    // POR QUÉ SE COPIA EN VEZ DE REFERENCIAR
    //
    // La regla se edita y el valor del punto también. Sin copiar, corregir una
    // regla hoy recalcularía lo que se pagó la semana pasada, y no habría forma
    // de reconstruir por qué se pagó lo que se pagó. Lo que ya se aprobó no se
    // vuelve a mirar: el reglamento cambia, lo pagado no.
    //
    //
    // `applies` TIENE TRES ESTADOS Y LOS TRES DICEN COSAS DISTINTAS
    //
    //     true   bonificaba, y acá está con cuánto
    //     false  no bonificaba, y fue una decisión
    //     null   nunca se selló: es anterior al sistema, o todavía no se validó
    bonus: {

        applies: { type: Boolean, default: null },

        // ── De la regla ───────────────────────────────────────────────
        // De cuál salió. Es rastro, no fuente: los números de abajo son los que
        // mandan. Sirve para responder "¿de qué regla vino esto?" sin adivinar.
        rule: {
            type: Schema.Types.ObjectId,
            ref: 'BonusRule',
            default: null,
        },

        // CUÁNTOS BONOS VALE ESTA ALERTA. Es el número operativo: el corte
        // suma este campo y nada más.
        //
        // Sale de bonusAwarded / alertsRequired, ya resuelto para el turno del
        // operador y el establecimiento. Una regla de 4 alertas por bono deja
        // 0,25 acá; una que otorga 5 bonos deja 5.
        //
        // Las alertas que sobran de un grupo NO se pierden: seis alertas de una
        // regla 4x1 son 1,5 bonos, no 1.
        bonusPerAlert: { type: Number, default: null },

        // Los dos números de la regla, tal como el reglamento los escribe
        // ("4x1"). No entran en el cálculo —para eso está bonusPerAlert—, pero
        // 0,25 suelto no le dice nada a nadie y "4 por 1" sí.
        alertsRequired: { type: Number, default: null },
        bonusAwarded: { type: Number, default: null },

        // 'rule' | 'override' — si el valor salió de la regla general o de una
        // excepción del establecimiento. Es lo que responde "¿por qué esta pagó
        // 5 y aquella 1?" sin tener que reconstruir la regla de esa fecha.
        appliedFrom: { type: String, default: null },

        // ── Del operador ──────────────────────────────────────────────
        // El turno decide cuántos bonos otorga la alerta, y es el del OPERADOR
        // que la reportó, no el de la novedad: el bono es suyo, y un operador
        // nocturno puede reportar un hecho ocurrido de día.
        workShift: { type: String, default: null },

        // De qué capa del horario salió el turno:
        // 'override' (se lo cambiaron ese día) | 'regla' (su horario semanal) |
        // 'shiftType' (su jornada base) | 'default' (no tenía horario cargado).
        //
        // El último caso importa: significa que se asumió diurno sin dato, y
        // esas novedades conviene revisarlas antes de pagar.
        shiftSource: { type: String, default: null },

        // ── Del dinero ────────────────────────────────────────────────
        // Cuánto valía UN bono en ese momento. El valor es global y editable,
        // así que se congela: cambiarlo mañana no puede mover lo de esta semana.
        //
        // La tasa de cambio NO se congela acá: se aplica al liquidar, y toda la
        // liquidación va al mismo cambio.
        pointValue: { type: Number, default: null },

        frozenAt: { type: Date, default: null },
    },


    // ══════════════════════════════════════════════════════════════════
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