// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE FRANCISCA ORLANDO — sacado del plano que usa el local
// ══════════════════════════════════════════════════════════════════════
// Pasado a mano de la imagen del plano (2026-11-26), con el formato de
// floorPlan.schema.js. Las mesas están donde están unas respecto de otras. Las
// dos franjas negras parten el comedor en tres bandas, y aquí son tres zonas,
// con algo más de hueco entre ellas para el nombre de cada una; de lado a lado
// van algo más juntas (1,15 unidades por píxel de la imagen, con mesas de
// 50 × 60), para que el plano llene el visor de insights365.
//
//   Zona 1   entre las dos banquetas de arriba: 1–8 y, debajo, 16–9
//   Zona 2   la banda del medio: 18–25, 35–27 y las redondas 17 (junto a la
//            entrada principal) y 26 (junto a la barra)
//   Zona 3   entre las dos banquetas de abajo: 36–44 y, debajo, 53–45
//   Barra    los taburetes B1–B8 alrededor de la barra
//
// Lo que el plano no dice y aquí es una suposición, para corregir en Client365:
//   - los nombres de las zonas: el plano no los dice;
//   - las sillas (cap): 2 en las mesas de banqueta, 6 en las redondas 17 y
//     26, 1 en cada taburete;
//   - no van: las franjas negras (tabiques), la cuña negra entre 18–25 y
//     35–27, las entradas ni el recuadro de Take Out (es para llevar, sin
//     mesas). Las franjas grises van como banquetas.
//
// Lo carga scripts/cargar-croquis.js. Una vez guardado, manda lo que haya en la
// base: lo que se corrija en Client365 no se pisa salvo con --forzar.



// mesa = «una pieza del croquis»
const mesa = (zona, label, x, y, { kind = 'cuadrada', w = 50, h = 60, cap = 2 } = {}) => ({
    id: `for-${zona}-${label}`.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase(),
    zona, kind, label, x, y, w, h, cap,
});

// banqueta = «una franja gris del plano», de punta a punta del comedor
const banqueta = (zona, numero, y) => ({ ...mesa(zona, 'Banqueta', 170, y, { kind: 'mueble', w: 680, h: 30, cap: 0 }), id: `for-${zona}-banqueta-${numero}` });

// fila = «una fila de mesas»: cada grupo empieza en su x y sus mesas van pegadas de izquierda a derecha
const fila = (zona, grupos, y) => grupos.flatMap(([x, ...labels]) => labels.map((label, index) => mesa(zona, label, x + index * 50, y)));

// taburete = «un puesto de la barra»
const taburete = (label, x, y) => mesa('barra', label, x, y, { kind: 'taburete', w: 50, h: 50, cap: 1 });

// Dónde empieza cada pareja: las filas de arriba (1–25) y las de abajo (27–53) no van alineadas, como en el plano
const ARRIBA = [200, 380, 560, 740];
const ABAJO = [180, 290, 440, 590, 740];


export default {
    establishment: '69b83a826cf018e265a155db',   //  Francisca Orlando
    name: 'Francisca Orlando',
    board: { w: 1440, h: 940, grid: 20 },
    zonas: [
        { id: 'zona-1', label: 'Zona 1' },
        { id: 'zona-2', label: 'Zona 2' },
        { id: 'zona-3', label: 'Zona 3' },
        { id: 'barra', label: 'Barra' },
    ],
    piezas: [
        //  Zona 1: banqueta, 1/2 3/4 5/6 7/8, 16/15 14/13 12/11 10/9, banqueta
        banqueta('zona-1', 1, 60),
        ...fila('zona-1', [[ARRIBA[0], '1', '2'], [ARRIBA[1], '3', '4'], [ARRIBA[2], '5', '6'], [ARRIBA[3], '7', '8']], 100),
        ...fila('zona-1', [[ARRIBA[0], '16', '15'], [ARRIBA[1], '14', '13'], [ARRIBA[2], '12', '11'], [ARRIBA[3], '10', '9']], 180),
        banqueta('zona-1', 2, 240),

        //  Zona 2: banqueta, 18/19 20/21 22/23 24/25, las redondas 17 y 26 a los lados, 35 34/33 32/31 30/29 28/27, banqueta
        banqueta('zona-2', 1, 350),
        ...fila('zona-2', [[ARRIBA[0], '18', '19'], [ARRIBA[1], '20', '21'], [ARRIBA[2], '22', '23'], [ARRIBA[3], '24', '25']], 380),
        mesa('zona-2', '17', 30, 430, { kind: 'redonda', w: 120, h: 120, cap: 6 }),
        mesa('zona-2', '26', 890, 430, { kind: 'redonda', w: 120, h: 120, cap: 6 }),
        ...fila('zona-2', [[ABAJO[0], '35'], [ABAJO[1], '34', '33'], [ABAJO[2], '32', '31'], [ABAJO[3], '30', '29'], [ABAJO[4], '28', '27']], 530),
        banqueta('zona-2', 2, 590),

        //  Zona 3: banqueta, 36 37/38 39/40 41/42 43/44, 53 52/51 50/49 48/47 46/45, banqueta
        banqueta('zona-3', 1, 700),
        ...fila('zona-3', [[ABAJO[0], '36'], [ABAJO[1], '37', '38'], [ABAJO[2], '39', '40'], [ABAJO[3], '41', '42'], [ABAJO[4], '43', '44']], 740),
        ...fila('zona-3', [[ABAJO[0], '53'], [ABAJO[1], '52', '51'], [ABAJO[2], '50', '49'], [ABAJO[3], '48', '47'], [ABAJO[4], '46', '45']], 820),
        banqueta('zona-3', 2, 880),

        //  Barra: B4…B8 encima de la barra y B3, B2, B1 a su izquierda
        ...['B4', 'B5', 'B6', 'B7', 'B8'].map((label, index) => taburete(label, 950 + index * 100, 700)),
        taburete('B3', 890, 760), taburete('B2', 890, 815), taburete('B1', 890, 870),
        mesa('barra', 'Barra', 950, 760, { kind: 'barra', w: 460, h: 160, cap: 0 }),
    ],
};
