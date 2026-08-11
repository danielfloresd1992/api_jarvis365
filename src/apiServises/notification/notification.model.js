import mongoose from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// NOTIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Un hecho ocurrido en el sistema que alguien debe conocer: se creó un
// establecimiento, se desactivó a una persona, se solicitó un cambio de horario.
//
// TRES DECISIONES QUE EXPLICAN EL MODELO
//
// 1. El ACTOR y el RECURSO se referencian Y se copian.
//    La referencia sirve para navegar (abrir el perfil de quien lo hizo, ir al
//    establecimiento). La copia del nombre sirve para LEER: una notificación de
//    hace seis meses tiene que seguir diciendo "Daniel Flores desactivó a
//    Francisca Doral" aunque el establecimiento se haya borrado o la persona
//    haya cambiado de nombre. Sin la copia, el histórico se vacía solo.
//
// 2. El texto se guarda en ESPAÑOL e INGLÉS, ya renderizado.
//    Se podría guardar solo la plantilla y traducir al leer, pero entonces
//    cambiar una plantilla reescribiría el pasado. Se guarda el texto final.
//
// 3. Lo LEÍDO no vive acá.
//    Está en notificationRead: una notificación global la reciben 76 personas y
//    cada una la lee cuando quiere. Un arreglo de lectores dentro del documento
//    crecería sin techo y obligaría a reescribirlo en cada apertura.

