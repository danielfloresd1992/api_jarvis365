import * as yup from 'yup';



// ══════════════════════════════════════════════════════════════════════
// EL CROQUIS DE MESAS DE UN LOCAL: qué se acepta al guardarlo
// ══════════════════════════════════════════════════════════════════════
// Lo dibuja Client365 (Establecimientos → la ficha del local → Croquis) y lo va
// a leer insights365 para montar la sala en 3D. Un croquis es UN plano para
// todo el local: todas las zonas comparten las mismas coordenadas, así que se
// sabe dónde queda cada mesa respecto de las demás.
//
//   board    el tamaño del plano, en píxeles del editor, y su cuadrícula
//   zonas    las zonas del local (Zona 1, Barra, Terraza…), en su orden
//   piezas   mesas, puestos de barra y muebles: { id, zona, kind, label, x, y, w, h, cap }
//            x e y son la esquina de arriba a la izquierda; w y h, el ancho y el alto
//
// La regla de qué cuenta como qué es la de los informes de reportes365: una pieza
// cuya etiqueta es un número es una mesa del salón; otra cosa (B1, B2…) es un
// puesto de barra. La barra y los muebles se dibujan pero no cuentan.
//
// Se valida con { abortEarly: false, stripUnknown: true }: lo que no esté aquí
// se descarta.



// FLOOR_PLAN_KINDS = «las formas de una pieza», las mismas de SHAPES en
// Client365 (croquis/floorPlan.lib.js)
export const FLOOR_PLAN_KINDS = ['redonda', 'cuadrada', 'larga', 'taburete', 'barra', 'mueble'];

// FURNITURE_KINDS = «las formas que no son mesas»: se dibujan pero no cuentan,
// y pueden repetir nombre (dos «Mueble»)
export const FURNITURE_KINDS = ['barra', 'mueble'];

// MAX_PIECES, MAX_ZONES = «los topes de un croquis». Un local grande tiene
// sesenta y tantas mesas; el tope es para que un cuerpo roto no llene la base.
export const MAX_PIECES = 400;
export const MAX_ZONES = 20;

// MIN_BOARD, MAX_BOARD = «lo que puede medir el plano, por lado»
export const MIN_BOARD = 200;
export const MAX_BOARD = 4000;



// tableKey = «la etiqueta con que se comparan dos mesas»: sin espacios a los
// lados y en mayúsculas, como en el editor
export const tableKey = (label) => String(label ?? '').trim().toUpperCase();

// isFurniture = «la pieza no es una mesa ni un puesto»
export const isFurniture = (piece) => FURNITURE_KINDS.includes(piece?.kind);



const integer = (label) => yup.number().typeError(`${label} tiene que ser un número`).integer(`${label} tiene que ser un número entero`);

const zoneSchema = yup.object({
    id: yup.string().trim().required('Cada zona necesita su id').max(40),
    label: yup.string().trim().required('Cada zona necesita un nombre').max(40, 'El nombre de una zona no puede pasar de 40 letras'),
});

const pieceSchema = yup.object({
    id: yup.string().trim().required('Cada pieza necesita su id').max(40),
    zona: yup.string().trim().required('Cada pieza tiene que estar en una zona').max(40),
    kind: yup.string().oneOf(FLOOR_PLAN_KINDS, 'La forma de una pieza tiene que ser una de: ${values}').required('Cada pieza necesita su forma'),
    label: yup.string().trim().required('Cada pieza necesita su número o su nombre').max(30, 'El número o nombre de una pieza no puede pasar de 30 letras'),
    x: integer('La posición').min(0, 'Una pieza no puede salirse del plano').required(),
    y: integer('La posición').min(0, 'Una pieza no puede salirse del plano').required(),
    w: integer('El ancho').min(10, 'Una pieza mide al menos 10 de ancho').max(MAX_BOARD).required(),
    h: integer('El alto').min(10, 'Una pieza mide al menos 10 de alto').max(MAX_BOARD).required(),
    cap: integer('La capacidad').min(0).max(50, 'Una mesa no tiene más de 50 sillas').default(0),
});


// floorPlanProblems = «lo que está mal en un croquis que ya tiene la forma
// correcta»: lo que cruza piezas y zonas, y que yup no ve campo a campo.
// Devuelve una lista de mensajes; vacía, el croquis vale.
export function floorPlanProblems({ board, zonas = [], piezas = [] }) {
    const problems = [];

    const zoneIds = zonas.map(zone => zone.id);
    const repeatedZones = zoneIds.filter((id, index) => zoneIds.indexOf(id) !== index);
    if (repeatedZones.length) problems.push(`Zona repetida: ${[...new Set(repeatedZones)].join(', ')}`);

    const pieceIds = piezas.map(piece => piece.id);
    const repeatedIds = pieceIds.filter((id, index) => pieceIds.indexOf(id) !== index);
    if (repeatedIds.length) problems.push(`Pieza con el id repetido: ${[...new Set(repeatedIds)].join(', ')}`);

    const strays = piezas.filter(piece => !zoneIds.includes(piece.zona));
    if (strays.length) problems.push(`Piezas en una zona que no existe: ${strays.map(piece => piece.label).join(', ')}`);

    const outside = piezas.filter(piece => piece.x + piece.w > board.w || piece.y + piece.h > board.h);
    if (outside.length) problems.push(`Piezas que se salen del plano: ${outside.map(piece => piece.label).join(', ')}`);

    const seen = new Map();
    piezas.filter(piece => !isFurniture(piece)).forEach(piece => seen.set(tableKey(piece.label), (seen.get(tableKey(piece.label)) ?? 0) + 1));
    const repeatedTables = [...seen].filter(([, times]) => times > 1).map(([key]) => key);
    if (repeatedTables.length) problems.push(`Número de mesa repetido: ${repeatedTables.join(', ')}`);

    return problems;
}


// ── PUT: el croquis entero ────────────────────────────────────────────
// Se guarda siempre completo: el editor manda todas las piezas, y lo que no
// venga deja de estar.
export const floorPlanValidate = yup.object({
    board: yup.object({
        w: integer('El ancho del plano').min(MIN_BOARD).max(MAX_BOARD).required('Falta el ancho del plano'),
        h: integer('El alto del plano').min(MIN_BOARD).max(MAX_BOARD).required('Falta el alto del plano'),
        grid: integer('La cuadrícula').min(1).max(200).default(20),
    }).required('Falta el tamaño del plano'),
    zonas: yup.array(zoneSchema).min(1, 'Un croquis tiene al menos una zona').max(MAX_ZONES, `Un croquis no tiene más de ${MAX_ZONES} zonas`).required('Faltan las zonas'),
    piezas: yup.array(pieceSchema).max(MAX_PIECES, `Un croquis no tiene más de ${MAX_PIECES} piezas`).default([]),
}).test('coherente', function check(plan) {
    if (!plan?.board || !Array.isArray(plan.zonas) || !Array.isArray(plan.piezas)) return true;
    const problems = floorPlanProblems(plan);
    return problems.length === 0 || this.createError({ message: problems.join('. ') });
});
