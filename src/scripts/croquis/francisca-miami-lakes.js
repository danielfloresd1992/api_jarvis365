// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE FRANCISCA MIAMI LAKES — sacado del plano que usa el local
// ══════════════════════════════════════════════════════════════════════
// Pasado a mano de la imagen del plano (2026-11-26), con el formato de
// floorPlan.schema.js. Las medidas y las distancias son las del plano: 5/3
// de unidad por píxel de la imagen (las mesas de 36 px quedan de 60),
// redondeadas a 10. Solo se abrió algo más el hueco sobre las mesas de fuera
// de abajo (40–43), para que el nombre de su zona no pise la fila 15–20.
//
//   Salón     dentro: la cocina arriba a la izquierda, las columnas 39–36 y
//             35–32, la columna 29–24 tras el murete, 31, 30 y 23–21 junto a
//             la entrada de la derecha, y la fila de abajo, del 10 al 20
//   Terraza   fuera de la pared de la derecha: 49/50, 48, 47, 45/46 y 44
//   Frente    fuera de la pared de abajo: 40, 41, 42 y 43
//
// Lo que el plano no dice y aquí es una suposición, para corregir en Client365:
//   - las zonas: el plano no las nombra, y se partió por las paredes;
//   - las sillas (cap): 4 en cada mesa;
//   - las dos entradas, las paredes y el murete de la 29–24 no van: son
//     huecos y tabiques, no piezas.
//
// Lo carga scripts/cargar-croquis.js. Una vez guardado, manda lo que haya en la
// base: lo que se corrija en Client365 no se pisa salvo con --forzar.



// mesa = «una pieza del croquis»
const mesa = (zona, label, x, y, { kind = 'cuadrada', w = 60, h = 60, cap = 4 } = {}) => ({
    id: `fml-${zona}-${label}`.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase(),
    zona, kind, label, x, y, w, h, cap,
});

// fila = «mesas pegadas, de izquierda a derecha»
const fila = (zona, labels, x, y) => labels.map((label, index) => mesa(zona, label, x + index * 60, y));

// columna = «mesas pegadas, de arriba abajo»
const columna = (zona, labels, x, y) => labels.map((label, index) => mesa(zona, label, x, y + index * 60));


export default {
    establishment: '637a7c561a8ed7ed7d7e71f0',   //  Francisca Miami Lakes
    name: 'Francisca Miami Lakes',
    board: { w: 1380, h: 970, grid: 20 },
    zonas: [
        { id: 'salon', label: 'Salón' },
        { id: 'terraza', label: 'Terraza' },
        { id: 'frente', label: 'Frente' },
    ],
    piezas: [
        //  Salón: la cocina, arriba a la izquierda
        mesa('salon', 'Cocina', 10, 10, { kind: 'mueble', w: 360, h: 560, cap: 0 }),

        //  …las dos columnas de arriba, de dos parejas cada una: 39/38 y 37/36, 35/34 y 33/32
        ...columna('salon', ['39', '38'], 490, 20), ...columna('salon', ['37', '36'], 490, 160),
        ...columna('salon', ['35', '34'], 810, 20), ...columna('salon', ['33', '32'], 810, 160),

        //  …la columna tras el murete, en tres parejas: 29/28, 27/26 y 25/24
        ...columna('salon', ['29', '28'], 710, 320), ...columna('salon', ['27', '26'], 710, 450), ...columna('salon', ['25', '24'], 710, 580),

        //  …junto a la entrada de la derecha: 31 y 30 arriba, 23, 22 y 21 abajo
        mesa('salon', '31', 1130, 20), mesa('salon', '30', 1130, 190),
        mesa('salon', '23', 1130, 460), mesa('salon', '22', 1130, 560), mesa('salon', '21', 1130, 680),

        //  …y la fila de abajo, del 10 al 20
        mesa('salon', '10', 30, 740),
        ...fila('salon', ['11', '12'], 130, 740), ...fila('salon', ['13', '14'], 290, 740),
        ...fila('salon', ['15', '16'], 480, 740), ...fila('salon', ['17', '18'], 640, 740), ...fila('salon', ['19', '20'], 780, 740),

        //  Terraza, fuera de la pared de la derecha: 49/50, 48, 47, 45/46 y 44
        ...fila('terraza', ['49', '50'], 1240, 50),
        mesa('terraza', '48', 1250, 200),
        mesa('terraza', '47', 1250, 430),
        ...fila('terraza', ['45', '46'], 1240, 590),
        mesa('terraza', '44', 1250, 760),

        //  Frente, fuera de la pared de abajo: 40, 41, 42 y 43
        mesa('frente', '40', 510, 890), mesa('frente', '41', 670, 890), mesa('frente', '42', 810, 890), mesa('frente', '43', 1150, 890),
    ],
};
