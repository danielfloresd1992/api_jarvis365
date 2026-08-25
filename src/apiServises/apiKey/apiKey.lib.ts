import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// ══════════════════════════════════════════════════════════════════════
// CÓMO SE FABRICA Y CÓMO SE COMPRUEBA UNA LLAVE
// ══════════════════════════════════════════════════════════════════════
// Todo lo criptográfico de las API keys vive acá, y nada más. No sabe de Mongo,
// no sabe de Express: recibe cadenas y devuelve cadenas. Por eso se puede probar
// entera con `npm test`, que es justo lo que uno quiere de la pieza que decide
// quién entra.
//
//
// LA FORMA DE UNA LLAVE
//
//     jk_a1b2c3d4e5f6a7b8.9f8e7d6c...   (64 hex)
//     ─┬ ──────┬───────── ──────┬─────
//      │       │                └── el SECRETO: lo único que prueba identidad
//      │       └── el keyId: público, sirve para BUSCARLA en la base
//      └── prefijo, para reconocerla de un vistazo en un log o un .env
//
// El keyId va por delante para poder encontrar la llave en la base con UNA
// consulta por índice. Sin él habría que traer todas las llaves y compararlas
// una por una en cada petición.
//
//
// POR QUÉ HMAC Y NO BCRYPT
//
// El proyecto ya usa bcrypt para las contraseñas de las personas, y para eso es
// lo correcto: bcrypt es LENTO a propósito, para que a nadie le sirva probar
// millones de contraseñas robadas. Pero una contraseña se verifica una vez al
// día y una API key se verifica en CADA petición: bcrypt con 10 rondas tarda
// ~100 ms, y eso convertiría cualquier consulta de la IA en algo que se siente
// roto. HMAC-SHA256 tarda microsegundos.
//
// La lentitud de bcrypt tampoco haría falta acá: una contraseña la elige una
// persona y suele ser adivinable; este secreto son 32 bytes de azar, y contra
// eso no hay diccionario que sirva.
//
// Y hay algo que bcrypt NO da y acá sí hace falta: el HMAC se calcula con una
// LLAVE DEL SERVIDOR (API_KEY_SECRET). Quien se lleve la base entera no puede
// fabricar una llave válida sin ese secreto, porque no sabría qué hash escribir.
// Eso es exactamente «saber si es correcta y no fue alterada».


/** El prefijo con el que empieza toda llave de este sistema. */
export const PREFIJO = 'jk_';

/** La cabecera por la que se manda. Es la estándar de HTTP. */
export const CABECERA = 'authorization';


/**
 * Una llave recién fabricada.
 *
 * `plaintext` es lo ÚNICO que se le muestra al administrador, una sola vez, y no
 * se guarda en ningún lado. `secretHash` es lo que va a la base.
 */
export interface LlaveNueva {
    keyId: string;
    plaintext: string;
    secretHash: string;
}


/**
 * Fabrica una llave nueva.
 *
 * `randomBytes` es el generador criptográfico del sistema operativo, no
 * `Math.random`: éste último es predecible si se conocen unas pocas salidas, y
 * una llave predecible no es una llave.
 *
 * Ocho bytes para el keyId (16 hex) y treinta y dos para el secreto (64 hex). El
 * keyId solo tiene que ser único —es un identificador, no un secreto— y el
 * secreto tiene 256 bits, que es lo que hace que adivinarlo no sea una
 * estrategia.
 *
 * @param serverSecret  el valor de API_KEY_SECRET
 */
export const generarApiKey = (serverSecret: string): LlaveNueva => {
    exigirSecretoDelServidor(serverSecret);

    const keyId = randomBytes(8).toString('hex');
    const secreto = randomBytes(32).toString('hex');

    return {
        keyId,
        plaintext: `${PREFIJO}${keyId}.${secreto}`,
        secretHash: firmarSecreto(secreto, serverSecret),
    };
};


/**
 * La firma de un secreto, con la llave del servidor.
 *
 * Es lo que se guarda en la base. Del hash no se puede volver al secreto, así
 * que una copia de la base no le sirve a nadie para entrar.
 */
