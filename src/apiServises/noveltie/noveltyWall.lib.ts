// ══════════════════════════════════════════════════════════════════════
// EL MURO DE ALERTAS DEL CLIENTE (insights365)
// ══════════════════════════════════════════════════════════════════════
// GET /novelties/wall?establishments=<id,id,…>&before=<id>&limit=30
//
// Las novedades de esos establecimientos que ya llegaron al grupo del cliente:
// VALIDADAS (validationResult.isApproved === true) y ENVIADAS AL GRUPO
// (sharedByAmazonActive, o givenToTheGroup en las de antes de ese campo). Es el
// mismo criterio del corte de silencio (updateNovelties) y del reporte de
// novedades. Van de la más nueva a la más vieja.
//
// Acá viven las reglas puras: leer la consulta, armar el filtro y recortar cada
// novedad a lo que ve el cliente. La ruta está en novelties.routes.ts.
//
//
// POR QUÉ UNA RUTA NUEVA
//
// Ninguna de las que había filtra por varios locales a la vez ni por validada y
// enviada: /noveltie/local= es de UN local, por nombre, de 10 en 10, y puebla
// los usuarios enteros; /novelties/paginate solo sabe de validación y trae los
// locales de todos.
//
//
// EL LOCAL SE BUSCA EN LOS DOS SITIOS
//
// `establishment` solo lo tienen las novedades nuevas (en la copia local, 63 mil
// de 933 mil); todas tienen `local.idLocal`, que está marcado DEPRECATED pero se
// sigue escribiendo. Buscando solo en `establishment` el muro se quedaría sin la
// historia.
//
//
// PÁGINAS POR _id, NO POR NÚMERO
//
// La colección no tiene más índice que el de _id. Ordenando por _id, Mongo la
// recorre de la más nueva hacia atrás por ese índice y para al llenar la página,
// sin ordenar nada en memoria. Y `before` es el _id de la última recibida: con
// un número de página, cada alerta nueva correría las páginas y el muro
// repetiría tarjetas.
//
//
// FUERA LO INTERNO
//
// Esto lo ve el cliente. No viajan quién la reportó ni quién la validó, ni la
// bonificación, ni los comentarios internos.


/** Cuántas novedades trae una página si no se pide otra cosa, y como mucho. */
export const WALL_LIMIT_DEFAULT = 30;
export const WALL_LIMIT_MAX = 60;

/** Cuántos establecimientos se pueden pedir de una vez. */
export const WALL_ESTABLISHMENTS_MAX = 100;

/** Lo más que puede tardar la consulta antes de cortarla. Un local sin alertas obliga a recorrer mucho. */
export const WALL_MAX_TIME_MS = 15000;

/** Los campos que se leen de la novedad. Lo interno no se lee siquiera. */
export const WALL_FIELDS = [
    '_id', 'title', 'date', 'createdAt', 'shift', 'table', 'nameDish', 'amount', 'orderTicketNumber',
    'timePeriod', 'menu', 'imageToShare', 'imageUrl', 'videoUrl', 'menuRef', 'establishment',
    'local.name', 'local.idLocal', 'validationResult.updatedAt',
].join(' ');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const CLOCK = /^\d{1,2}:\d{2}(:\d{2})?$/;


export interface WallQuery {
    establishments: string[];
    before: string | null;
    limit: number;
}

export type ParsedWallQuery = { ok: true; value: WallQuery } | { ok: false; message: string };


/**
 * Lee la consulta. `establishments` va separado por comas (o repetido, que
 * Express lo convierte en lista); sin repetir; cada uno un ObjectId.
 */
export function parseWallQuery(query: Record<string, unknown>): ParsedWallQuery {
    const raw = query.establishments;
    const parts = (Array.isArray(raw) ? raw : [raw]).flatMap(entry => (typeof entry === 'string' ? entry.split(',') : [entry]));

    if (parts.some(part => part !== undefined && typeof part !== 'string')) {
        return { ok: false, message: 'establishments tiene que ser una lista de ids separados por comas.' };
    }
    const establishments = [...new Set((parts as (string | undefined)[]).map(part => (part ?? '').trim()).filter(Boolean))];

    if (establishments.length === 0) return { ok: false, message: 'Falta establishments: los ids de los establecimientos, separados por comas.' };
    if (establishments.length > WALL_ESTABLISHMENTS_MAX) return { ok: false, message: `Como mucho ${WALL_ESTABLISHMENTS_MAX} establecimientos por consulta.` };
    const wrong = establishments.find(id => !OBJECT_ID.test(id));
    if (wrong) return { ok: false, message: `"${wrong}" no es un id de establecimiento.` };

    const before = query.before;
    if (before !== undefined && before !== '' && (typeof before !== 'string' || !OBJECT_ID.test(before))) {
        return { ok: false, message: 'before tiene que ser el id de la última novedad recibida.' };
    }

    const limitRaw = query.limit;
    let limit = WALL_LIMIT_DEFAULT;
    if (limitRaw !== undefined && limitRaw !== '') {
        const parsed = typeof limitRaw === 'string' && /^\d+$/.test(limitRaw) ? Number(limitRaw) : NaN;
        if (!Number.isInteger(parsed) || parsed < 1) return { ok: false, message: 'limit tiene que ser un número entero mayor que cero.' };
        limit = Math.min(parsed, WALL_LIMIT_MAX);
    }

    return { ok: true, value: { establishments, before: typeof before === 'string' && before ? before : null, limit } };
}


