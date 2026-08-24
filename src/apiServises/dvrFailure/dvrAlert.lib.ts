import moment from 'moment-timezone';

// ══════════════════════════════════════════════════════════════════════
// QUÉ DICE EL MENSAJE QUE LLEGA AL GRUPO
// ══════════════════════════════════════════════════════════════════════
// Acá se arma el TEXTO y nada más. No sabe qué es WhatsApp, no consulta la base
// y no manda nada: recibe datos planos y devuelve cadenas.
//
// Está separado a propósito. Redactar el aviso y entregarlo son dos problemas
// distintos, y el que más se toca es éste —una palabra, un emoji, el orden de
// una línea—. Teniéndolo aparte se puede cambiar el texto y comprobarlo en un
// segundo con `npm test`, sin levantar Express, sin Mongo y sin mandarle nada a
// nadie por error.
//
// Es la misma división que ya usan `dvrFailure.lib.ts` (las cuentas) y
// `dvrGate.lib.ts` (las reglas): lo puro vive solo y con pruebas.


/** La zona en la que se leen las horas. La misma del resto del monitoreo. */
export const TZ_ALERTA = process.env.MONITORING_TZ || 'America/Caracas';


/**
 * Cuánto lleva caído, dicho como lo diría una persona.
 *
 * De minutos a «18m», «1h 42m», «2d 3h». Se corta en dos unidades porque el
 * grupo lee esto en el teléfono y de un vistazo: «2d 3h 14m» no aporta nada que
 * «2d 3h» no diga ya, y hace la línea más larga que el nombre del local.
 *
 * Un episodio de menos de un minuto se muestra como «1m» y no como «0m», por lo
 * mismo que `downtimeMinutesBetween` redondea hacia arriba: un 0 en la columna
 * de tiempo se lee como «no pasó nada», y sí pasó.
 *
 * Un negativo —relojes de estación desfasados— también sale «1m». Nunca se
 * muestra un tiempo negativo en el grupo: no significa nada para quien lo lee y
 * hace dudar del resto del mensaje.
 */
export const duracionLegible = (minutos: number): string => {
    if (!Number.isFinite(minutos) || minutos < 1) return '1m';

    const total = Math.floor(minutos);

    const dias = Math.floor(total / 1440);
    const horas = Math.floor((total % 1440) / 60);
    const restoMinutos = total % 60;

    if (dias > 0) return horas > 0 ? `${dias}d ${horas}h` : `${dias}d`;
    if (horas > 0) return restoMinutos > 0 ? `${horas}h ${restoMinutos}m` : `${horas}h`;

    return `${restoMinutos}m`;
};


/**
 * Cuántos minutos lleva abierta una caída, contados hasta AHORA.
 *
 * Es `downtimeMinutesBetween` con el final puesto en el instante del corte, y
 * está acá repetida en una línea en vez de importada para que este archivo siga
 * siendo puro y legible solo. Si algún día divergen, la de `dvrFailure.lib.ts`
 * manda: aquélla es la que sella el número que se guarda.
 */
export const minutosCaidoHasta = (failedAt: Date, ahora: Date): number => {
    const milisegundos = ahora.getTime() - failedAt.getTime();
    if (!Number.isFinite(milisegundos) || milisegundos <= 0) return 1;

    return Math.max(1, Math.ceil(milisegundos / 60_000));
};


/** Lo mínimo que hay que saber de una caída para poder contarla. */
export interface FallaParaContar {
    localName: string;
    failedAt: Date;
}


/**
 * El pie de foto del aviso inmediato.
 *
 * Es lo que pidió el negocio y nada más: QUÉ establecimiento y A QUÉ HORA se
 * cayó. La foto ya va adjunta arriba, así que el texto no la describe.
 *
 * Lleva la fecha además de la hora porque una foto en WhatsApp se reenvía y se
 * mira al día siguiente, y «10:42» a secas no dice de cuándo es.
 *
 * Si el establecimiento llegó sin nombre se escribe «Establecimiento sin
 * nombre» en lugar de dejar el renglón vacío: un aviso al que le falta el local
 * es un aviso que nadie sabe atender, y es mejor que se note.
 */
