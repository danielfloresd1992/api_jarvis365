
import mongoose, { Schema, model } from 'mongoose';




const Local = new Schema({
    
    franchise: { //is deprecated
        type: String,
    },

    idLocal: {  // is deprecated
        type: String,
        require: true
    },

    status: { // isDeprecated
        type: String,
        require: true,
        default: 'activo'
    },


    franchiseReference: {
        name_franchise: {
            type: String,
        },
        franchise: {
            type: Schema.Types.ObjectId,
            ref: 'Franchise'
        }
    },


    name: {
        require: true,
        unique: true,
        type: String
    },
    location: {
        type: String,
        require: true
    },

    isActive: {
        type: Boolean,
        default: true
    },

    typeMonitoring: {
        type: String,
        default: null
    },



    order: {
        type: Number,
        require: true
    },

    lang: {
        type: String,
        require: true,
        default: 'es'
    },



    touchs: {
        totalManager: {
            type: Number,
            default: 5
        },
        totalAttendee: {
            type: Number,
            default: 5
        },

        typeEvaluationTouch: {
            type: String,
            default: 'simple'
        }
        ,
        isRequiredeEvaluation: {
            type: Boolean,
            default: false
        },
        isEvaluationGroup: {
            type: Boolean,
            default: false
        }
    },



    dishMenu: {  // is deprecated
        appetizer: {
            type: String,
            default: null
        },
        mainDish: {
            type: String,
            default: null
        },
        dessert: {
            type: String,
            default: null
        },
        dishEvaluation: {
            type: String,
            default: false
        },
        isRequiredeEvaluation: {
            type: Boolean,
            default: false
        },
        isEvaluationGroup: {
            type: Boolean,
            default: false
        }
    },


    dishes: [{ //////////////  in develoment
        type: Schema.Types.ObjectId,
        ref: 'Dishes',
    }],


    img: { /// id deprecated
        data: Buffer,
        contentType: String,
        name: String
    },


    managers: [{
        type: Schema.Types.ObjectId,
        ref: 'Manager',
    }],


    timeServices: {
        type: Schema.Types.ObjectId,
        ref: 'TimeServices',
    },


    shedules: {
        type: Schema.Types.ObjectId,
        ref: 'Shedules',
    },



    config_report: {
        type: Schema.Types.ObjectId,
        ref: 'DocumentConfig'
    },




    date: Date,

    timestamps: {
        createdAt: {
            time: {
                type: Date,
                default: Date.now
            },
            by_user: {
                name: {
                    type: String,
                },
                id: {
                    type: Schema.Types.ObjectId,
                }
            },

        },
        updatedAt: [{
            time: {
                type: Date,
                default: Date.now
            },
            by_user: {
                name: {
                    type: String,
                },
                id: {
                    type: Schema.Types.ObjectId,
                }
            },
        }]
    },

    image: {
        type: String
    },

    DST: {
        isActive: {
            type: Boolean,
            require: true
        },
        TimeZone: {
            type: String,
            require: true
        }
    },


    alertLength: {    ///////  uso para la creación de la alerta en JARVIS_EXPRESS
        type: String,
        enum: {
            values: ['simplified','extended'],
            message: "'{alertLength}' is not a valid value. Allowed values are: simplified, Extended"
        },
        default: 'extended'
    }


});



export default mongoose.models['Local'] || model('Local', Local);
