// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE FRANCISCA DORAL — sacado del plano que usa el local
// ══════════════════════════════════════════════════════════════════════
// Pasado a mano de la imagen del plano (2026-11-25), con el formato de
// floorPlan.schema.js. Las mesas están donde estaban unas respecto de otras,
// pero más juntas: se quitó el hueco del centro (el logo) y lo que sobraba
// entre las mesas de cada zona.
//
//   arriba   Zona 3 · Zona 2 · Zona 1
//   abajo    Barra  · Zona 5 · Terraza
//
// Lo que el plano no dice y aquí es una suposición, para corregir en Client365:
//   - las sillas (cap): 4 en las cuadradas, 2 en las estrechas y en la barra,
//     6 en las dos largas;
//   - las mesas en rombo (22, 23, 26, 27, 32, 33, 35, 36) están giradas 45° en
//     el plano; el formato todavía no guarda giros y van derechas;
//   - «12.3 y 12.1» va tal cual. Como no es un número, la regla de los informes
//     la contaría como barra.
//
// Lo carga scripts/cargar-croquis.js. Una vez guardado, manda lo que haya en la
// base: lo que se corrija en Client365 no se pisa salvo con --forzar.



// mesa = «una pieza del croquis»
const mesa = (zona, label, x, y, { kind = 'cuadrada', w = 40, h = 40, cap = 4 } = {}) => ({
    id: `fd-${zona}-${label}`.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase(),
    zona, kind, label, x, y, w, h, cap,
});

// estrecha = «una mesa de dos, más alta que ancha» (las filas de la Zona 1, la Zona 5 y la barra)
const estrecha = (zona, label, x, y) => mesa(zona, label, x, y, { w: 40, h: 60, cap: 2 });

// fila = «mesas estrechas pegadas, de izquierda a derecha»
const fila = (zona, labels, x, y) => labels.map((label, index) => estrecha(zona, label, x + index * 40, y));


export default {
    establishment: '637a7ae31a8ed7ed7d7e71e0',   //  Francisca Doral
    name: 'Francisca Doral',
    board: { w: 980, h: 680, grid: 20 },
    zonas: [
        { id: 'zona-1', label: 'Zona 1' },
        { id: 'zona-2', label: 'Zona 2' },
        { id: 'zona-3', label: 'Zona 3' },
        { id: 'zona-5', label: 'Zona 5' },
        { id: 'barra', label: 'Barra' },
        { id: 'terraza', label: 'Terraza' },
    ],
    piezas: [
        //  Zona 3: tres arriba, cuatro abajo
        mesa('zona-3', '33', 40, 20), mesa('zona-3', '32', 120, 20), mesa('zona-3', '31', 200, 20),
        mesa('zona-3', '34', 20, 120), mesa('zona-3', '35', 80, 120), mesa('zona-3', '36', 140, 120), mesa('zona-3', '37', 200, 120),

        //  Zona 2: cuatro arriba, cuatro abajo
        mesa('zona-2', '24', 280, 20), mesa('zona-2', '23', 340, 20), mesa('zona-2', '22', 420, 20), mesa('zona-2', '21', 480, 20),
        mesa('zona-2', '25', 280, 120), mesa('zona-2', '26', 340, 120), mesa('zona-2', '27', 420, 120), mesa('zona-2', '28', 480, 120),

        //  Zona 1: la fila del 11 al 2, la larga «12.3 y 12.1» y la 1, de pie a la derecha
        ...fila('zona-1', ['11', '10', '9', '8', '7', '6', '5', '4', '3', '2'], 560, 20),
        mesa('zona-1', '12.3 y 12.1', 760, 140, { kind: 'larga', w: 120, h: 40, cap: 6 }),
        mesa('zona-1', '1', 920, 100, { kind: 'larga', w: 40, h: 120, cap: 6 }),

        //  Barra: B10 y B11, B9 y B12, la fila B5…B1 y la columna B6, B7, B8 bajo la B5
        mesa('barra', 'B10', 40, 280, { w: 60, h: 40, cap: 2 }),
        mesa('barra', 'B11', 140, 280, { kind: 'redonda', w: 40, h: 60, cap: 2 }),
        mesa('barra', 'B9', 20, 360, { kind: 'redonda', cap: 2 }),
        mesa('barra', 'B12', 120, 360, { w: 60, h: 40, cap: 2 }),
        ...fila('barra', ['B5', 'B4', 'B3', 'B2', 'B1'], 20, 420),
        estrecha('barra', 'B6', 20, 480), estrecha('barra', 'B7', 20, 540), estrecha('barra', 'B8', 20, 600),

        //  Zona 5: la fila del 60 al 51 y, debajo, 61, 62 y 63
        ...fila('zona-5', ['60', '59', '58', '57', '56', '55', '54', '53', '52', '51'], 260, 280),
        mesa('zona-5', '61', 440, 380), mesa('zona-5', '62', 520, 380), mesa('zona-5', '63', 600, 380),

        //  Terraza: 41 y 42 arriba, 44 y 43 abajo
        mesa('terraza', '41', 720, 280), mesa('terraza', '42', 800, 280),
        mesa('terraza', '44', 720, 360), mesa('terraza', '43', 800, 360),
    ],
};
