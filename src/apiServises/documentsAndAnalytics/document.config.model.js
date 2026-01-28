import { ObjectId } from 'mongodb';
import { Schema, model } from 'mongoose';



export default model('DocumentConfig', new Schema({
    idEstablesment: ObjectId,
    activation: Boolean,

    typePageSumary: {
        type: String,
        enum: ['classic', 'simplified'],
        default: 'classic'
    },

    numberOfReports: {
        type: String,
        enum: ['single-diary', 'dual-diary'],
        required: true
    },

    time1Attention: {
        type: String,
        default: '00:00:00'
    },

    timeDelayClean: {
        type: String,
        default: '00:00:00'
    },


    timeServices: {
        active: {
            type: Boolean,
            default: false
        },
        appetize: {
            type: String,
            default: '00:00:00'
        },
        mainDish: {
            type: String,
            default: '00:00:00'
        },
        dessert: {
            type: String,
            default: '00:00:00'
        },
        services: {
            type: String,
            default: '00:00:00'
        },
        takeOut: {
            type: String,
            default: '00:00:00'
        }
    },


    time: {
        type: Schema.Types.Mixed,
        required: true
    },

    americanDateFormatForCoverPage: {
        type: Boolean,
        default: false
    },

    propMetricTableInToastPos: {
        type: Boolean,
        default: false
    },

    style: {
        pageColor: String,
        borderColor: String,
        bg: String,
        imageBg: String,
        colorGreadientLogo: String,
        colorTextFront: String,
        bgTextBox: String,
        colorTextBox: String,
        colorBorderBox: String,
    },

    urlImgFront: {
        type: String,
        default: null
    },


    ///  NEWS

    requireBarTable: {
        type: Boolean,
        default: false
    },

    requirePageMeetingPreShift: {
        type: Boolean,
        default: false,
        require: true
    },

    typeOfManagerToTableApproachEvaluation: {
        type: String,
        enum: ['single', 'complete'],
        required: true,
        default: 'single'
    }

}));    