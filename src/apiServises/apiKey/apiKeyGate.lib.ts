// ══════════════════════════════════════════════════════════════════════
// ¿QUÉ LE DEJAMOS HACER A UNA LLAVE?
// ══════════════════════════════════════════════════════════════════════
// Una llave de solo lectura tiene que poder LEER y nada más. Suena a que
// alcanza con mirar el verbo HTTP —dejar pasar GET y negar el resto— y en una
// API bien educada alcanzaría. En ésta no.
//
// Está acá y no dentro del middleware por lo mismo que `dvrGate.lib.ts`: es la
// regla que decide si alguien puede o no hacer algo, y equivocarla no se ve.
// Pura, sin Express y sin Mongo, para poder probarla entera.
//
//
// POR QUÉ NO ALCANZA CON EL VERBO
//
// Dos rutas de este proyecto son GET y sin embargo ESCRIBEN:
//
//     GET /document/exit         hace deleteOne() sobre la tarea del usuario
//     GET /document/resume/:id   crea una tarea nueva (new SMU_MODEL)
//
// Un candado que solo mirara el método las dejaría pasar creyendo que son
// lectura. La primera es la peor: filtra por `req.session.userId`, que en una
// petición con llave viene `undefined` — y un `undefined` en un filtro de
// Mongoose no acota nada.
//
// La lista de abajo es fea a propósito. Documenta una deuda del proyecto —esas
// dos rutas deberían ser POST y DELETE— en vez de esconderla. El día que se
// arreglen, la lista se vacía sola y este archivo se simplifica.


/** Los métodos que de verdad no cambian nada. */
export const METODOS_DE_LECTURA = ['GET', 'HEAD', 'OPTIONS'];


/**
 * Los GET que escriben, por el trozo de ruta que los identifica.
 *
 * Se comparan por inclusión y no por igualdad porque la ruta real llega con el
 * prefijo de la API delante —que cambia entre desarrollo y producción— y a
 * veces con parámetros detrás.
 */
export const GET_QUE_ESCRIBEN = [
    '/document/exit',
    '/document/resume/',
];


/** El permiso que hace falta para escribir. Una llave sin esto solo lee. */
export const PERMISO_DE_ESCRITURA = 'write';


export interface PeticionDeLlave {
    /** El verbo HTTP, tal como llega. */
    metodo?: string | null;

    /** La ruta completa, con prefijo y query si los trae. */
    ruta?: string | null;

    /** Lo que la llave tiene permitido. */
    scopes?: string[] | null;
}


/**
 * ¿Esta petición solo lee?
 *
 * Las dos condiciones, y las dos tienen que darse: que el método sea de
 * lectura Y que la ruta no esté en la lista de tramposas.
 *
 * Un método desconocido o vacío cuenta como escritura. Es el lado prudente: si
 * no se sabe qué hace, no se deja pasar con una llave de lectura.
 */
export const esPeticionDeLectura = ({ metodo, ruta }: PeticionDeLlave): boolean => {

    const verbo = String(metodo ?? '').toUpperCase();
    if (!METODOS_DE_LECTURA.includes(verbo)) return false;

    // La ruta se compara en minúsculas: el enrutador de Express distingue
    // mayúsculas, pero no conviene que el candado dependa de eso.
    const camino = String(ruta ?? '').toLowerCase();

    return !GET_QUE_ESCRIBEN.some(tramposa => camino.includes(tramposa.toLowerCase()));
};


/**
 * ¿Se le deja pasar a esta llave?
 *
 * Pasa si la petición solo lee, o si la llave tiene permiso de escritura. Hoy
 * ninguna se emite con `write` —el esquema solo admite `read`—, así que en la
 * práctica esto niega toda escritura; el permiso existe para el día que haga
 * falta una llave que cargue datos, sin tener que volver a tocar esta regla.
 *
 * Ante la duda, NIEGA: sin scopes, con scopes vacíos o con una ruta que no se
 * pudo leer, la respuesta es que no. Una llave que no puede leer se nota en
 * cinco minutos y se arregla; una que puede borrar sin que nadie lo sepa, no.
 */
export const llavePuedePasar = ({ metodo, ruta, scopes }: PeticionDeLlave): boolean => {

    if (esPeticionDeLectura({ metodo, ruta })) return true;

    return Array.isArray(scopes) && scopes.includes(PERMISO_DE_ESCRITURA);
};


/**
 * El motivo, para poder decírselo a quien llama.
 *
 * Un 403 que solo dice «prohibido» manda a leer código. Éste distingue los dos
 * casos, y el segundo —un GET que en realidad escribe— es justo el que nadie
 * entendería sin ayuda.
 */
export const motivoDelRechazo = ({ metodo, ruta }: PeticionDeLlave): string => {

    const verbo = String(metodo ?? '').toUpperCase();
    const camino = String(ruta ?? '').toLowerCase();

    if (METODOS_DE_LECTURA.includes(verbo)) {
        return 'Esta ruta modifica datos aunque se pida con GET, así que una llave de solo lectura no puede usarla.';
    }

    return `Una llave de solo lectura no puede hacer ${verbo || 'esta operación'}.`;
};


export default llavePuedePasar;
