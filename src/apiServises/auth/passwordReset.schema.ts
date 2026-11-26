import { object, string } from 'yup';
import { EMAIL_SHAPE, RESET_APP_NAMES } from './passwordReset.lib.js';

// ══════════════════════════════════════════════════════════════════════
// LO QUE ACEPTAN LAS RUTAS DE RESTABLECER LA CONTRASEÑA
// ══════════════════════════════════════════════════════════════════════
// Se validan con `abortEarly: false` y `stripUnknown: true`: todos los errores
// juntos y nada que no esté declarado. La contraseña se valida aparte, con
// `validateSecurityPass`, que es la regla que ya usa el registro.
//
// NO SE USA `.trim()` NI `.lowercase()` DE YUP. Llaman al método del valor sin
// mirar qué es, y un `{ "token": {} }` (lo que queda de `{ "$gt": "" }` después
// de mongoSanitize) revienta con TypeError y sale 500. `clean` solo toca texto;
// lo demás llega tal cual a la comprobación de tipo y sale 400.


// clean = «quita los espacios de los lados, y si se pide pasa a minúsculas, solo si es texto»
const clean = (lowercase = false) => (value: unknown) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return lowercase ? trimmed.toLowerCase() : trimmed;
};

// TOKEN = «el token del enlace, como texto»
const TOKEN = string()
    .typeError('El token del enlace tiene que ser texto.')
    .transform(clean())
    .required('Falta el token del enlace.');


/** POST /auth/password/forgot: el correo y a qué portal va el enlace. */
export const forgotSchema = object({
    email: string()
        .typeError('El correo tiene que ser texto.')
        .transform(clean(true))
        .required('Falta el correo.')
        .max(254, 'El correo es demasiado largo.')
        .matches(EMAIL_SHAPE, 'El correo no tiene forma de correo.'),
    app: string()
        .oneOf(RESET_APP_NAMES, `El portal tiene que ser uno de: ${RESET_APP_NAMES.join(', ')}.`)
        .default('insights'),
});


/** POST /auth/password/reset/check: el token del enlace. */
export const resetCheckSchema = object({
    token: TOKEN,
});


/** POST /auth/password/reset: el token y la contraseña nueva. */
export const resetSchema = object({
    token: TOKEN,
    // Sin recortar: un espacio en la contraseña es un error que tiene que ver la
    // persona (validateSecurityPass lo rechaza), no algo que se borre callando.
    password: string()
        .typeError('La contraseña tiene que ser texto.')
        .required('Falta la contraseña nueva.')
        .max(128, 'La contraseña es demasiado larga.'),
});
