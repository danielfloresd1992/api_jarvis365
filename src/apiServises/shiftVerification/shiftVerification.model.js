import { Schema, model } from 'mongoose';
import { SHIFTS } from '../rotation/rotation.schema.js';
import { CHECK_STATUSES, ORIGINS, HISTORY_ACTIONS, DELAY_KINDS, PASSES, COMMENT_MAX } from './shiftVerification.schema.js';



// ══════════════════════════════════════════════════════════════════════
// LA VERIFICACIÓN DE UN TURNO DE UN ESTABLECIMIENTO
// ══════════════════════════════════════════════════════════════════════
// Las rotaciones que el operador guarda desde Mesas de Jarvis Express son datos
// BRUTOS. Este documento es el resultado de compararlas con el video: una por
// local, día operativo y turno, con TODAS las rotaciones del turno referenciadas
// y, en cada una y en cada uno de sus toques de gerente, lo que dijo la
// verificación. Lo que el operador no anotó y aparece en el video se RECUPERA:
// se crea como rotación (o como toque) de verdad, marcada `recovered`, y entra
// aquí con origin 'verification'.
//
// Se verifica DOS veces, por dos personas: la segunda revisa lo que dejó la
// primera, y empieza cuando la primera se cierra. Lo que dice la segunda manda
// sobre lo de la primera (finalCheck, en shiftVerification.lib.js).
//
// Tres usuarios: el operador (quien creó la mayoría de las rotaciones del turno)
// y quienes cerraron la primera y la segunda verificación. Los tres salen del
// servidor —de las rotaciones y de la sesión—, nunca del body.
//
// El resultado (el 100 % es lo que el operador anotó y está en el video más lo
// recuperado) se calcula de las marcas, y se congela en `totals` al cerrar cada
// verificación.



// ── UNA MARCA: lo que dijo una verificación de una rotación o de un toque ──
const Check = new Schema({
    status:    { type: String, enum: CHECK_STATUSES, required: true },   // 'confirmed': está en el video; 'notFound': no está
    note:      { type: String, default: '' },                            // por qué, si hace falta decirlo
    checkedBy: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    checkedAt: { type: Date, default: Date.now },
}, { _id: false });


// ── UN TOQUE DE LA ROTACIÓN, con lo que dijo cada verificación ──
// `touch` es el _id del toque DENTRO de la rotación (Rotation.touch[]._id): sus datos se leen de ahí.
const TouchEntry = new Schema({
    touch:  { type: Schema.Types.ObjectId, required: true },
    origin: { type: String, enum: ORIGINS, default: 'operator' },
    first:  { type: Check, default: null },
    second: { type: Check, default: null },
}, { _id: false });


// ── UNA ROTACIÓN DEL TURNO, con lo que dijo cada verificación y sus toques ──
const RotationEntry = new Schema({
    rotation: { type: Schema.Types.ObjectId, ref: 'Rotation', required: true },
    origin:   { type: String, enum: ORIGINS, default: 'operator' },
    first:    { type: Check, default: null },
    second:   { type: Check, default: null },
    touches:  { type: [TouchEntry], default: [] },
}, { _id: false });


// ── EL RESULTADO, congelado al cerrar cada verificación ──
// Los mismos números de totalsOf (shiftVerification.lib.js). `total` es el 100 %: confirmed + recovered.
const Counts = new Schema({
    recorded:  { type: Number, default: 0 },   // lo que anotó el operador
    confirmed: { type: Number, default: 0 },   // de eso, lo que está en el video
    notFound:  { type: Number, default: 0 },   // de eso, lo que no está
    pending:   { type: Number, default: 0 },   // de eso, lo que nadie miró (0 al cerrar)
    recovered: { type: Number, default: 0 },   // lo que no anotó y se sacó del video
    total:     { type: Number, default: 0 },   // lo que pasó de verdad
}, { _id: false });

const Totals = new Schema({
    rotations: { type: Counts, default: () => ({}) },
    touches:   { type: Counts, default: () => ({}) },
}, { _id: false });