// Qué cambió, campo por campo. Alimenta el detalle "de X a Y".
const ChangeSchema = new mongoose.Schema({
    field: { type: String, required: true },   // clave técnica: 'inabilited'
    label: { type: String, default: '' },      // legible: 'Estado'
    from: { type: mongoose.Schema.Types.Mixed, default: null },
    to: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const TextSchema = new mongoose.Schema({
    title: { type: String, default: '' },
    body: { type: String, default: '' },
}, { _id: false });


const NotificationSchema = new mongoose.Schema({

    // Tipo del hecho: 'establishment.created', 'franchise.deleted'…
    // Es la clave con la que notification.strategy.js elige cómo construirla.
    type: { type: String, required: true, index: true },

    // FAMILIA VISUAL. La declara la estrategia del tipo y viaja al cliente para
    // que sepa cómo pintar la notificación sin tener que parsear el `type`.
    //
    // Si el front dedujera la apariencia partiendo la cadena por el punto,
    // agregar un tipo nuevo obligaría a tocar el front también, y un tipo mal
    // escrito caería en un estilo cualquiera sin avisar. Con la familia
    // explícita, el backend decide y el front solo obedece.
    //
    //   schedule → horario y asistencia: guardia, permisos, faltas, día extra,
    //              horas extras, entrada y salida
    //   resource → establecimientos y franquicias
    //   system   → anuncios de la plataforma
    family: {
        type: String,
        enum: ['schedule', 'resource', 'system', 'attendance', 'comment', 'general'],
        default: 'general',
        index: true,
    },

    // Datos PROPIOS de la familia, que solo su vista sabe leer.
    //
    // Una notificación de marcaje necesita llevar las fotos de entrada y
    // salida, los minutos de retardo y las unidades de descuento; una de
    // establecimiento, nada de eso. Darle a cada familia sus campos en el
    // esquema llenaría el modelo de propiedades vacías para las demás.
    //
    // Es Mixed a propósito: acá el esquema no valida la forma porque la forma
    // la define la estrategia que la escribe y la vista que la lee.
    meta: { type: mongoose.Schema.Types.Mixed, default: null },

    // A quién le llega.
    //   global   → a todos los usuarios
    //   personal → solo a los de `recipients`
    //   admin    → solo a administradores (declarado; aún no se emite)
    scope: {
        type: String,
        enum: ['global', 'personal', 'admin'],
        default: 'global',
        index: true,
    },

    // Destinatarios. Solo se usa con scope 'personal'.
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user', index: true }],

    // ── Quién lo hizo ──────────────────────────────────────────────────
    actor: {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null },
        name: { type: String, default: '' },
        surName: { type: String, default: '' },
        img: { type: String, default: null },
    },

    // ── Sobre quién ────────────────────────────────────────────────────
    // El TERCERO afectado. En una solicitud de cambio de horario intervienen
    // tres personas distintas y las tres tienen que quedar registradas:
    //   actor            → quién solicitó
    //   target           → de quién es el horario que se cambia
    //   request.decidedBy → quién aprobó o rechazó
    // Sin este campo, "Kervis solicitó un cambio" no dice a quién afecta.
    target: {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null },
        name: { type: String, default: '' },
        surName: { type: String, default: '' },
        img: { type: String, default: null },
    },

    // ── Sobre qué ──────────────────────────────────────────────────────
    resource: {
        // 'establishment' | 'franchise' | 'user' | 'schedule' …
        kind: { type: String, default: '' },
        id: { type: mongoose.Schema.Types.ObjectId, default: null },
        name: { type: String, default: '' },
        // Ruta del front para abrirlo desde la campana
        path: { type: String, default: '' },
        // Logo del recurso (el `image` del establecimiento). Se COPIA por la
        // misma razón que el nombre: el aviso tiene que seguir mostrando de qué
        // establecimiento se hablaba aunque después le cambien el logo o lo
        // borren. Vacío cuando el recurso no tiene imagen — franquicias, por
        // ejemplo —, y ahí la campana cae a un ícono según `kind`.
        img: { type: String, default: null },
    },

    action: {
        type: String,
        enum: ['created', 'updated', 'deleted', 'activated', 'deactivated', 'requested', 'approved', 'rejected'],
        default: 'updated',
    },

    changes: { type: [ChangeSchema], default: [] },

    // Texto ya renderizado en los dos idiomas
    i18n: {
        es: { type: TextSchema, default: () => ({}) },
        en: { type: TextSchema, default: () => ({}) },
    },

    // ── Solicitudes de cambio ──────────────────────────────────────────
    // Queda listo para el flujo de aprobación: un usuario `super` solicita un
    // cambio de horario y queda 'pending' hasta que un administrador decide.
    // Con status 'none' la notificación es un simple aviso.
    request: {
        // 'withdrawn' es distinto de 'rejected' a propósito: rechazar es un
        // administrador negando un cambio ajeno, y retirar es quien lo pidió
        // arrepintiéndose. Con un solo estado la auditoría diría "rechazada
        // por Kervis" cuando Kervis nunca llegó a verla.
        status: {
            type: String,
            enum: ['none', 'pending', 'approved', 'rejected', 'withdrawn'],
            default: 'none',
            index: true,
        },
        // Qué se aplicaría si se aprueba. Se guarda el payload completo para
        // que la aprobación no dependa de reconstruirlo.
        payload: { type: mongoose.Schema.Types.Mixed, default: null },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null },
        decidedAt: { type: Date, default: null },
        note: { type: String, default: '' },
    },

    // Prioridad visual en la campana
    level: {
        type: String,
        enum: ['info', 'success', 'warning', 'danger'],
        default: 'info',
    },

}, { timestamps: true });


// La campana pide "lo más reciente que me toca". Este índice cubre las dos
// consultas: las globales y las dirigidas a un usuario.
NotificationSchema.index({ scope: 1, createdAt: -1 });
NotificationSchema.index({ recipients: 1, createdAt: -1 });

// Las solicitudes PENDIENTES se consultan por dos caminos calientes: al pintar
// la grilla del horario y antes de aceptar una solicitud nueva, para ver si otra
// ya tomó esa celda. Las dos filtran por tipo y estado.
NotificationSchema.index({ type: 1, 'request.status': 1 });


const NotificationModel = mongoose.model('notification', NotificationSchema);
export default NotificationModel;
