import { Schema, model } from 'mongoose';
import { boolean } from 'yup';


const Menu = new Schema({
    es: {
        require: true,
        unique: true,
        type: String
    },

    en: {
        require: true,
        unique: true,
        type: String
    },

    titleForDocumentReport: {
        es: {
            type: String,
            default: null
        },
        en: {
            type: String,
            default: null
        }
    },

    textHeader: {
        es: {
            type: String
        },
        en: {
            type: String
        }
    },

    especial: {
        time: {
            timeInitTitle: {
                es: String,
                en: String
            },
            timeEndTitle: {
                es: String,
                en: String
            }
        }
    },

    timeUnique: {
        type: Boolean,
        require: true
    },

    amountOfSomething: {
        type: Boolean
    },


    time: {
        type: Boolean,
        require: true
    },

    table: {
        type: Boolean,
        require: true,
    },

    photos: {
        length: {
            type: Number,
            require: true,
        },
        isRequirePrint: {
            type: Boolean
        },
        caption: [
            {
                index: {
                    type: Number,
                    require: true,
                },
                es: {
                    require: true,
                    type: String
                },
                en: {
                    require: true,
                    type: String
                },
            }
        ],
    },

    doesItrequireVideo: {
        type: Boolean,
        default: false
    },

    category: {
        type: String,
        require: true,
    },

    especial: {},
    isArea: {
        type: Boolean,
        require: true
    },
    isDescriptionPerson: {
        type: Boolean,
        require: true
    },

    car: {
        type: Boolean,
        require: true
    },

    rulesForBonus: {  // IS DEPRECATED
        forLocal: {},
        worth: {
            type: Number,
            require: true
        },

        amulative: {
            type: Number,
            require: true
        }
    },


    bonusCalculationRules: {
        activate: Boolean,
        defaultRule: {
            worth: Number,        // X1, X2, X3, X5
            acum: Number,

            valueBonusForTheStaffOnDuty:{
                day: Number,
                nigth: Number
            },             // Valor en puntos
            reglamentoCode: String,     // Referencia al reglamento
            description: String,
            defaultActive: Boolean
        },
        localSpecificRules: [
            
        ]       // Reglas por establecimiento
    },


    useOnlyForTheReportingDocument: {
        type: Boolean,
        default: false
    },


    useOfLiveAlertForTheCustomer: {
        type: Boolean,
        default: false
    },


    groupingInTheReport: {
        type: String,
        enum: {
            values: ['individual', 'dual', 'quadruple'],
            message: "'{VALUE}' is not a valid value. Allowed values are: individual, dual, quadruple"
        },
        default: null
    },


    descriptionNoteForReportDocument: {
        type: Boolean,
        default: false
    }

});


export default model('Menu', Menu);