
import mongoose, { Schema, model } from 'mongoose';




export default model('Local', new Schema({
    
    franchise: { //is deprecated
        type: String,
    },

    idLocal: {  // is deprecated
        type: String,
        require: true
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
        default: null,
        enum: {
            values: ['analytical','analytical and perimeter', 'perimeter'],
            message: "'{typeMonitoring}' is not a valid value. Allowed values are: 'analytical','analytical and perimeter', 'perimeter'"
        },
    },




    lang: {
        type: String,
        require: true,
        default: 'es'
    },


    touchs: {
        totalManager: {
            type: Number,
            default: 0
        },
        totalAttendee: {
            type: Number,
            default: 0
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


    /*
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
        },
        deprecated: {
            type: Boolean,
            default: true
        }
        
    },
    */

    dishes: [{ //////////////  in develoment
        type: Schema.Types.ObjectId,
        ref: 'Dishes',
    }],


    managers: [{
        type: Schema.Types.ObjectId,
        ref: 'Manager',
    }],


    timeServices: {
        type: Schema.Types.ObjectId,
        ref: 'TimeServices',
    },


    timeDelays: {
        type: Schema.Types.ObjectId,
        ref: 'ConfigTimeDelays',
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
        type: String,
        default: null
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
    },


    groupId: {
        type: String,
        default: null
    }
}));




export const TimeServicesModel = model('TimeServices', new Schema({
        TableCleaning: {
            type: String,
            default: '00:00:00'
        },
        firstAtenttion: {
            type: String,
            default: '00:00:00'
        },
        rest: []
}));    