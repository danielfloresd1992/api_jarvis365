// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE REPORTES GRILL MIAMI — sacado del plano que usa el local
// ══════════════════════════════════════════════════════════════════════
// Pasado a mano de la imagen del plano (2026-11-28), con el formato de
// floorPlan.schema.js. Un solo salón, a la misma escala que la imagen (un píxel
// del plano, una unidad del croquis):
//
//   arriba    7.1, 7, 6, 5, 4, 3, 2 y 1 (las de 6, 4 y 2 son largas)
//   en medio  las redondas 8, 9, 10 y 11; a la derecha, el puesto del host y la
//             entrada
//   abajo     la barra a la izquierda, la 16 al lado de su esquina, y 15, 14
//             (larga), 12.1 y 12
//
// Lo que el plano no dice y aquí es una suposición, para corregir en Client365:
//   - las sillas (cap): 4 en cada mesa, como en los croquis de las Franciscas;
//   - el host y la entrada van como muebles (se dibujan, no cuentan).
//
// El _id del local no está en el código: se busca por su nombre, que es único
// (cargar-croquis.js). Lo carga scripts/cargar-croquis.js; una vez guardado,
// manda lo que haya en la base: lo que se corrija en Client365 no se pisa salvo
// con --forzar.



// mesa = «una pieza del croquis»
const mesa = (label, x, y, { kind = 'cuadrada', w = 56, h = 74, cap = 4 } = {}) => ({
    id: `rgm-${label}`.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase(),
    zona: 'salon', kind, label, x, y, w, h, cap,
});

// larga = «una mesa larga» (6, 4, 2 y 14) y redonda = «una de las del centro»
const larga = (label, x, y) => mesa(label, x, y, { kind: 'larga', w: 112 });
const redonda = (label, x) => mesa(label, x, 247, { kind: 'redonda', w: 94, h: 94 });

// mueble = «algo que se dibuja y no cuenta» (la barra, el host, la entrada)
const mueble = (label, kind, x, y, w, h) => ({ id: `rgm-${label.toLowerCase()}`, zona: 'salon', kind, label, x, y, w, h, cap: 0 });


export default {
    establishment: null,   //  se busca por el nombre
    name: 'Reportes Grill Miami',
    board: { w: 1160, h: 600, grid: 20 },
    zonas: [
        { id: 'salon', label: 'Salón' },
    ],
    piezas: [
        //  La fila de arriba
        mesa('7.1', 56, 16), mesa('7', 126, 16), larga('6', 271, 16), mesa('5', 413, 16),
        larga('4', 558, 16), mesa('3', 701, 16), larga('2', 846, 16), mesa('1', 988, 16),

        //  Las redondas del centro, y a la derecha el host y la entrada
        redonda('8', 375), redonda('9', 532), redonda('10', 689), redonda('11', 846),
        mueble('Host', 'mueble', 1066, 253, 76, 36),
        mueble('Entrada', 'mueble', 1048, 312, 100, 36),

        //  Abajo: la barra, la 16 en su esquina, y 15, 14, 12.1 y 12
        mueble('Barra', 'barra', 122, 429, 442, 164),
        mesa('16', 579, 430),
        mesa('15', 670, 505), larga('14', 766, 505), mesa('12.1', 918, 505), mesa('12', 988, 505),
    ],
};
