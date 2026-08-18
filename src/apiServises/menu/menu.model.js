import { Schema, model } from 'mongoose';
import { boolean } from 'yup';



const Menu = new Schema({
    es: {
        require: true,
        unique: true,
        type: String
    },

    en: {
        require: true,
        unique: true,
        type: String
    },

    titleForDocumentReport: {
        es: {
            type: String,
            default: null
        },
        en: {
            type: String,
            default: null
        }
    },

    textHeader: {
        es: {
            type: String
        },
        en: {
            type: String
        }
    },

    especial: {
        time: {
            timeInitTitle: {
                es: String,
                en: String
            },
            timeEndTitle: {
                es: String,
                en: String
            }
        }
    },

    timeUnique: {
        type: Boolean,
        require: true
    },

    amountOfSomething: {
        type: Boolean
    },


    time: {
        type: Boolean,
        require: true
    },

    table: {
        type: Boolean,
        require: true,
    },

    managerReferenceId:{
        type: Boolean,
        require: true,
        default: false
    },

    managerReferenceTitle:{
        type: Boolean,
        require: true,
        default: false 
    },

    photos: {
        length: {
            type: Number,
            require: true,
        },
        isRequirePrint: {
            type: Boolean
        },
        caption: [
            {
                index: {
                    type: Number,
                    require: true,
                },
                es: {
                    require: true,
                    type: String
                },
                en: {
                    require: true,
                    type: String
                },
            }
        ],
    },

    doesItrequireVideo: {
        type: Boolean,
        default: false
    },

    // ══════════════════════════════════════════════════════════════════
    // CATEGORÍA OPERATIVA — LISTA FIJA, NO SE ADMINISTRA
    // ══════════════════════════════════════════════════════════════════
    // 'delay', 'food', 'employee', 'protocol'… la lista de siempre.
    //
    // Es fija a propósito, y no es capricho: fuera de acá hay dos sistemas que
    // la leen con nombres escritos a mano y que se despliegan por separado.
    //
    //   · reportes365 agrupa las páginas del reporte por esta cadena y trata
    //     'delay' de forma especial según el nombre de la alerta.
    //   · Jarvis-express365 la tiene hardcodeada en sus JSON ('delay', 'door').
    //
    // Una categoría nueva acá sería una que ninguno de los dos entiende, y el
    // síntoma no sería un error visible: la alerta simplemente no aparecería
    // donde corresponde. Lo administrable es `bonusCategory`, acá abajo.
    category: {
        type: String,
        require: true,
    },

    // NOTA: la categoría de bonificación ya NO vive acá. Se mudó a
    // `BonusRule.bonusCategory` — la regla ya define un criterio de
    // bonificación, y que quince alertas de una misma regla pudieran declarar
    // quince categorías distintas era una contradicción que nada impedía.
    //
    // Los valores viejos siguen en los documentos de Mongo: el esquema dejó de
    // leerlos, pero no se borraron. Se pueden migrar a su regla con una consulta
    // directa a la colección.

    // ══════════════════════════════════════════════════════════════════
    // REGLAS DE BONIFICACIÓN — una por alcance
    // ══════════════════════════════════════════════════════════════════
    // Con qué regla bonifica esta alerta, Y DÓNDE. Es una LISTA porque la misma
    // alerta puede ir con reglas distintas según el establecimiento: en las
    // Franciscas "3 por bono", en los Mister "1 por bono". Con una sola
    // referencia eso no se podía decir.
    //
    // Cada asignación lleva su alcance. Al resolver una novedad se elige la
    // asignación que aplica en ese establecimiento, y gana la MÁS ESPECÍFICA:
    // una por local le gana a una por marca, y ésa a una general. Sin esa
    // prioridad, el resultado dependería del orden de carga — que es lo peor
    // posible cuando decide un pago.
    //
    // El alcance vive ACÁ y no en la regla, a propósito. Una regla es "cuánto y
    // cada cuántas"; dónde se aplica es una decisión de la alerta. Ponerlo en la
    // regla obligaba a duplicar reglas idénticas solo para cambiarles el lugar.
    //
    // La regla sigue siendo una referencia: corregirla corrige todas las alertas
    // que la usan de una vez, que es justo lo que se busca.
    //
    // Lista VACÍA significa que esta alerta NO bonifica —y eso se ve igual que
    // una que todavía nadie revisó, así que conviene mirar `bonusReviewed` para
    // distinguirlas.
    bonusRules: {
        type: [{
            rule: {
                type: Schema.Types.ObjectId,
                ref: 'BonusRule',
                required: true,
            },

            // 'all'    en todos lados. Es lo normal y por eso es el default.
            // 'only'   solo en los que se listan.
            // 'except' en todos MENOS los que se listan.
            scope: {
                mode: { type: String, enum: ['all', 'only', 'except'], default: 'all' },
                franchises: [{ type: Schema.Types.ObjectId, ref: 'Franchise' }],
                locals: [{ type: Schema.Types.ObjectId, ref: 'Local' }],
            },

            _id: false,
        }],
        default: [],
    },

    // Si alguien ya decidió sobre la bonificación de esta alerta.
    //
    // Sin esto, "no bonifica" y "nadie la miró todavía" son el mismo dato
    // (`bonusRules: []`), y con cientos de alertas no habría forma de saber
    // cuánto falta por revisar.
    bonusReviewed: {
        type: Boolean,
        default: false,
    },

    // NOTA: el campo 'especial' completo está definido arriba (líneas 38-49).
    // La línea duplicada 'especial: {}' fue eliminada porque sobreescribía
    // la definición estructurada con un objeto vacío, perdiendo todos los sub-campos.

    isArea: {
        type: Boolean,
        require: true
    },
    isDescriptionPerson: {
        type: Boolean,
        require: true
    },

    car: {
        type: Boolean,
        require: true
    },

    useOnlyForTheReportingDocument: {
        type: Boolean,
        default: false
    },


    useOfLiveAlertForTheCustomer: {
        type: Boolean,
        default: false
    },
    noSubtitleInTheReport: {
        type: Boolean,
        default: false
    },

    groupingInTheReport: {
        type: String,
        enum: {
            values: ['individual', 'dual', 'quadruple'],
            message: "'{VALUE}' is not a valid value. Allowed values are: individual, dual, quadruple"
        },
        default: null
    },


    descriptionNoteForReportDocument: {
        type: Boolean,
        default: false
    },

    // ── BLOQUEO ADMINISTRATIVO ────────────────────────────────────────────
    // true → el documento queda protegido: el PUT de edición y el DELETE lo
    // rechazan con 423 (Locked). Solo un administrador (admin === true) puede
    // poner o quitar el bloqueo, por su endpoint dedicado PATCH /menu/lock —
    // el PUT normal ignora este campo aunque venga en el body.
    isLocked: {
        type: Boolean,
        default: false
    },

    // ── AUTOR DE LA CREACIÓN ──────────────────────────────────────────────
    // Quién creó la alerta/menú. Se setea en el POST desde req.session.userId.
    // Los documentos antiguos no lo tienen (queda null). Se popula al listar con
    // withAudit=true. OJO: el modelo user se registra como 'user' (minúscula).
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        default: null,
        immutable: true   // una edición nunca reescribe al creador original
    },

    // ── AUDITORÍA DE EDICIONES ────────────────────────────────────────────
    // Cada edición registra quién la hizo (ref al usuario) y qué campos cambió
    // con su nuevo valor. Oculto por defecto (select:false) para no inflar el
    // listado; se pide explícito con .select('+updateByUser') al leer un menú.
    // OJO: el modelo user se registra como 'user' (minúscula) — 'User' rompe populate.
    updateByUser: {
        type: [{
            user:   { type: Schema.Types.ObjectId, ref: 'user' },
            change: { type: [{ key: String, value: Schema.Types.Mixed, _id: false }], default: [] },
            date:   { type: Date, default: Date.now },
            _id: false
        }],
        default: [],
        select: false
    }

});


export default model('Menu', Menu);