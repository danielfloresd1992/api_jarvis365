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

    fileNoveltie: {
        type: Schema.Types.ObjectId,
        ref: 'FileNoveltie',
    },

    date: {
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




    
    givenToTheGroup: {
        type: Boolean,
        default: null
    },



    description: {
        type: String,
        default: null
    },





    local:{
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




    userPublic:{
        name:{
            type: String,
            required: true
        },
        userId: Schema.Types.ObjectId, 
    },



    rulesForBonus: {
        worth: {
            type: Number,
            default: null
            
        },
        
        amulative: {
            type: Number,
            default: null
        }
    },



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
    },


    sharedByAmazonActive: {
        type: Boolean,
        default: false
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

    commentSystem:{
        type: [CommentSchema],
        default: [ ]
    }


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