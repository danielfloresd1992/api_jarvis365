import mongoose from 'mongoose';


const AttendanceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        // El modelo está registrado como 'user' (minúscula): con 'User' cualquier
        // populate de userId lanza MissingSchemaError y termina en un 500.
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

    // Gestión de días libres trabajados (Extras)
    isExtraDay: {
        type: Boolean,
        default: false
    },
    adminNotes: {
        type: String
    },

    // Estado del día
    status: {
        type: String,
        enum: ['presente', 'ausente', 'pendiente', 'franco-trabajado', 'permiso', 'vacaciones'],
        default: 'pendiente'
    },

    // ══════════════════════════════════════════════════════════════
    // REGLA POR DÍA (override del scheduleByDay por defecto)
    // ══════════════════════════════════════════════════════════════
    // Cuando el admin asigna un horario especial para un día específico
    // desde el formulario "Editar grupo" en Client365, se guardan aquí.
    // Si scheduleOverride existe, el endpoint de marcado usa estos valores
    // en lugar de user.workSchedule.scheduleByDay[diaDeLaSemana].
    // Estructura idéntica a cada entrada de scheduleByDay para consistencia.
    scheduleOverride: {
        type: {
            // Tipo de jornada: 'laboral', 'extra', 'descanso'.
            workType: {
                type: String,
                enum: ['laboral', 'extra', 'descanso', 'permiso', 'vacaciones', 'falta']
            },
            // Tipo de turno específico para este día (puede diferir del global).
            shift: {
                type: String,
                enum: ['Diurno', 'Nocturno']
            },
            // Hora de entrada especial (formato "HH:mm").
            startTime: { type: String },
            // Hora de salida especial (formato "HH:mm").
            endTime: { type: String },
            // Notas del admin explicando el cambio (opcional).
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

    // ══════════════════════════════════════════════════════════════
    // AUDITORÍA DEL DOCUMENTO
    // ══════════════════════════════════════════════════════════════
    // createdBy: quién originó el documento — el propio empleado al marcar
    // asistencia, o el admin que asignó un scheduleOverride sobre un día
    // sin registro. Documentos antiguos no lo tienen (default null):
    // compatible hacia atrás. Por convención no se modifica tras crearse.
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        default: null
    },
    // editedBy: historial de ediciones administrativas con los campos del
    // scheduleOverride que cambiaron en cada una. Los marcajes de entrada y
    // salida (checkIn/checkOut) NO se registran aquí a propósito.
    editedBy: {
        type: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'user'
            },
            // Cada cambio: { field, from, to } (Mixed para tolerar entradas
            // antiguas que eran strings con solo el nombre del campo)
            change: { type: [mongoose.Schema.Types.Mixed], default: [] },
            date: {
                type: Date,
                default: Date.now
            },
            _id: false
        }],
        default: []
    },

    // Guardia del día (responsable del turno en su departamento).
    // Regla de negocio: solo UN usuario por departamento y fecha puede
    // tenerla en true — la valida el endpoint /user/attendance/on-duty.
    onDuty: {
        type: Boolean,
        default: false
    },

    // Auxiliar del día (apoyo del encargado de turno en su departamento).
    // Misma regla que onDuty: solo UN usuario por departamento, fecha y
    // turno — la valida el endpoint /user/attendance/auxiliary.
    auxiliary: {
        type: Boolean,
        default: false
    },

    // Comentarios sobre el día, agregados por usuarios super desde la grilla.
    // Cada entrada referencia a quién comentó. Compatible hacia atrás.
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

// Índice para buscar rápido por usuario y fecha
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });



export default mongoose.model('Attendance', AttendanceSchema);