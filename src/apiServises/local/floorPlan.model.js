import { Schema, model } from 'mongoose';
import { FLOOR_PLAN_KINDS } from './floorPlan.schema.js';



// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE MESAS DE UN LOCAL — uno por local
// ══════════════════════════════════════════════════════════════════════
// Qué es cada campo y la regla de qué cuenta como mesa: floorPlan.schema.js.
// Vive en su propia colección y no dentro del Local para no engordar cada
// GET /local, que Jarvis Express pide a menudo y no usa el croquis.
//
// `version` es la del FORMATO: si un día cambia (piezas giradas, varias plantas)
// quien lo lea —insights365— sabe qué tiene delante.



// FLOOR_PLAN_VERSION = «la versión del formato que se guarda hoy»
export const FLOOR_PLAN_VERSION = 1;


const zoneSchema = new Schema({
    id:    { type: String, required: true },
    label: { type: String, required: true },
}, { _id: false });

const pieceSchema = new Schema({
    id:    { type: String, required: true },
    zona:  { type: String, required: true },
    kind:  { type: String, enum: FLOOR_PLAN_KINDS, required: true },
    label: { type: String, required: true },
    x:     { type: Number, required: true },
    y:     { type: Number, required: true },
    w:     { type: Number, required: true },
    h:     { type: Number, required: true },
    cap:   { type: Number, default: 0 },
}, { _id: false });


const floorPlanSchema = new Schema({
    establishment: { type: Schema.Types.ObjectId, ref: 'Local', required: true, unique: true },
    version:       { type: Number, default: FLOOR_PLAN_VERSION },
    board: {
        w:    { type: Number, required: true },
        h:    { type: Number, required: true },
        grid: { type: Number, default: 20 },
    },
    zonas:     { type: [zoneSchema], default: [] },
    piezas:    { type: [pieceSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'user', default: null },
}, { timestamps: true, versionKey: false });


export default model('FloorPlan', floorPlanSchema);
