import test from 'node:test';
import assert from 'node:assert/strict';
import {
    duracionLegible,
    minutosCaidoHasta,
    captionDeCaida,
    textoDeListaActivas,
    parsearDataUrl,
} from '../src/apiServises/dvrFailure/dvrAlert.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// LO QUE LE LLEGA AL GRUPO
// ══════════════════════════════════════════════════════════════════════
// Estas funciones arman el mensaje que ven personas reales en un grupo de
// WhatsApp. Equivocarlas no rompe nada en el servidor —por eso nadie se entera—
// pero manda un aviso que no se entiende, o peor, uno que dice una hora que no
// es. Son puras, así que probarlas cuesta un segundo:
//
//     npm test
//
// La hora se fija con una zona explícita en cada prueba. Sin eso, el resultado
// dependería de la zona de la máquina que corre el test y fallaría en el
// servidor o en la laptop de otro, que es la peor clase de prueba: la que
// depende de dónde se corre.

const TZ = 'America/Caracas';


test('duracionLegible: minutos sueltos', () => {
    assert.equal(duracionLegible(18), '18m');
    assert.equal(duracionLegible(59), '59m');
});


test('duracionLegible: horas con y sin minutos', () => {
    assert.equal(duracionLegible(60), '1h');
    assert.equal(duracionLegible(102), '1h 42m');
    assert.equal(duracionLegible(120), '2h');
});


test('duracionLegible: días, cortado en dos unidades', () => {
    // 2 días y 3 horas. Los 14 minutos sobrantes NO se muestran: la línea la lee
    // alguien en el teléfono y «2d 3h» ya responde la pregunta.
    assert.equal(duracionLegible(2 * 1440 + 3 * 60 + 14), '2d 3h');
    assert.equal(duracionLegible(1440), '1d');
});


test('duracionLegible: nunca muestra 0 ni un negativo', () => {
    // Un episodio de cuarenta segundos ocurrió. Un 0 se leería como «no pasó
    // nada», y un negativo (relojes desfasados) haría dudar del mensaje entero.
    assert.equal(duracionLegible(0), '1m');
    assert.equal(duracionLegible(-30), '1m');
    assert.equal(duracionLegible(NaN), '1m');
});


test('minutosCaidoHasta: redondea hacia arriba y nunca baja de 1', () => {
    const caida = new Date('2026-08-20T14:00:00Z');

    assert.equal(minutosCaidoHasta(caida, new Date('2026-08-20T15:42:00Z')), 102);

    // Cuarenta segundos → 1 minuto, no 0.
    assert.equal(minutosCaidoHasta(caida, new Date('2026-08-20T14:00:40Z')), 1);

    // Un «ahora» anterior a la caída no produce un negativo.
    assert.equal(minutosCaidoHasta(caida, new Date('2026-08-20T13:00:00Z')), 1);
});


test('captionDeCaida: lleva el establecimiento y la hora', () => {
    // 14:42 UTC son las 10:42 en Caracas.
    const texto = captionDeCaida({
        localName: 'La Trinidad',
        failedAt: new Date('2026-08-20T14:42:00Z'),
        tz: TZ,
    });

    assert.match(texto, /La Trinidad/);
    assert.match(texto, /10:42/);
    // La fecha va además de la hora: la foto se reenvía y se mira al día
    // siguiente, y «10:42» a secas no dice de cuándo es.
    assert.match(texto, /20\/08\/2026/);
});


test('captionDeCaida: un local sin nombre se nota, no queda en blanco', () => {
    const texto = captionDeCaida({
        localName: '   ',
        failedAt: new Date('2026-08-20T14:42:00Z'),
        tz: TZ,
    });

    assert.match(texto, /Establecimiento sin nombre/);
});