// ── EL HISTORIAL: quién hizo qué, y cuándo ──
// Una línea por cosa hecha en la verificación (HISTORY_ACTIONS): tomarla, marcar una mesa o un toque (de qué marca a
// cuál), recuperar del video, cerrarla. Lo escribe el servidor; el body no lo trae.
const HistoryEntry = new Schema({
    at:       { type: Date, default: Date.now },
    user:     { type: Schema.Types.ObjectId, ref: 'user', required: true },
    action:   { type: String, enum: HISTORY_ACTIONS, required: true },
    pass:     { type: Number, default: null },
    rotation: { type: Schema.Types.ObjectId, ref: 'Rotation', default: null },
    touch:    { type: Schema.Types.ObjectId, default: null },
    from:     { type: String, default: null },    // la marca de antes ('confirmed' | 'notFound' | null)
    to:       { type: String, default: null },    // la de después
    note:     { type: String, default: '' },      // lo que hace falta para leerla: 'Mesa 12 a las 13:05:00'
}, { _id: false });


// ── LAS DEMORAS DEL TURNO, congeladas al cerrar cada verificación ──
// De cada mesa que está en el video (o recuperada): su primera atención y su limpieza, contra los tiempos de
// referencia del local (Local.timeServices) de ese momento, y si el operador la reportó como novedad. Solo las que
// pasaron del límite o se reportaron.
const DelayItem = new Schema({
    rotation: { type: Schema.Types.ObjectId, ref: 'Rotation', required: true },
    kind:     { type: String, enum: DELAY_KINDS, required: true },
    seconds:  { type: Number, default: null },
    over:     { type: Boolean, default: false },   // pasó del límite
    reported: { type: Boolean, default: false },   // el operador envió la novedad de la demora
}, { _id: false });

// ── UN COMENTARIO DE UNA VERIFICACIÓN (pedido del usuario) ──
// Lo que alguien tiene que decir de la verificación 1 o de la 2; si habla de una rotación, apunta a ella. Lleva su
// _id: su autor lo puede editar o borrar. Quién lo escribe lo pone el servidor; el body no lo trae.
const Comment = new Schema({
    pass:     { type: Number, enum: PASSES, required: true },
    rotation: { type: Schema.Types.ObjectId, ref: 'Rotation', default: null },   // null: de toda la verificación
    text:     { type: String, required: true, maxlength: COMMENT_MAX },
    user:     { type: Schema.Types.ObjectId, ref: 'user', required: true },
    at:       { type: Date, default: Date.now },
    editedAt: { type: Date, default: null },
});


const Delays = new Schema({
    limits: {
        attention: { type: String, default: null },   // 'HH:MM:SS'
        cleaning:  { type: String, default: null },
    },
    attention: { type: Number, default: 0 },   // cuántas pasaron del límite de primera atención
    cleaning:  { type: Number, default: 0 },   // cuántas, del de limpieza
    reported:  { type: Number, default: 0 },   // cuántas reportó el operador
    items:     { type: [DelayItem], default: [] },
}, { _id: false });



const ShiftVerification = new Schema({

    // DE QUÉ: el local, el día operativo (medianoche UTC del día en que abre la jornada, como Rotation) y el turno
    establishment:   { type: Schema.Types.ObjectId, ref: 'Local', required: true, immutable: true },
    operationalDate: { type: Date, required: true, immutable: true },
    shift:           { type: String, enum: SHIFTS, required: true, immutable: true },

    // QUIÉNES. OJO: el modelo de usuario se registra como 'user' (minúscula).
    operator:       { type: Schema.Types.ObjectId, ref: 'user', default: null },   // quien creó la mayoría de las rotaciones
    firstVerifier:  { type: Schema.Types.ObjectId, ref: 'user', default: null },   // quien cerró la verificación 1
    secondVerifier: { type: Schema.Types.ObjectId, ref: 'user', default: null },   // quien cerró la verificación 2
    firstClosedAt:  { type: Date, default: null },
    secondClosedAt: { type: Date, default: null },

    // TODAS las rotaciones de mesa del turno (los pedidos para llevar no), las anotadas y las recuperadas
    rotations: { type: [RotationEntry], default: [] },

    // El resultado del último cierre; null hasta que se cierra la primera
    totals: { type: Totals, default: null },

    // Las demoras del turno, del último cierre; null hasta que se cierra la primera
    delays: { type: Delays, default: null },

    // Quién hizo qué y cuándo, del más viejo al más nuevo
    history: { type: [HistoryEntry], default: [] },

    // Los comentarios de las dos verificaciones, del más viejo al más nuevo
    comments: { type: [Comment], default: [] },

}, { timestamps: true });


// Una sola por local, día y turno: abrirla dos veces devuelve la misma
ShiftVerification.index({ establishment: 1, operationalDate: 1, shift: 1 }, { unique: true });

// La lista de /verifications pide las de un día de todos los locales
ShiftVerification.index({ operationalDate: 1 });



export default model('ShiftVerification', ShiftVerification);
