/**
 * franchise.lib.ts — las reglas puras de lo que se puede cambiar de una franquicia
 * ─────────────────────────────────────────────────────────────────────────────
 * Sin Mongo y sin Express: lo usa franchise.controller.js (PUT /franchise/:id y
 * la imagen opcional de POST /franchise) y lo prueba test/franchise.test.ts.
 *
 * Lo que se cambia con PUT: la foto (`image`) y la ubicación (`location`). El
 * NOMBRE NO: los locales guardan su franquicia por nombre
 * (`franchiseReference.name_franchise`), así que renombrarla aquí los dejaría
 * apuntando a una franquicia que ya no existe.
 *
 * La foto es la URL que devuelve POST /multimedia (como el logo de un local), o
 * null para quitarla.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const IMAGE_MAX = 500;
export const LOCATION_MAX = 200;

export type FranchiseUpdate = { image?: string | null; location?: string };

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };


/** Una foto válida: null (quitarla) o una URL http(s) de largo razonable. */
export function parseImage(value: unknown): Parsed<string | null> {
    if (value === null || value === '') return { ok: true, value: null };
    if (typeof value !== 'string') return { ok: false, error: 'image debe ser una URL o null' };
    const url = value.trim();
    if (url.length > IMAGE_MAX) return { ok: false, error: `image no puede pasar de ${IMAGE_MAX} caracteres` };
    if (!/^https?:\/\/\S+$/i.test(url)) return { ok: false, error: 'image debe ser una URL http(s)' };
    return { ok: true, value: url };
}


/**
 * El cuerpo de PUT /franchise/:id → los campos a guardar.
 * Rechaza el nombre, los campos desconocidos y un cuerpo sin nada que cambiar.
 */
export function parseFranchiseUpdate(body: unknown): Parsed<FranchiseUpdate> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'El cuerpo debe ser un objeto' };
    const datos = body as Record<string, unknown>;

    if ('name' in datos) return { ok: false, error: 'El nombre de una franquicia no se cambia: los locales la guardan por nombre' };

    const desconocidos = Object.keys(datos).filter((clave) => clave !== 'image' && clave !== 'location');
    if (desconocidos.length) return { ok: false, error: `Campos que no se pueden cambiar: ${desconocidos.join(', ')}` };

    const value: FranchiseUpdate = {};

    if ('image' in datos) {
        const imagen = parseImage(datos.image);
        if (!imagen.ok) return imagen;
        value.image = imagen.value;
    }

    if ('location' in datos) {
        if (typeof datos.location !== 'string') return { ok: false, error: 'location debe ser texto' };
        const location = datos.location.trim();
        if (location.length > LOCATION_MAX) return { ok: false, error: `location no puede pasar de ${LOCATION_MAX} caracteres` };
        value.location = location;
    }

    if (Object.keys(value).length === 0) return { ok: false, error: 'No hay nada que cambiar: envía image o location' };
    return { ok: true, value };
}
