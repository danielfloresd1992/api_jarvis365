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
        required: true,
        immutable: true,
        trim: true
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
        immutable: true,
        trim: true
    },
    surName: {
        type: String,
        required: true,
        immutable: true,
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
            required: true,
            enum: ['Operaciones', 'Sistemas y desarrollo', 'Reportes', 'Recursos Humanos']
        },
        position: {
            type: String,
            required: true,
            // Aquí puedes listar todos los puestos posibles
            enum: [
                'Gerente', 'Subgerente', 'Coordinador', 'Operador senior', 'Operador',
                'Analista de sistemas', 'Analista de reportes', 'Analista de RRHH'
            ]
        },
        required: false
    },


    workSchedule: {
        shiftType: {
            type: String,
            required: true,
            enum: ['Diurno', 'Nocturno'],
            default: 'Diurno'
        },
        startTime: {
            type: String, // Formato "HH:mm" (ej. "08:00")
            required: true
        },
        endTime: {
            type: String, // Formato "HH:mm" (ej. "17:00")
            required: true
        },
        restDays: {
            0: { type: Boolean, default: true },
            1: { type: Boolean, default: false },
            2: { type: Boolean, default: false },
            3: { type: Boolean, default: false },
            4: { type: Boolean, default: false },
            5: { type: Boolean, default: false },
            6: { type: Boolean, default: true }
        },
        required: false
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