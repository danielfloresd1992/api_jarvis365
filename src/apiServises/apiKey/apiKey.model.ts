import { Schema, model, Types } from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// LAS LLAVES QUE DEJAN ENTRAR A UN PROGRAMA
// ══════════════════════════════════════════════════════════════════════
// Una fila por llave emitida. Sirve para tres cosas, y las tres importan:
//
//   1. VERIFICAR — el `keyId` que viene en la cabecera busca acá su fila, y el
//      `secretHash` dice si el secreto presentado es el bueno.
//   2. REVOCAR — poner `active` en false apaga una llave al instante, sin tener
//      que cambiar la llave del servidor (que apagaría TODAS a la vez).
//   3. RENDIR CUENTAS — quién la creó, cuándo, y cuándo se usó por última vez.
//      Sin esto, el día que haga falta saber qué programa está consultando qué,
//      no habría a quién preguntarle.
//
//
// EL SECRETO NO ESTÁ ACÁ
//
// Lo que se guarda es la FIRMA del secreto (HMAC-SHA256 con API_KEY_SECRET), no
// el secreto. De la firma no se puede volver atrás, así que una copia de esta
// colección no le sirve a nadie para entrar — y ni siquiera para fabricar una
// llave nueva, porque para eso haría falta también la llave del servidor.
//
// El texto plano se le muestra al administrador UNA vez, al crearla, y no se
// guarda en ningún lado. Si lo pierde, se revoca y se emite otra: es más barato
// que tener el secreto escrito en algún lugar del que después haya que sacarlo.


export interface ApiKeyDoc {
    /** Para qué es esta llave. Lo escribe quien la crea: «Asistente IA», «Panel Grafana». */
    name: string;

    /** La mitad pública de la llave. Es por donde se la busca. */
    keyId: string;

    /** La FIRMA del secreto. Nunca sale en una respuesta. */
    secretHash: string;

    /** Qué puede hacer. Hoy solo se emite 'read'; el campo existe para no tener
     *  que migrar el día que haga falta una llave que escriba. */
    scopes: string[];

    /** Apagada = no entra. Es la revocación. */
    active: boolean;

    /** Quién la creó. Sale de la sesión del administrador, no del cuerpo. */
    createdBy: Types.ObjectId | null;
    createdByName: string;

    /** Cuándo caduca sola. `null` = no caduca. */
    expiresAt: Date | null;

    /** Rastro de uso, para saber si una llave sigue viva o quedó olvidada. */
    lastUsedAt: Date | null;
    usageCount: number;

    createdAt: Date;
    updatedAt: Date;
}


const ApiKey = new Schema<ApiKeyDoc>({

    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
    },

    keyId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
    },

    // `select: false` — la misma protección que usa `user.model` con la
    // contraseña. Así una consulta distraída (`find()` sin `.select()`) no puede
    // sacar la firma de todas las llaves y devolverla en una respuesta. Para
    // verificar hay que pedirla A PROPÓSITO con `.select('+secretHash')`, y ese
    // gesto explícito es el que impide el accidente.
    secretHash: {
        type: String,
        required: true,
        select: false,
    },

    scopes: {
        type: [String],
        default: ['read'],
    },

    active: {
        type: Boolean,
        default: true,
    },

    // `ref: 'user'` en minúscula: así está registrado el modelo
    // (`model('user', …)` en user.model.js). Con 'User' el populate no
    // encontraría nada y fallaría en silencio.
    //
    // `immutable` porque quién emitió una llave es un hecho: si se pudiera
    // reescribir, el registro dejaría de servir para lo único que sirve, que es
    // saber a quién preguntarle por ella.
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        default: null,
        immutable: true,
    },

    createdByName: {
        type: String,
        default: '',
        trim: true,
        immutable: true,
    },

    expiresAt: {
        type: Date,
        default: null,
    },

    lastUsedAt: {
        type: Date,
        default: null,
    },

    usageCount: {
        type: Number,
        default: 0,
        min: 0,
    },

}, { timestamps: true });


// La consulta de CADA petición autenticada por llave: buscar por keyId. Es un
// índice único, así que además impide que dos llaves compartan identificador —
// cosa que haría ambigua la verificación.
ApiKey.index({ keyId: 1 }, { unique: true });

// La lista del panel de integraciones: primero las vivas, y dentro de ésas la
// más reciente arriba.
ApiKey.index({ active: -1, createdAt: -1 });


export default model<ApiKeyDoc>('ApiKey', ApiKey);
