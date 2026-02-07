import { model, Schema } from 'mongoose';


const CommentSchema = new Schema({ 
    user: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', // asegúrate que tu modelo se registre como 'User' 
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



    /*
    userPublic:{ // DEPRECATED
        name:{
            type: String,
            required: true
        },
        userId: Schema.Types.ObjectId, 

    },
    */

    /*
    rulesForBonus: { // DEPRECATED
        worth: {
            type: Number,
            default: null
            
        },
        
        amulative: {
            type: Number,
            default: null
        }
    },
    */

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
                type: String,
                required: true,
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
                    type: String,
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