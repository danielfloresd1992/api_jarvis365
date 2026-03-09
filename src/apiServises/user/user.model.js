import mongoo from 'mongoose';
const { Schema, model } = mongoo;



const UpdateByUserSchema = new Schema({
    idRef: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'user',
        immutable: true,
    },
    change: []
},
    {
        timestamps: true // ← Esto genera createdAt y updatedAt automáticamente 

    });




export default model('user', new Schema({
    dni: {
        type: String,
        unique: true,
        trim: true,
        default: null
    },

    user: {
        type: String,
        unique: true,
        required: true,
        immutable: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false,
        trim: true
    },
    email: {
        immutable: true,
        type: String,
        unique: true,
        required: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    surName: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        unique: true,
        required: true,
        immutable: true,
        trim: true
    },

    admin: {
        type: Boolean,
        default: false
    },

    super: {
        type: Boolean,
        default: false
    },

    inabilited: {
        type: Boolean,
        default: false
    },
    date: {
        type: Date,
        default: new Date(),
        immutable: true,
    },
    createdOn: {
        type: Date,
        default: new Date(),
        immutable: true,
    },


    jobInformation: {
        department: {
            type: String,
            enum: ['Operaciones', 'Sistemas y desarrollo', 'Reportes', 'Recursos Humanos', 'Audioria']
        },
        position: {
            type: String,
            // Aquí puedes listar todos los puestos posibles
            enum: [
                'Gerente', 'Subgerente', 'Coordinador', 'Operador senior', 'Operador experto', 'Operador',
                'Analista de sistemas', 'Analista de reportes', 'Analista de auditoria', 'Analista de RRHH'
            ]
        },
        detail: {
            type: String,
            default: null,
        },
        required: false
    },


    workSchedule: {
        shiftType: {
            type: String,
            enum: ['Diurno', 'Nocturno'],
            default: 'Diurno'
        },

        // ══════════════════════════════════════════════════════════════
        // HORARIO POR DÍA: scheduleByDay (reemplaza startTime/endTime/restDays)
        // ══════════════════════════════════════════════════════════════
        // Cada clave (0-6) representa un día de la semana (0=Dom, 1=Lun … 6=Sáb).
        // Si un día tiene workType 'descanso', startTime/endTime se ignoran.
        // shift por día permite asignar turnos mixtos (ej: diurno L-V, nocturno S).
        scheduleByDay: {
            type: Map,
            of: new Schema({
                workType: {
                    type: String,
                    enum: ['laboral', 'extra', 'descanso'],
                    default: 'laboral'
                },
                shift: {
                    type: String,
                    enum: ['Diurno', 'Nocturno'],
                    default: 'Diurno'
                },
                startTime: { type: String },  // "HH:mm"
                endTime: { type: String },  // "HH:mm"
                note: [{
                    user: { type: Schema.Types.ObjectId, ref: 'user' },
                    message: { type: String },
                    date: { type: Date, default: Date.now },
                    _id: false
                }]
            }, { _id: false }),
            default: {}
        },

        required: false,

        lateArrivalControl: { ////ojo aqui
            type: Boolean,
            default: true // ¿Se le aplica la regla de llegada tarde?
        },

        lateArrivalTracking: {
            type: Boolean,
            default: true // ¿Se debe hacer seguimiento/notificación?
        },
        outForkSchedule: {
            type: Boolean,
            default: false
        }
    },



    updateByUser: {
        type: [UpdateByUserSchema], // ← Array de subdocumentos con timestamps
        default: [],
        select: false
    },
    img: {
        type: String,
        unique: true,
        default: null
    }
}));



export { UpdateByUserSchema }