test('textoDeListaActivas: sin fallas devuelve null (no se manda nada)', () => {
    // Es la decisión de diseño más importante del archivo: el silencio es lo que
    // hace que el grupo siga abriendo el mensaje el día que sí hay algo.
    assert.equal(textoDeListaActivas({ fallas: [], ahora: new Date(), tz: TZ }), null);
    assert.equal(textoDeListaActivas({ fallas: null as any, ahora: new Date(), tz: TZ }), null);
});


test('textoDeListaActivas: ordena de la más vieja a la más nueva', () => {
    const ahora = new Date('2026-08-20T16:00:00Z');

    const texto = textoDeListaActivas({
        ahora,
        tz: TZ,
        fallas: [
            { localName: 'Los Palos Grandes', failedAt: new Date('2026-08-20T15:42:00Z') }, // 18m
            { localName: 'La Trinidad', failedAt: new Date('2026-08-20T14:18:00Z') },       // 1h 42m
        ],
    });

    assert.ok(texto);
    // La que lleva más tiempo caída es la que más urge: va primero.
    assert.ok(
        texto!.indexOf('La Trinidad') < texto!.indexOf('Los Palos Grandes'),
        'la caída más vieja debe aparecer primero',
    );

    assert.match(texto!, /La Trinidad — 1h 42m/);
    assert.match(texto!, /Los Palos Grandes — 18m/);
});


test('textoDeListaActivas: el encabezado concuerda en número', () => {
    const ahora = new Date('2026-08-20T16:00:00Z');
    const una = [{ localName: 'La Trinidad', failedAt: new Date('2026-08-20T15:00:00Z') }];

    assert.match(textoDeListaActivas({ fallas: una, ahora, tz: TZ })!, /1 establecimiento sin conexión/);

    const dos = [...una, { localName: 'Chacao', failedAt: new Date('2026-08-20T15:30:00Z') }];
    assert.match(textoDeListaActivas({ fallas: dos, ahora, tz: TZ })!, /2 establecimientos sin conexión/);
});


// ── La foto que viene dentro del JSON ────────────────────────────────────
// `buffer_img` llega de la app de estación y es un dato de AFUERA: puede venir
// vacío, truncado o no ser una imagen. Ninguna de esas cosas puede impedir que
// el aviso de la caída salga.

const pngDeVerdad = (): string => {
    // 200 bytes de relleno: suficiente para pasar el mínimo de tamaño.
    const bytes = Buffer.alloc(200, 7).toString('base64');
    return `data:image/png;base64,${bytes}`;
};


test('parsearDataUrl: una imagen válida se decodifica', () => {
    const foto = parsearDataUrl(pngDeVerdad());

    assert.ok(foto);
    assert.equal(foto!.mimeType, 'image/png');
    assert.equal(foto!.extension, '.png');
    assert.equal(foto!.buffer.length, 200);
});


test('parsearDataUrl: jpeg se guarda con extensión .jpg', () => {
    const bytes = Buffer.alloc(200, 7).toString('base64');
    const foto = parsearDataUrl(`data:image/jpeg;base64,${bytes}`);

    assert.equal(foto!.mimeType, 'image/jpeg');
    assert.equal(foto!.extension, '.jpg');
});


test('parsearDataUrl: lo que no es una imagen devuelve null', () => {
    assert.equal(parsearDataUrl(null), null);
    assert.equal(parsearDataUrl(''), null);
    assert.equal(parsearDataUrl('   '), null);
    assert.equal(parsearDataUrl('https://ejemplo.com/foto.png'), null);
    assert.equal(parsearDataUrl('data:application/pdf;base64,AAAA'), null);
});


test('parsearDataUrl: un base64 truncado NO se manda como adjunto roto', () => {
    // `Buffer.from` no lanza con base64 corrupto: devuelve los pocos bytes que
    // pudo leer. Sin el mínimo de tamaño, en el grupo aparecería un adjunto roto
    // justo cuando hay que atender una caída.
    assert.equal(parsearDataUrl('data:image/png;base64,iVBORw0KGgo='), null);
});
