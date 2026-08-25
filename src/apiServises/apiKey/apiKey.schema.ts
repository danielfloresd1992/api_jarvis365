import * as yup from 'yup';

// ══════════════════════════════════════════════════════════════════════
// LO QUE SE ACEPTA AL EMITIR UNA LLAVE
// ══════════════════════════════════════════════════════════════════════
// Poco, y a propósito. Casi todo lo que define una llave lo pone el servidor:
// el identificador, el secreto, la firma, quién la creó. Del cliente solo viene
// para qué es y cuánto dura.
//
// Lo que NO se acepta del cuerpo, y por qué:
//
//   keyId / secretHash  los fabrica `apiKey.lib`. Aceptarlos dejaría que
//                       alguien eligiera su propia llave, o peor, escribiera
//                       directamente una firma.
//   createdBy           sale de la sesión. Del cuerpo permitiría emitir una
//                       llave a nombre de otro administrador.
//   active              una llave nace viva. Se apaga por su endpoint, que deja
//                       rastro de quién la apagó.


/**
 * El nombre de la llave: para qué es y de quién.
 *
 * Obligatorio y con un mínimo real. Una lista de cinco llaves llamadas «test»
 * no se puede administrar: llegado el momento de revocar una, nadie sabe cuál
 * apaga qué, y el miedo a romper algo hace que no se revoque ninguna.
 */
const nombre = yup.string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(80, 'El nombre no puede pasar de 80 caracteres')
    .required('Hay que decir para qué es la llave');


/**
 * Qué puede hacer la llave.
 *
 * Hoy solo se emite 'read'. El campo existe desde ahora para no tener que
 * migrar la colección el día que haga falta una llave que escriba, y está
 * limitado a la lista conocida para que nadie invente un permiso que después
 * nadie comprueba.
 */
const permisos = yup.array()
    .of(yup.string().oneOf(['read'], 'Solo se admite el permiso «read» por ahora'))
    .min(1, 'La llave necesita al menos un permiso')
    .default(['read']);


/**
 * Cuándo caduca sola.
 *
 * Opcional: `null` es una llave que no caduca, que es lo que hace falta para una
 * integración permanente. Cuando se manda, tiene que ser futura — una llave que
 * nace vencida es un error de quien la pide, no algo que convenga guardar.
 */
const caducidad = yup.date()
    .min(new Date(), 'La fecha de caducidad tiene que ser futura')
    .nullable()
    .default(null);


/** POST /api-key — emitir una llave nueva. */
export const crearApiKeySchema = yup.object({
    name: nombre,
    scopes: permisos,
    expiresAt: caducidad,
});


export default crearApiKeySchema;
