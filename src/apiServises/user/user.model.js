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




const UserSchema = new Schema({
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

    // Cuándo se cambió la contraseña por última vez con el enlace del correo
    // (apiServises/auth/passwordReset.routes.ts). Sin valor = nunca por esa vía.
    passwordChangedAt: {
        type: Date
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
        detail: {
            type: String,
            default: null,
        },
        // El cargo del trabajador es una referencia al tabulador y no un texto
        // de una lista fija, porque el tabulador es el que sabe cuanto paga
        // cada cargo: con el id se llega a las tarifas sin copiar nada aqui.
        //
        // Aqui vivia `position`, un String con enum de trece puestos. Se quito
        // la declaracion pero NO el dato: Mongoose no borra lo que deja de
        // declarar, asi que los documentos conservan el texto viejo y el
        // script de migracion lo lee crudo (con .lean() o aggregate) para
        // convertirlo en esta referencia. Ninguna otra ruta lo lee ni lo
        // escribe.
        tabuladorPosition: {
            type: Schema.Types.ObjectId,
            ref: 'TabuladorPosition',
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
                    // Tipos de jornada soportados por día de horario base:
                    // 'laboral'    → día de trabajo normal
                    // 'extra'      → día extra (franco trabajado programado)
                    // 'descanso'   → día libre / franco sin actividad
                    // 'permiso'    → permiso autorizado (sin asistencia requerida)
                    // 'vacaciones' → período vacacional
                    // 'falta'      → ausencia pre-registrada / falta justificada
                    enum: ['laboral', 'extra', 'descanso', 'permiso', 'vacaciones', 'falta'],
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
        },

        // Genera horas extras de forma AUTOMÁTICA: lo que trabaje por encima
        // de su jornada base queda aprobado sin pasar por un administrador.
        // Se configura desde "Editar Perfil" en Client365.
        autoApproveOvertime: {
            type: Boolean,
            default: false
        }
    },



    updateByUser: {
        type: [UpdateByUserSchema], // ← Array de subdocumentos con timestamps
        default: [],
        select: false
    },

    // Vínculo con el terminal biométrico (Hikvision): el número de empleado de
    // esta persona en el terminal. Solo lo escribe el módulo /biometric, al
    // confirmar un administrador. Sin vincular, el campo no existe (no se guarda
    // vacío). Reglas en apiServises/biometric/biometricLink.lib.js.
    biometric: {
        employeeNo: { type: String, trim: true },
        linkedAt: { type: Date },
        linkedBy: { type: Schema.Types.ObjectId, ref: 'user' },
    },

    img: {
        type: String,
        unique: true,
        default: null
    }
});

// Un número del terminal por usuario y un usuario por número. Es PARCIAL a
// propósito: solo entran los usuarios vinculados. Un `unique` normal indexaría
// a todos los demás como null y chocarían entre sí (es lo que pasa con dni e img).
UserSchema.index(
    { 'biometric.employeeNo': 1 },
    { unique: true, partialFilterExpression: { 'biometric.employeeNo': { $type: 'string' } } },
);

export default model('user', UserSchema);



export { UpdateByUserSchema }