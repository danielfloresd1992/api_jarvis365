import mongoose from 'mongoose';


const AttendanceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
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
        type: Date,
        immutable: true

    },
    checkOut: { 
        type: Date,
        
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
        enum: ['presente', 'ausente', 'pendiente', 'franco-trabajado'],
        default: 'pendiente'
    },

    imageReference:{
        type: []
    }

}, { timestamps: true });

// Índice para buscar rápido por usuario y fecha
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });



export default mongoose.model('Attendance', AttendanceSchema);