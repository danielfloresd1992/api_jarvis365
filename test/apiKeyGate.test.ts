import test from 'node:test';
import assert from 'node:assert/strict';
import {
    esPeticionDeLectura,
    llavePuedePasar,
    motivoDelRechazo,
    GET_QUE_ESCRIBEN,
} from '../src/apiServises/apiKey/apiKeyGate.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// EL CANDADO DE LAS LLAVES DE SOLO LECTURA
// ══════════════════════════════════════════════════════════════════════
// Esta regla decide si un programa con una llave puede tocar los datos. Que se
// equivoque hacia el lado permisivo no rompe nada visible: simplemente deja
// borrar. Por eso se prueba entera, y por eso todas las pruebas de abajo que
// importan son las que comprueban que NIEGA.
//
//     npm test

const SOLO_LECTURA = ['read'];
const CON_ESCRITURA = ['read', 'write'];

const PREFIJO = '/api_jarvis/v1';


test('los GET normales pasan', () => {
    assert.equal(llavePuedePasar({ metodo: 'GET', ruta: `${PREFIJO}/novelty`, scopes: SOLO_LECTURA }), true);
    assert.equal(llavePuedePasar({ metodo: 'HEAD', ruta: `${PREFIJO}/local`, scopes: SOLO_LECTURA }), true);
    assert.equal(llavePuedePasar({ metodo: 'OPTIONS', ruta: `${PREFIJO}/local`, scopes: SOLO_LECTURA }), true);
});


test('minúsculas o mayúsculas en el método dan igual', () => {
    assert.equal(llavePuedePasar({ metodo: 'get', ruta: `${PREFIJO}/novelty`, scopes: SOLO_LECTURA }), true);
});


test('todo lo que escribe se niega', () => {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        assert.equal(
            llavePuedePasar({ metodo, ruta: `${PREFIJO}/document/xxx`, scopes: SOLO_LECTURA }),
            false,
            `${metodo} debería negarse`,
        );
    }
});


test('LOS DOS GET QUE ESCRIBEN se niegan igual', () => {
    // El caso que un candado que solo mirara el verbo dejaría pasar. `exit`
    // hace deleteOne() y `resume` crea una tarea: son GET solo de nombre.
    assert.equal(
        llavePuedePasar({ metodo: 'GET', ruta: `${PREFIJO}/document/exit`, scopes: SOLO_LECTURA }),
        false,
    );
    assert.equal(
        llavePuedePasar({ metodo: 'GET', ruta: `${PREFIJO}/document/resume/68a1f2c3d4e5f6a7b8c9d0e1`, scopes: SOLO_LECTURA }),
        false,
    );
});


test('las rutas tramposas se reconocen con cualquier prefijo de API', () => {
    // El prefijo cambia entre desarrollo y producción; el candado no puede
    // depender de cuál esté puesto.
    assert.equal(esPeticionDeLectura({ metodo: 'GET', ruta: '/api_jarvis_dev/v1/document/exit' }), false);
    assert.equal(esPeticionDeLectura({ metodo: 'GET', ruta: '/api_jarvis/v1/document/exit' }), false);
    // Y con parámetros detrás.
    assert.equal(esPeticionDeLectura({ metodo: 'GET', ruta: `${PREFIJO}/document/exit?debug=1` }), false);
});


test('una ruta que solo SE PARECE a una tramposa sí pasa', () => {
    // `/document/exits` no es `/document/exit`… pero por inclusión lo contiene.
    // Se documenta el comportamiento real: la comparación es por inclusión, así
    // que esto se niega. Es el lado prudente y hoy no existe tal ruta.
    assert.equal(esPeticionDeLectura({ metodo: 'GET', ruta: `${PREFIJO}/document/exits` }), false);

    // Una ruta claramente distinta no se ve afectada.
    assert.equal(esPeticionDeLectura({ metodo: 'GET', ruta: `${PREFIJO}/document/getPage/123` }), true);
});


test('con permiso de escritura pasa todo', () => {
    assert.equal(llavePuedePasar({ metodo: 'DELETE', ruta: `${PREFIJO}/document/xxx`, scopes: CON_ESCRITURA }), true);
    assert.equal(llavePuedePasar({ metodo: 'GET', ruta: `${PREFIJO}/document/exit`, scopes: CON_ESCRITURA }), true);
});


test('ante la duda, NIEGA', () => {
    // Sin scopes, vacíos, o basura: no se pasa. Una llave que no puede leer se
    // arregla en cinco minutos; una que puede borrar sin que nadie lo sepa, no.
    assert.equal(llavePuedePasar({ metodo: 'DELETE', ruta: `${PREFIJO}/x`, scopes: null }), false);
    assert.equal(llavePuedePasar({ metodo: 'DELETE', ruta: `${PREFIJO}/x`, scopes: [] }), false);
    assert.equal(llavePuedePasar({ metodo: 'DELETE', ruta: `${PREFIJO}/x`, scopes: undefined }), false);

    // Un método desconocido cuenta como escritura.
    assert.equal(llavePuedePasar({ metodo: 'TRACE', ruta: `${PREFIJO}/x`, scopes: SOLO_LECTURA }), false);
    assert.equal(llavePuedePasar({ metodo: '', ruta: `${PREFIJO}/x`, scopes: SOLO_LECTURA }), false);
    assert.equal(llavePuedePasar({ metodo: null, ruta: null, scopes: SOLO_LECTURA }), false);
});


test('el motivo distingue los dos casos', () => {
    // Un 403 que solo dice «prohibido» manda a leer código.
    assert.match(
        motivoDelRechazo({ metodo: 'DELETE', ruta: `${PREFIJO}/document/xxx` }),
        /no puede hacer DELETE/,
    );
    // El caso que nadie entendería sin ayuda.
    assert.match(
        motivoDelRechazo({ metodo: 'GET', ruta: `${PREFIJO}/document/exit` }),
        /modifica datos aunque se pida con GET/,
    );
});


test('la lista de rutas tramposas no está vacía por accidente', () => {
    // Si alguien la vacía sin arreglar las rutas, el candado deja de proteger
    // justo el caso que no se ve. Esta prueba lo delata.
    assert.ok(GET_QUE_ESCRIBEN.length >= 2);
    assert.ok(GET_QUE_ESCRIBEN.includes('/document/exit'));
});
