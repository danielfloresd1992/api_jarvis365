import { Schema, model } from 'mongoose';
import { isTakeOutTable } from './rotation.lib.js';
import { SHIFTS } from './rotation.schema.js';



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
// anotan a mano. Lleva su propio _id para poder corregirlo una vez guardado.
const Process = new Schema({
    ticketNumber:        { type: String, default: '' },
    dishType:            { type: String, default: '' },   // APPETIZER, PF, POSTRE… la lista vive en Jarvis-express365
    orderTaking:         timeField(),
    markedReadyOnTablet: timeField(),
    readyInTheKitchen:   timeField(),
    dishDelivery:        timeField(),
});



// ── UN TOQUE DE GERENTE ───────────────────────────────────────────────
// `ref` es null cuando el botón del gerente salió de las cantidades del local
// (Local.touchs) y no de un documento de Manager: entonces `name` es su placa,
// 'G1', 'A2'… `createdAt` es el momento real del clic, que no cambia aunque
// `hourTouch` se corrija a mano. Los toques anteriores a ese campo lo traen null.
// `recovered` es true cuando el toque se apuntó DESPUÉS, desde la pestaña
// Registros de Jarvis-express365 (en una rotación ya guardada), y no en vivo desde
// Mesas. false por defecto. Los toques anteriores al campo no lo traen: el GET usa
// lean(), que no pone el valor por defecto, así que quien lee trata su ausencia como false.
// Como el proceso, lleva su propio _id para poder corregirlo una vez guardado.
const Touch = new Schema({
    ref:       { type: Schema.Types.ObjectId, ref: 'Manager', default: null },
    name:      { type: String, default: '' },
    hourTouch: timeField(),
    createdAt: { type: Date, default: null },
    recovered: { type: Boolean, default: false },
});



// ── UN CAMBIO: lo que alguien corrigió después de guardarla ───────────
// Una línea por dato cambiado: quién, cuándo, en qué (`target`: el _id de la
// rotación, de uno de sus procesos o de uno de sus toques), qué propiedad, y el
// valor de antes y el nuevo. El usuario va como referencia y no como nombre:
// pesa menos y se trae con populate cuando haga falta.
const Change = new Schema({
    user:      { type: Schema.Types.ObjectId, ref: 'user', required: true },
    changedAt: { type: Date, default: Date.now },
    target:    { type: Schema.Types.ObjectId, required: true },
    property:  { type: String, required: true },
    oldValue:  { type: Schema.Types.Mixed, default: null },
    newValue:  { type: Schema.Types.Mixed, default: null },
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

    // Pedido para llevar: una rotación hueca, que no es una mesa ocupada y solo
    // contiene el proceso del pedido. Su mesa es el ticket con '#' ('#110'), y no
    // lleva Ocupa, Primera atención, Desocupa, Limpieza ni toques. NO se manda en
    // el body: sale de tableNumber antes de validar (el pre('validate') de abajo),
    // así nunca contradice a la mesa, tampoco cuando se corrige.
    takeOut: { type: Boolean, default: false },

    // El turno de la rotación: de día ('day') o de noche ('night'), y nada más
    // (SHIFTS, en rotation.schema.js). null es «todavía no se dijo»: así nacen
    // las que se guardan sin él y las de antes de existir el campo.
    shift: { type: String, enum: [...SHIFTS, null], default: null },

    // Rotación recuperada: true cuando no se guardó en su momento desde Mesas y se
    // anotó a mano después, desde la pestaña Registros de Jarvis-express365. false
    // por defecto. Como la del toque: las de antes de existir el campo no la traen
    // en el GET (lean), y su ausencia es false.
    recovered: { type: Boolean, default: false },

    hourOccupies:       timeField(),   // Ocupa
    hourFirstAttention: timeField(),   // Primera atención
    breakUp:            timeField(),   // Desocupa
    tableCleaning:      timeField(),   // Limpieza

    process: { type: [Process], default: [] },
    touch:   { type: [Touch],   default: [] },

    // Los cambios hechos después de guardarla, del más viejo al más nuevo. Los
    // escribe el servidor: el body no los trae (rotation.schema.js no los tiene).
    changes: { type: [Change], default: [] },

}, { timestamps: true });


// takeOut sigue siempre a la mesa: con '#' delante es un pedido para llevar (isTakeOutTable).
Rotation.pre('validate', function () {
    this.takeOut = isTakeOutTable(this.tableNumber);
});


Rotation.index({ establishment: 1, clientId: 1 }, { unique: true });
Rotation.index({ establishment: 1, operationalDate: 1 });

// El PUT busca la rotación por el _id de lo que se corrige, que puede ser el de
// uno de sus procesos o toques: sin estos, cada corrección recorrería la colección.
Rotation.index({ 'process._id': 1 });
Rotation.index({ 'touch._id': 1 });



export default model('Rotation', Rotation);
