// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE FRANCISCA MIAMI — sacado del plano que usa el local
// ══════════════════════════════════════════════════════════════════════
// Pasado a mano de la imagen del plano (2026-11-26), con el formato de
// floorPlan.schema.js. Las mesas están donde están unas respecto de otras,
// pero el plano es mucho más ancho que alto, y aquí va algo más junto de lado
// a lado (los pasillos, la cocina) y algo más estirado de arriba abajo, para
// que llene el visor de insights365 en vez de quedar como una franja.
//
//   izquierda   Salón izquierdo: la banqueta con 1–14 y, más adentro, 15–29
//   centro      Barra: la cocina con B12…B5 a su derecha y el bar con B4…B1
//   derecha     Salón derecho: la redonda 42, 43–48 y la banqueta con 30–41
//
// Lo que el plano no dice y aquí es una suposición, para corregir en Client365:
//   - las zonas: el plano no las nombra, y se partió el salón por la cocina;
//   - las sillas (cap): 2 en las mesas de banqueta, 4 en las cuadradas, 8 en
//     la redonda 42 y 1 en cada puesto de barra;
//   - la entrada (arriba, sobre la cocina) no va: es un hueco en la pared, no
//     una pieza.
//
// Lo carga scripts/cargar-croquis.js. Una vez guardado, manda lo que haya en la
// base: lo que se corrija en Client365 no se pisa salvo con --forzar.



// mesa = «una pieza del croquis»
const mesa = (zona, label, x, y, { kind = 'cuadrada', w = 60, h = 60, cap = 4 } = {}) => ({
    id: `fm-${zona}-${label}`.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase(),
    zona, kind, label, x, y, w, h, cap,
});

// banqueta = «las mesas pegadas a una banqueta»: parejas de mesas alargadas,
// una encima de la otra (primero la de arriba), cada 100 de arriba abajo
const banqueta = (zona, parejas, x, y) => parejas.flatMap(([arriba, abajo], index) => [
    mesa(zona, arriba, x, y + index * 100, { kind: 'larga', w: 120, h: 35, cap: 2 }),
    mesa(zona, abajo, x, y + index * 100 + 35, { kind: 'larga', w: 120, h: 35, cap: 2 }),
]);

// fila = «cuadradas pegadas, de izquierda a derecha»
const fila = (zona, labels, x, y) => labels.map((label, index) => mesa(zona, label, x + index * 60, y));

// puestos = «los taburetes de la barra, de arriba abajo»
const puestos = (labels, x, y) => labels.map((label, index) => mesa('barra', label, x, y + index * 50, { kind: 'taburete', w: 50, h: 45, cap: 1 }));


export default {
    establishment: '637a7b961a8ed7ed7d7e71eb',   //  Francisca Miami
    name: 'Francisca Miami',
    board: { w: 1260, h: 820, grid: 20 },
    zonas: [
        { id: 'salon-izquierdo', label: 'Salón izquierdo' },
        { id: 'barra', label: 'Barra' },
        { id: 'salon-derecho', label: 'Salón derecho' },
    ],
    piezas: [
        //  Salón izquierdo: la banqueta de la pared, con las parejas 14/13 … 2/1
        mesa('salon-izquierdo', 'Banqueta', 20, 50, { kind: 'mueble', w: 20, h: 690, cap: 0 }),
        ...banqueta('salon-izquierdo', [['14', '13'], ['12', '11'], ['10', '9'], ['8', '7'], ['6', '5'], ['4', '3'], ['2', '1']], 60, 60),

        //  …y más adentro, tres filas de tres y tres de dos
        ...fila('salon-izquierdo', ['15', '16', '17'], 240, 40),
        ...fila('salon-izquierdo', ['18', '19', '20'], 240, 160),
        ...fila('salon-izquierdo', ['21', '22', '23'], 240, 280),
        ...fila('salon-izquierdo', ['24', '25'], 270, 400),
        ...fila('salon-izquierdo', ['26', '27'], 270, 520),
        ...fila('salon-izquierdo', ['28', '29'], 270, 640),

        //  Barra: la cocina con B12…B5 en su lado derecho, y debajo el bar con B4…B1
        mesa('barra', 'Cocina', 480, 120, { kind: 'mueble', w: 300, h: 400, cap: 0 }),
        ...puestos(['B12', 'B11', 'B10', 'B9', 'B8', 'B7', 'B6', 'B5'], 780, 120),
        mesa('barra', 'Bar', 610, 600, { kind: 'barra', w: 170, h: 200, cap: 0 }),
        ...puestos(['B4', 'B3', 'B2', 'B1'], 780, 600),

        //  Salón derecho: la redonda 42 junto a la entrada, las parejas 44/43, 46/45 y 48/47…
        mesa('salon-derecho', '42', 1040, 30, { kind: 'redonda', w: 120, h: 120, cap: 8 }),
        ...fila('salon-derecho', ['44', '43'], 890, 180),
        ...fila('salon-derecho', ['46', '45'], 890, 310),
        ...fila('salon-derecho', ['48', '47'], 890, 440),

        //  …y la banqueta de la pared, con las parejas 41/40 … 31/30
        ...banqueta('salon-derecho', [['41', '40'], ['39', '38'], ['37', '36'], ['35', '34'], ['33', '32'], ['31', '30']], 1080, 210),
        mesa('salon-derecho', 'Banqueta', 1210, 190, { kind: 'mueble', w: 20, h: 600, cap: 0 }),
    ],
};
