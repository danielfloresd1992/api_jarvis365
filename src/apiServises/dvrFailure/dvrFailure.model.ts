import { Schema, model, Types } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// CAÍDA DE CONEXIÓN CON EL DVR/NVR
// ══════════════════════════════════════════════════════════════════════
// Un establecimiento se queda sin cámaras y deja de poder monitorearse. Pasa
// varias veces al día y en locales distintos, así que no alcanza con saber
// cuáles están caídos AHORA: hace falta el historial para poder decir qué local
// se cae más y cuánto tiempo estuvo ciego.
//
// Reemplaza a la caché en memoria del recurso `failed`, que solo respondía "qué
// hay caído en este momento" y perdía todo al reiniciar el servidor. Ese recurso
// queda como puente de compatibilidad — ver `failed.routes.js`.
//
//
// UN DOCUMENTO POR EPISODIO, NO POR EVENTO
//
// La caída y su restablecimiento son el MISMO hecho visto desde los dos
// extremos, así que van en un solo documento: se crea al caerse y se cierra al
// volver. Con dos documentos sueltos —uno "cayó" y otro "volvió"— habría que
// aparearlos en cada consulta para saber cuánto duró, y bastaría con un
// restablecimiento sin su caída para que el par no cerrara nunca.
//
// De acá salen las tres preguntas que hace el negocio:
//
//   ¿qué hay caído ahora?      →  active: true
//   ¿cuántas veces se cayó X?  →  contar documentos del local
//   ¿cuánto estuvo ciego?      →  sumar downtimeMinutes
//
//
// POR QUÉ SE GUARDAN LOS NOMBRES Y NO SOLO LAS REFERENCIAS
//
// Un local se renombra y un operador se da de baja. El historial tiene que
// seguir diciendo lo que decía el día que ocurrió, no lo que diría hoy al
// resolver la referencia. Las referencias se guardan igual, para poder cruzar;
// los nombres, para poder leer.

export interface DvrFailureDoc {

    // ── Dónde ─────────────────────────────────────────────────────────
    local: Types.ObjectId;
    localName: string;

    // ── Quién la pasó ─────────────────────────────────────────────────
    reportedBy: Types.ObjectId | null;
    reportedByName: string;

    /** Turno del operador que reportó. No se deduce de la hora — ver abajo. */
    shift: 'Diurno' | 'Nocturno' | null;

    // ── Cuándo ────────────────────────────────────────────────────────
    failedAt: Date;
    operationalDate: Date;

    // ── Estado ────────────────────────────────────────────────────────
    active: boolean;
    restoredAt: Date | null;
    restoredBy: Types.ObjectId | null;
    restoredByName: string;
    downtimeMinutes: number | null;

    // ── Rastro ────────────────────────────────────────────────────────
    noveltie: Types.ObjectId | null;
    alert: Types.ObjectId | null;
    alertName: string;
    evidence: string;
    note: string;

    createdAt: Date;
    updatedAt: Date;
}

