import { Schema, model } from 'mongoose';



// ══════════════════════════════════════════════════════════════════════
// EL CICLO DE LA ROTACIÓN DE UNA MESA
// ══════════════════════════════════════════════════════════════════════
// Una mesa desde que se ocupa hasta que se limpia, con los pedidos que se
// hicieron en ella (los procesos) y los toques de gerente. La anota el operador
// en Jarvis-express365, donde se llama «rotación», y la guarda con el botón del
// disquete de su fila.
//
// Las horas van como texto 'HH:MM:SS', no como fechas: así las anota el operador
// y así se leen en el Excel de monitoreo. '' es «todavía no pasó». Las
// duraciones (primera atención, limpieza, preparación, entrega) NO se guardan:
// se calculan restando dos horas, y guardarlas permitiría que no cuadren.
//
// Lleva la referencia del establecimiento y la del usuario que la guardó. El
// usuario sale de la sesión, nunca del body.



// timeField = «una hora de la rotación»: 'HH:MM:SS', o '' si todavía no pasó.
// Es una función y no un objeto compartido para que cada campo tenga el suyo.
const timeField = () => ({ type: String, default: '' });



// ── UN PROCESO: un pedido de la mesa ──────────────────────────────────
// Los cuatro primeros los lee la IA de la tablet; listo en cocina y entrega se
// anotan a mano. Sin _id propio: un proceso no existe fuera de su rotación.
const Process = new Schema({
    ticketNumber:        { type: String, default: '' },
    dishType:            { type: String, default: '' },   // APPETIZER, PF, POSTRE… la lista vive en Jarvis-express365
    orderTaking:         timeField(),
    markedReadyOnTablet: timeField(),
    readyInTheKitchen:   timeField(),
    dishDelivery:        timeField(),
}, { _id: false });



// ── UN TOQUE DE GERENTE ───────────────────────────────────────────────
// `ref` es null cuando el botón del gerente salió de las cantidades del local
// (Local.touchs) y no de un documento de Manager: entonces `name` es su placa,
// 'G1', 'A2'… `createdAt` es el momento real del clic, que no cambia aunque
// `hourTouch` se corrija a mano. Los toques anteriores a ese campo lo traen null.
const Touch = new Schema({
    ref:       { type: Schema.Types.ObjectId, ref: 'Manager', default: null },
    name:      { type: String, default: '' },
    hourTouch: timeField(),
    createdAt: { type: Date, default: null },
}, { _id: false });



const Rotation = new Schema({

    // OJO: el modelo de usuario se registra como 'user' (minúscula).
    establishment: { type: Schema.Types.ObjectId, ref: 'Local', required: true, immutable: true },
    createdBy:     { type: Schema.Types.ObjectId, ref: 'user',  required: true, immutable: true },

    // El id (UUIDv4) que la rotación ya tiene en Jarvis-express365. Con el
    // índice único de abajo, guardar dos veces la misma rotación responde 409 en
    // vez de duplicarla.
    clientId: { type: String, required: true, immutable: true },

    // Cuándo empezó la rotación, y el día operativo al que pertenece (08:00 a
    // 07:00 en America/Caracas, ver operationalDateOf en dvrFailure.lib.ts). La
    // consulta por fechas filtra por el día operativo: una mesa de las 02:00 es
    // del turno del día anterior.
    date:            { type: Date, required: true },
    operationalDate: { type: Date, required: true },

    tableNumber:        { type: String, required: true, trim: true },
    hourOccupies:       timeField(),   // Ocupa
    hourFirstAttention: timeField(),   // Primera atención
    breakUp:            timeField(),   // Desocupa
    tableCleaning:      timeField(),   // Limpieza

    process: { type: [Process], default: [] },
    touch:   { type: [Touch],   default: [] },

}, { timestamps: true });


Rotation.index({ establishment: 1, clientId: 1 }, { unique: true });
Rotation.index({ establishment: 1, operationalDate: 1 });



export default model('Rotation', Rotation);
