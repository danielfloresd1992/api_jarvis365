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

    category: {
        type: String,
        require: true,
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

    rulesForBonus: {  // IS DEPRECATED
        forLocal: {},
        worth: {
            type: Number,
            require: true
        },

        amulative: {
            type: Number,
            require: true
        }
    },


    // ── NUEVO SISTEMA DE BONIFICACIÓN ─────────────────────────────────────
    // Reemplaza a rulesForBonus (deprecated). Mapea al reglamento oficial:
    //   worth = multiplicador del bono: 1 (X1), 2 (X2), 3 (X3), 5 (X5)
    //   valueBonusForTheStaffOnDuty: valor en puntos según turno (0.20 / 0.30)
    //   reglamentoCode: código del ítem en el reglamento (ej: "1.1", "R2.3")
    bonusCalculationRules: {
        // true  → esta alerta genera bono al operador
        activate: { type: Boolean, default: false },
        defaultRule: {
            // Multiplicador: 1=X1, 2=X2, 3=X3, 5=X5
            worth:  { type: Number, default: 1 },
            // Veces que debe ocurrir para contarse como bono (ej: "bono a la 2° vez")
            acum:   { type: Number, default: 1 },
            // Valor monetario/puntaje por bono según turno del operador
            valueBonusForTheStaffOnDuty: {
                day:   { type: Number, default: 0.20 },   // turno diurno
                nigth: { type: Number, default: 0.30 }    // turno nocturno / extra
            },
            // Referencia al código del reglamento (ej: "1.1", "R3.2", "E2.1")
            reglamentoCode: { type: String, default: '' },
            // Descripción interna de la regla de bono
            description:    { type: String, default: '' },
            // Indica si la regla está activa por defecto al crear la alerta
            defaultActive:  { type: Boolean, default: true }
        },
        // Reglas específicas por establecimiento (estructura a definir según necesidad)
        localSpecificRules: { type: [], default: [] }
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