export const captionDeCaida = ({ localName, failedAt, tz = TZ_ALERTA }: {
    localName: string;
    failedAt: Date;
    tz?: string;
}): string => {
    const nombre = String(localName ?? '').trim() || 'Establecimiento sin nombre';
    const cuando = moment.tz(failedAt, tz);

    return [
        '🔴 *Falla de conexión*',
        '',
        `📍 ${nombre}`,
        `🕐 ${cuando.format('HH:mm')} · ${cuando.format('DD/MM/YYYY')}`,
    ].join('\n');
};


/**
 * La lista horaria de lo que sigue caído.
 *
 * DEVUELVE `null` CUANDO NO HAY NADA CAÍDO, y eso es una decisión, no un
 * descuido: el llamador usa ese null para no mandar nada. Un «todo en orden»
 * cada hora son veinticuatro mensajes diarios que no piden ninguna acción, y un
 * grupo que recibe eso aprende a no abrirlo — que es exactamente lo que haría
 * inútil al aviso del día en que sí hay algo. Es el mismo razonamiento que ya
 * hace el corte de silencio del monitoreo.
 *
 * Las caídas salen de la MÁS VIEJA a la más nueva: la que lleva más tiempo es la
 * que más urge, y así queda arriba sin que nadie tenga que comparar horas.
 *
 * @param fallas  las que están abiertas en este momento
 * @param ahora   el instante del corte, contra el que se mide cada duración
 */
export const textoDeListaActivas = ({ fallas, ahora, tz = TZ_ALERTA }: {
    fallas: FallaParaContar[];
    ahora: Date;
    tz?: string;
}): string | null => {

    if (!Array.isArray(fallas) || fallas.length === 0) return null;

    const ordenadas = [...fallas].sort(
        (a, b) => a.failedAt.getTime() - b.failedAt.getTime(),
    );

    const encabezado = ordenadas.length === 1
        ? '🔴 *1 establecimiento sin conexión*'
        : `🔴 *${ordenadas.length} establecimientos sin conexión*`;

    const lineas = ordenadas.map(falla => {
        const nombre = String(falla.localName ?? '').trim() || 'Establecimiento sin nombre';
        const desde = moment.tz(falla.failedAt, tz).format('HH:mm');
        const lleva = duracionLegible(minutosCaidoHasta(falla.failedAt, ahora));

        return `• ${nombre} — ${lleva} (desde ${desde})`;
    });

    return [
        encabezado,
        `_Corte de las ${moment.tz(ahora, tz).format('HH:mm')}_`,
        '',
        ...lineas,
    ].join('\n');
};


/**
 * Una foto que llegó DENTRO del JSON, como data URL.
 *
 * La app de estación manda la imagen en base64 (`buffer_img`) al reportar la
 * caída, con la forma `data:image/png;base64,iVBORw0…`. La API se niega a
 * GUARDARLA —un historial de meses de imágenes en base64 no entra en un
 * documento de Mongo—, pero reenviarla es otra cosa: se decodifica en memoria,
 * se manda al grupo y se tira. Nada de eso toca la base.
 *
 * Devuelve `null` ante cualquier cosa que no sea una imagen reconocible, y esa
 * es la respuesta correcta a un dato que viene de afuera: el aviso sale igual,
 * en texto, y nadie se queda sin enterarse de la caída por una foto rara.
 */
export const parsearDataUrl = (dataUrl?: string | null): {
    buffer: Buffer;
    mimeType: string;
    extension: string;
} | null => {

    const crudo = String(dataUrl ?? '').trim();
    if (!crudo) return null;

    const coincidencia = /^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/i.exec(crudo);
    if (!coincidencia) return null;

    const mimeType = coincidencia[1].toLowerCase();
    const base64 = coincidencia[3];

    try {
        const buffer = Buffer.from(base64, 'base64');

        // Un base64 corrupto no lanza: `Buffer.from` devuelve lo que pudo leer.
        // Un puñado de bytes no es una foto, y mandarlo haría que en el grupo
        // aparezca un adjunto roto justo cuando hay que atender una caída.
        if (buffer.length < 100) return null;

        const extension = mimeType === 'image/jpeg' ? '.jpg' : `.${mimeType.split('/')[1]}`;

        return { buffer, mimeType, extension };
    }
    catch {
        return null;
    }
};


export default { duracionLegible, captionDeCaida, textoDeListaActivas, parsearDataUrl };