export const firmarSecreto = (secreto: string, serverSecret: string): string => {
    exigirSecretoDelServidor(serverSecret);

    return createHmac('sha256', serverSecret).update(secreto).digest('hex');
};


/**
 * Parte una llave en sus dos mitades.
 *
 * Acepta tanto la llave pelada como la cabecera completa `Bearer jk_…`, porque
 * las dos formas van a llegar: la primera desde un script, la segunda desde
 * cualquier cliente HTTP que se respete.
 *
 * Devuelve `null` ante cualquier cosa con forma distinta. Esto recibe texto de
 * afuera, así que no puede lanzar: un 401 es la respuesta correcta a una llave
 * mal escrita, no un 500.
 */
export const parsearApiKey = (bruto?: string | null): { keyId: string; secreto: string } | null => {
    const texto = String(bruto ?? '').trim();
    if (!texto) return null;

    // `Bearer jk_…` → `jk_…`. La comparación es sin distinguir mayúsculas
    // porque el estándar lo permite y hay clientes que mandan «bearer».
    const sinEsquema = /^bearer\s+/i.test(texto) ? texto.replace(/^bearer\s+/i, '').trim() : texto;

    if (!sinEsquema.startsWith(PREFIJO)) return null;

    const cuerpo = sinEsquema.slice(PREFIJO.length);
    const partes = cuerpo.split('.');
    if (partes.length !== 2) return null;

    const [keyId, secreto] = partes;

    // Longitudes exactas: son las que produce `generarApiKey`. Cualquier otra
    // cosa no la generó este sistema, y descartarla acá evita ir a la base.
    if (!/^[0-9a-f]{16}$/.test(keyId)) return null;
    if (!/^[0-9a-f]{64}$/.test(secreto)) return null;

    return { keyId, secreto };
};


/**
 * ¿El secreto presentado corresponde a este hash?
 *
 * La comparación es en TIEMPO CONSTANTE. Un `===` normal se detiene en el primer
 * carácter distinto, y esa diferencia de microsegundos, medida muchas veces,
 * deja adivinar el hash carácter por carácter. `timingSafeEqual` siempre tarda
 * lo mismo.
 *
 * Los dos búferes tienen que medir igual o `timingSafeEqual` lanza; por eso se
 * comprueba antes la longitud, que no es secreta.
 */
export const secretoCoincide = (secreto: string, hashGuardado: string, serverSecret: string): boolean => {
    if (!secreto || !hashGuardado) return false;

    try {
        const calculado = Buffer.from(firmarSecreto(secreto, serverSecret), 'utf8');
        const guardado = Buffer.from(String(hashGuardado), 'utf8');

        if (calculado.length !== guardado.length) return false;

        return timingSafeEqual(calculado, guardado);
    }
    catch {
        return false;
    }
};


/**
 * Los últimos caracteres de una llave, para poder reconocerla en una lista.
 *
 * El administrador que ve cinco llaves necesita distinguirlas sin que ninguna se
 * muestre entera. Con el keyId y estos cuatro alcanza.
 */
export const pistaDeLlave = (keyId: string): string => `${PREFIJO}${keyId}.…`;


/**
 * Sin llave del servidor no se firma nada.
 *
 * Falla RUIDOSAMENTE y al arrancar, no en silencio. Si `API_KEY_SECRET` no está
 * puesta, firmar con una cadena vacía produciría hashes que cualquiera puede
 * recalcular — todas las llaves del sistema valdrían lo mismo que nada, y no se
 * notaría hasta que fuera tarde.
 */
function exigirSecretoDelServidor(serverSecret: string): void {
    if (!serverSecret || String(serverSecret).length < 32) {
        throw new Error(
            'API_KEY_SECRET no está definida o es demasiado corta (mínimo 32 caracteres). '
            + 'Sin ella no se pueden firmar ni verificar las API keys.',
        );
    }
}


export default { generarApiKey, firmarSecreto, parsearApiKey, secretoCoincide, pistaDeLlave };