const DvrFailure = new Schema<DvrFailureDoc>({

    // ══════════════════════════════════════════════════════════════════
    // EL ESTABLECIMIENTO
    // ══════════════════════════════════════════════════════════════════
    local: {
        type: Schema.Types.ObjectId,
        ref: 'Local',
        required: true,
        immutable: true,
    },

    // El nombre que tenía el día de la caída. Ver la nota de la cabecera.
    localName: { type: String, default: '', trim: true },


    // ══════════════════════════════════════════════════════════════════
    // QUIÉN LA PASÓ
    // ══════════════════════════════════════════════════════════════════
    // Sale de la SESIÓN, no del cuerpo de la petición. Quien reporta es quien
    // está autenticado; aceptarlo del cuerpo permitiría cargar una caída a
    // nombre de otro, y esto mide el trabajo de la estación de monitoreo.
    reportedBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        default: null,
        immutable: true,
    },

    reportedByName: { type: String, default: '', trim: true },

    // ── Turno ─────────────────────────────────────────────────────────
    // En este sistema el turno es del OPERADOR, no de la hora: lo declara su
    // horario de trabajo (`user.workSchedule.shiftType`). Por eso se recibe y no
    // se calcula del reloj — una caída a las 07:00 puede ser del nocturno que
    // todavía no salió.
    //
    // Admite null: sin turno la estadística general sale igual, solo que no se
    // puede desglosar por turno.
    shift: {
        type: String,
        enum: ['Diurno', 'Nocturno', null],
        default: null,
    },


    // ══════════════════════════════════════════════════════════════════
    // CUÁNDO
    // ══════════════════════════════════════════════════════════════════

    // La hora real de la caída. Se puede recibir, para poder cargar una caída
    // detectada antes de alcanzar a reportarla; si no viene, es ahora.
    failedAt: {
        type: Date,
        required: true,
        immutable: true,
    },

    // ── El día operativo al que pertenece ─────────────────────────────
    // La jornada de monitoreo va de las 08:00 a las 07:00 del día siguiente, así
    // que una caída de las 02:00 pertenece al día anterior. Se guarda calculado
    // —y no se deriva en cada consulta— porque es la clave por la que se agrupa
    // toda la estadística, y agrupar por un campo indexado es lo que la hace
    // barata.
    //
    // Es medianoche UTC del día en que ABRE la jornada, igual que en asistencia.
    operationalDate: {
        type: Date,
        required: true,
        immutable: true,
    },


    // ══════════════════════════════════════════════════════════════════
    // ESTADO
    // ══════════════════════════════════════════════════════════════════
    // `active` es el interruptor: true mientras el local siga ciego.
    active: { type: Boolean, default: true },

    restoredAt: { type: Date, default: null },

    restoredBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        default: null,
    },

    restoredByName: { type: String, default: '', trim: true },

    // ── Cuánto duró ───────────────────────────────────────────────────
    // Se sella al restablecer en vez de calcularse al leer. Se podría restar
    // `restoredAt - failedAt` en cada consulta, pero entonces sumar el tiempo
    // ciego de un mes obligaría a recorrer y restar documento por documento; con
    // el número ya guardado es un $sum directo.
    //
    // null mientras la caída siga activa: todavía no hay duración, y un 0 se
    // confundiría con "volvió al instante".
    downtimeMinutes: { type: Number, default: null, min: 0 },


    // ══════════════════════════════════════════════════════════════════
    // RASTRO
    // ══════════════════════════════════════════════════════════════════
    // De qué novedad salió. Permite ir de la estadística a la evidencia sin
    // duplicar acá lo que la novedad ya guarda.
    noveltie: {
        type: Schema.Types.ObjectId,
        ref: 'Noveltie',
        default: null,
    },

    // Qué alerta del catálogo la reportó. Se guarda la REFERENCIA para no volver
    // a atar este recurso a un _id escrito a mano, que es de donde venimos.
    alert: {
        type: Schema.Types.ObjectId,
        ref: 'Menu',
        default: null,
    },

    alertName: { type: String, default: '', trim: true },

    // La captura del monitor. Se guarda la URL que devolvió multimedia, no la
    // imagen: un historial de meses con las fotos adentro no entra en un
    // documento de Mongo.
    evidence: { type: String, default: '', trim: true },

    note: { type: String, default: '', trim: true },

}, { timestamps: true });


// ══════════════════════════════════════════════════════════════════════
// UNA SOLA CAÍDA ACTIVA POR ESTABLECIMIENTO
// ══════════════════════════════════════════════════════════════════════
// Lo impone la base y no el código a propósito. Comprobar antes de insertar deja
// una ventana entre la comprobación y la escritura, y dos estaciones reportando
// el mismo local a la vez —que es justo lo que pasa cuando se cae un DVR— caben
// de sobra en esa ventana. Con el índice, la segunda recibe un 11000 que
// `asyncHandler` ya traduce a 409.
//
// Es PARCIAL: solo alcanza a las activas. Sin eso un local no podría volver a
// caerse nunca, porque su caída cerrada del mes pasado ocuparía el lugar.
DvrFailure.index(
    { local: 1 },
    { unique: true, partialFilterExpression: { active: true } },
);

// La consulta del panel: qué hay caído, lo más reciente primero.
DvrFailure.index({ active: 1, failedAt: -1 });

// El historial y la estadística: por rango de días, y por local dentro del rango.
DvrFailure.index({ operationalDate: -1, local: 1 });


export default model<DvrFailureDoc>('DvrFailure', DvrFailure);