/** El filtro de Mongo: de esos locales, validada, enviada al grupo y, si hay cursor, más vieja que él. */
export function wallFilter({ establishments, before }: Pick<WallQuery, 'establishments' | 'before'>) {
    const filter: Record<string, unknown> = {
        $and: [
            { $or: [{ establishment: { $in: establishments } }, { 'local.idLocal': { $in: establishments } }] },
            { 'validationResult.isApproved': true },
            { $or: [{ sharedByAmazonActive: true }, { givenToTheGroup: true }] },
        ],
    };
    if (before) filter._id = { $lt: before };
    return filter;
}


export interface WallPeriod { start: string; end: string }

/**
 * De cuándo a cuándo duró lo que se reporta. `timePeriod` llega de dos formas
 * (y a veces como JSON en texto): {init, end} en las alertas de tiempo, y la del
 * punto de venta, {tomaOrden, listoTablet, listoCocina, entregaPlato}, que va de
 * la toma de la orden a la entrega. Lo que no sea una de esas, null.
 */
export function periodOf(timePeriod: unknown): WallPeriod | null {
    let value = timePeriod;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return null; }
    }
    if (!value || typeof value !== 'object') return null;
    const period = value as Record<string, unknown>;
    const pick = (start: unknown, end: unknown) =>
        (typeof start === 'string' && typeof end === 'string' && CLOCK.test(start.trim()) && CLOCK.test(end.trim()))
            ? { start: start.trim(), end: end.trim() }
            : null;
    return pick(period.init, period.end) ?? pick(period.tomaOrden, period.entregaPlato);
}


const toIso = (value: unknown): string | null => {
    if (!value) return null;
    const time = new Date(value as string).getTime();
    return Number.isNaN(time) ? null : new Date(time).toISOString();
};

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);


export interface WallNovelty {
    _id: string;
    title: string;
    establishment: string | null;
    place: string | null;
    date: string | null;
    shift: 'day' | 'night' | null;
    table: string | null;
    nameDish: string | null;
    amount: number | null;
    orderTicketNumber: number | null;
    period: WallPeriod | null;
    menu: string | null;
    imageToShare: string | null;
    images: { url: string; caption: string | null }[];
    videoUrl: string | null;
    // alert = «qué alerta del catálogo es»: su nombre en español (name) y en inglés (nameEn), y su categoría
    alert: { _id: string; name: string | null; nameEn: string | null; category: string | null } | null;
    validatedAt: string | null;
}

/** La novedad tal como la ve el cliente. Recibe el documento `lean`, con menuRef poblado o no. */
export function toWallNovelty(doc: any): WallNovelty {
    // Poblado es un objeto suelto; sin poblar es un ObjectId, que se reconoce por `_bsontype`
    const menuRef = doc?.menuRef && typeof doc.menuRef === 'object' && !doc.menuRef._bsontype ? doc.menuRef : null;
    const establishment = doc?.establishment ?? doc?.local?.idLocal ?? null;
    return {
        _id: String(doc._id),
        title: text(doc.title) ?? '',
        establishment: establishment ? String(establishment) : null,
        place: text(doc?.local?.name),
        // `date` lo tienen todas (createdAt solo las de después de los timestamps)
        date: toIso(doc.date) ?? toIso(doc.createdAt),
        shift: doc.shift === 'day' || doc.shift === 'night' ? doc.shift : null,
        table: text(doc.table),
        nameDish: text(doc.nameDish),
        amount: typeof doc.amount === 'number' ? doc.amount : null,
        orderTicketNumber: typeof doc.orderTicketNumber === 'number' ? doc.orderTicketNumber : null,
        period: periodOf(doc.timePeriod),
        menu: text(doc.menu),
        imageToShare: text(doc.imageToShare),
        images: (Array.isArray(doc.imageUrl) ? doc.imageUrl : [])
            .filter((image: any) => text(image?.url))
            .map((image: any) => ({ url: text(image.url) as string, caption: text(image.caption) })),
        videoUrl: text(doc.videoUrl),
        alert: menuRef ? { _id: String(menuRef._id), name: text(menuRef.es), nameEn: text(menuRef.en), category: text(menuRef.category) } : null,
        validatedAt: toIso(doc?.validationResult?.updatedAt),
    };
}
