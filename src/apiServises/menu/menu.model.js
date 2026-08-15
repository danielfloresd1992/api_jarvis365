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

    // ══════════════════════════════════════════════════════════════════
    // CATEGORÍA DE BONIFICACIÓN — administrable
    // ══════════════════════════════════════════════════════════════════
    // Con qué criterio se agrupa esta alerta para los cortes de bonificación.
    // Es independiente de la operativa: dos alertas de categorías distintas
    // pueden bonificar por el mismo concepto, y al revés.
    //
    // Guarda el `value` del catálogo (BonusCategory) como CADENA y no como
    // referencia, por el mismo motivo que `category`: convertirla en ref
    // obligaría a migrar todo lo ya cargado.
    //
    // Es OPCIONAL: las alertas que ya existen no tienen ninguna y siguen
    // funcionando igual.
    bonusCategory: {
        type: String,
        default: null,
        trim: true,
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

    // ══════════════════════════════════════════════════════════════════
    // SISTEMA DE BONIFICACIÓN
    // ══════════════════════════════════════════════════════════════════
    // Reemplaza a `rulesForBonus` y a `bonusCalculationRules`, que se
    // retiraron. Los dos guardaban lo mismo de dos formas distintas y ninguno
    // se consumía en ningún lado; migrarlos era mas barato que sostenerlos.
    //
    // Se lee en TRES CAPAS, de la más general a la más específica, y gana la
    // más específica solo en los campos que declara:
    //
    //     defaultRule          todos los establecimientos
    //     franchiseExceptions  por marca — el reglamento dice "SOLO FRANCISCAS"
    //     localExceptions      un establecimiento concreto
    //
    // Un establecimiento nuevo entra por `defaultRule` sin que nadie lo
    // agregue. Con una lista de ids, en cambio, el día que abre una Francisca
    // la alerta dejaría de bonificar ahí sin que nada lo indicara.
    //
    // La resolución vive en libs/bonus — acá solo se guarda.
    bonusSystem: {

        // El interruptor. En false no se evalúa nada y la novedad se sella con
        // `appliesBonus: false`. Apagado NO es lo mismo que "vale cero": lo
        // primero es una decisión, lo segundo un valor.
        isEnabled: { type: Boolean, default: false },

        // ── La regla general ──────────────────────────────────────────
        defaultRule: {
            bonifies: { type: Boolean, default: true },

            // Multiplicador del bono. Junto con la acumulación expresa las
            // proporciones del reglamento: "3x1" es acumulación 3 y valor 1;
            // "1x2" es acumulación 1 y valor 2.
            bonusWorth: { type: Number, default: 1, min: 0 },

            // Cuántas veces tiene que ocurrir para contar como bono.
            // Mínimo 1 porque es DIVISOR en el corte: un 0 daría infinito y un
            // negativo, bonos negativos. Los datos que se migraron traían
            // catorce valores negativos.
            accumulationRequired: { type: Number, default: 1, min: 1 },

            // Valor del punto según el turno del operador.
            pointValue: {
                day: { type: Number, default: 0.20 },
                night: { type: Number, default: 0.30 },
            },

            // Umbrales propios de ESTA alerta: { minutes: 30 }. El reglamento
            // tiene casos como "15 minutos en Doral, 30 en las demás". Va como
            // Mixed porque cada alerta tiene los suyos; el precio es que nadie
            // los valida, así que el nombre de la clave importa.
            thresholdParams: { type: Schema.Types.Mixed, default: null },
        },

        // ── Las excepciones ───────────────────────────────────────────
        // `null` en un campo = hereda de la capa de arriba. Solo se declara lo
        // que cambia, así una excepción que solo toca la acumulación no repite
        // el valor del bono.
        franchiseExceptions: [{
            franchise: { type: Schema.Types.ObjectId, ref: 'Franchise', required: true },
            bonifies: { type: Boolean, default: null },
            bonusWorth: { type: Number, default: null },
            accumulationRequired: { type: Number, default: null },
            thresholdParams: { type: Schema.Types.Mixed, default: null },
            note: { type: String, default: '' },
            _id: false,
        }],

        localExceptions: [{
            local: { type: Schema.Types.ObjectId, ref: 'Local', required: true },
            bonifies: { type: Boolean, default: null },
            bonusWorth: { type: Number, default: null },
            accumulationRequired: { type: Number, default: null },
            thresholdParams: { type: Schema.Types.Mixed, default: null },

            // Por qué este establecimiento es distinto. Se muestra al lado de
            // la excepción: sin esto, en seis meses nadie sabe si fue una
            // decisión o un error de carga. Los datos viejos ya tenían ese
            // problema — guardaban el NOMBRE del local junto al id, y uno quedó
            // como "Yacambu" en una alerta y "La Villa" en otra tras un cambio
            // de nombre. Por eso acá se guarda el id y nada más.
            note: { type: String, default: '' },
            _id: false,
        }],

        // Código del ítem en el reglamento: "1.1", "R2.6", "E4.3".
        regulationCode: { type: String, default: '' },
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