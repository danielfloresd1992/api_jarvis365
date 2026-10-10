import mongoose from 'mongoose';

// Un documento por empleado y día. `date` es la medianoche UTC del día civil de Caracas.
const AttendanceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        // El modelo de usuario se registra como 'user' (minúscula).
        ref: 'user',
        required: true,
        immutable: true
    },
    date: {
        type: Date,
        required: true, // Se guarda a las 00:00:00 para facilitar búsquedas por día
        immutable: true,
    },
    // Registro de horas reales
    checkIn: {
        type: Date
    },
    checkOut: {
        type: Date
    },

    // Lógica de retardos
    isLate: {
        type: Boolean,
        default: false
    },
    lateJustification: {
        type: String,
        default: ''
    },
    isJustified: {
        type: Boolean,
        default: false
    },
    // Unidades a descontar por el retardo, calculadas al marcar la entrada
    // (computeDiscountUnits). 0 si no llegó tarde.
    discountUnits: {
        type: Number,
        default: 0
    },

    // Gestión de días libres trabajados (Extras)
    isExtraDay: {
        type: Boolean,
        default: false
    },

    // Horas extras: solo la DECISIÓN. Los minutos se calculan con overtime.lib.js.
    //   pending → espera aprobación · approved → aprobada · rejected → rechazada
    overtime: {
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        // Quién decidió (null en las automáticas, que llevan auto: true).
        decidedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
            default: null
        },
        decidedAt: { type: Date, default: null },
        note: { type: String, default: '' },
        auto: { type: Boolean, default: false },
        // Aprobación parcial: n minutos aprobados. null = todo el excedente.
        approvedMinutes: { type: Number, default: null }
    },
    adminNotes: {
        type: String
    },

    // Estado del día.
    status: {
        type: String,
        enum: ['presente', 'ausente', 'pendiente', 'franco-trabajado', 'permiso', 'vacaciones'],
        default: 'pendiente'
    },

    // Horario especial de ESTE día ("Editar grupo" en Client365). Reemplaza a la
    // regla semanal user.workSchedule.scheduleByDay y tiene su misma forma.
    scheduleOverride: {
        type: {
            // Tipo de jornada.
            workType: {
                type: String,
                enum: ['laboral', 'extra', 'descanso', 'permiso', 'vacaciones', 'falta']
            },
            // Turno de este día (puede diferir del habitual).
            shift: {
                type: String,
                enum: ['Diurno', 'Nocturno']
            },
            // Horas de entrada y salida ("HH:mm").
            startTime: { type: String },
            endTime: { type: String },
            // Notas del admin explicando el cambio.
            note: {
                type: [{
                    user: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'user'
                    },
                    message: { type: String },
                    date: {
                        type: Date,
                        default: Date.now
                    },
                    _id: false
                }],
                default: null
            },
        },
        default: null,
        _id: false
    },

    imageReference: {
        type: []
    },

    // Quién creó el documento: el empleado al marcar o el admin que editó el día.
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        default: null
    },
    // Historial de ediciones administrativas (los marcajes no se registran aquí).
    editedBy: {
        type: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'user'
            },
            // Cada cambio: { field, from, to } (Mixed: hay entradas viejas que son strings).
            change: { type: [mongoose.Schema.Types.Mixed], default: [] },
            date: {
                type: Date,
                default: Date.now
            },
            _id: false
        }],
        default: []
    },

    // Guardia del día: una por departamento, fecha y turno (lo valida /attendance/on-duty).
    onDuty: {
        type: Boolean,
        default: false
    },

    // Auxiliar del día: misma regla que onDuty (lo valida /attendance/auxiliary).
    auxiliary: {
        type: Boolean,
        default: false
    },

    // Comentarios de usuarios super sobre el día.
    comments: {
        type: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'user'
            },
            message: { type: String },
            date: {
                type: Date,
                default: Date.now
            },
            _id: false
        }],
        default: []
    }

}, { timestamps: true });

// Un solo documento por usuario y fecha.
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });



export default mongoose.model('Attendance', AttendanceSchema);