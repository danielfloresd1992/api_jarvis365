// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE FRANCISCA DAVIE — sacado del plano que usa el local
// ══════════════════════════════════════════════════════════════════════
// Pasado a mano de la imagen del plano (2026-11-26), con el formato de
// floorPlan.schema.js. El plano son dos dibujos, el Salón y la Terraza, y aquí
// van uno encima del otro, como en la imagen. Las mesas están donde están unas
// respecto de otras, pero, como los dos juntos quedan más altos que anchos, aquí
// van más separadas de lado a lado (el Salón 1,8 veces, la Terraza 1,4) y con
// menos hueco de arriba abajo, para que llenen el visor de insights365 en vez
// de quedar como una columna estrecha. Las mesas miden 60, como en el plano a
// escala.
//
//   Salón     arriba las parejas 31/32, 33/34, 35/36 y la 37; en medio las
//             parejas de pie 20/21, 22/23, 24/25, 26/27 y la columna 28–30;
//             abajo las parejas 11/12, 13/14, 15/16, 17/18 y la 19
//   Terraza   50, 51/52 y 53; 47, 48 y 49; 41, 42/43; y a la derecha el
//             recuadro de la entrada con 44/45 y 46 debajo
//
// Lo que el plano no dice y aquí es una suposición, para corregir en Client365:
//   - las sillas (cap): 4 en cada mesa;
//   - no van: lo tachado en rojo en la terraza (ya no está), el
//     estacionamiento, el área de host, las entradas de la pared del salón ni la
//     cocina y la barra, que en el plano son solo nombres fuera de la pared.
//
// Lo carga scripts/cargar-croquis.js. Una vez guardado, manda lo que haya en la
// base: lo que se corrija en Client365 no se pisa salvo con --forzar.



// mesa = «una pieza del croquis»
const mesa = (zona, label, x, y, { kind = 'cuadrada', w = 60, h = 60, cap = 4 } = {}) => ({
    id: `fdv-${zona}-${label}`.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase(),
    zona, kind, label, x, y, w, h, cap,
});

// fila = «mesas pegadas, de izquierda a derecha»
const fila = (zona, labels, x, y) => labels.map((label, index) => mesa(zona, label, x + index * 60, y));

// columna = «mesas pegadas, de arriba abajo»
const columna = (zona, labels, x, y) => labels.map((label, index) => mesa(zona, label, x, y + index * 60));


export default {
    establishment: '637a7cec1a8ed7ed7d7e71f5',   //  Francisca Davie
    name: 'Francisca Davie',
    board: { w: 1120, h: 900, grid: 20 },
    zonas: [
        { id: 'salon', label: 'Salón' },
        { id: 'terraza', label: 'Terraza' },
    ],
    piezas: [
        //  Salón: la fila de arriba, 31/32, 33/34, 35/36 y 37
        ...fila('salon', ['31', '32'], 120, 70), ...fila('salon', ['33', '34'], 370, 70), ...fila('salon', ['35', '36'], 640, 70),
        mesa('salon', '37', 890, 70),

        //  …en medio, las parejas de pie y la columna 28–30
        ...columna('salon', ['20', '21'], 160, 180), ...columna('salon', ['22', '23'], 390, 180),
        ...columna('salon', ['24', '25'], 590, 180), ...columna('salon', ['26', '27'], 800, 180),
        ...columna('salon', ['28', '29', '30'], 1040, 140),

        //  …y la fila de abajo, 11/12, 13/14, 15/16, 17/18 y 19
        ...fila('salon', ['11', '12'], 30, 380), ...fila('salon', ['13', '14'], 280, 380), ...fila('salon', ['15', '16'], 530, 380),
        ...fila('salon', ['17', '18'], 790, 380), mesa('salon', '19', 1040, 380),

        //  Terraza: 50, 51/52 y 53 arriba; 47, 48 y 49 en medio; 41 y 42/43 abajo
        mesa('terraza', '50', 40, 580), ...fila('terraza', ['51', '52'], 190, 580), mesa('terraza', '53', 430, 580),
        mesa('terraza', '47', 40, 700), mesa('terraza', '48', 240, 700), mesa('terraza', '49', 430, 700),
        mesa('terraza', '41', 40, 820), ...fila('terraza', ['42', '43'], 250, 820),

        //  …y a la derecha el recuadro de la entrada, con 44/45 y 46 debajo
        mesa('terraza', 'Entrada', 740, 520, { kind: 'mueble', w: 350, h: 280, cap: 0 }),
        ...fila('terraza', ['44', '45'], 740, 820), mesa('terraza', '46', 950, 820),
    ],
};
