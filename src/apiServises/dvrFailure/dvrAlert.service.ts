import fs from 'fs';
import path from 'path';
import DvrFailureModel from './dvrFailure.model.js';
import { captionDeCaida, textoDeListaActivas, parsearDataUrl, TZ_ALERTA } from './dvrAlert.lib.js';
import { sendMediaToWhatsapp, sendTextToWhatsapp } from '../user/attendanceReport.job.js';

// ══════════════════════════════════════════════════════════════════════
// EL AVISO DE UNA CAÍDA AL GRUPO «INFORMACIÓN IMPORTANTE»
// ══════════════════════════════════════════════════════════════════════
// Dos cosas, y solo dos:
//
//   1. `avisarCaidaAlGrupo(episodio)` — cuando un establecimiento se cae, manda
//      la foto con el nombre y la hora. Se llama desde donde nace la caída.
//   2. `fallasActivasAhora()` — qué sigue caído. Lo usa el corte horario.
//
// El TEXTO de los mensajes NO está acá: vive en `dvrAlert.lib.ts`, que es puro y
// tiene pruebas. Acá está el ir a buscar la foto y el entregarla, que es lo que
// no se puede probar sin disco ni red.
//
// REGLA DE ORO DE ESTE ARCHIVO: avisar NUNCA puede romper el registro de la
// caída. Si el bot está caído, si la foto no está en el disco, si el grupo
// cambió de id — se escribe en el log y se sigue. Lo que no puede pasar es que
// un establecimiento no quede registrado como caído porque WhatsApp falló: el
// registro es el dato, el aviso es la cortesía.


// ─────────────────────────────── Configuración ───────────────────────────────

/**
 * El grupo «Información importante».
 *
 * Es el mismo id que Client365 tiene en `src/libs/data/group.ts`. Se puede pisar
 * por entorno sin tocar código, que es lo que hace falta el día que el grupo se
 * migre o se quiera probar contra uno de pruebas.
 */
const GRUPO_INFO_IMPORTANTE = process.env.DVR_ALERT_GROUP
    || '584127041220-1622467264@g.us';

/**
 * ¿Se manda de verdad?
 *
 * Apagado fuera de producción salvo que se pida explícitamente. Sin esto,
 * cualquiera que levante la API en su máquina para programar le mete mensajes
 * reales al grupo del negocio — que es un error que solo se comete una vez, pero
 * se comete delante de todos.
 */
const ALERTAS_ACTIVAS = process.env.DVR_ALERT_ENABLED !== undefined
    ? process.env.DVR_ALERT_ENABLED === 'true'
    : process.env.NODE_ENV === 'production';


// ──────────────────────────── Buscar la foto ─────────────────────────────────

/**
 * Dónde viven los archivos subidos.
 *
 * Mismo criterio que `util/multer.ts`: la unidad D si existe y se puede
 * escribir, y si no la C. Se resuelve una vez al cargar el módulo, como allá.
 */
const unidadBase = (): string => {
    if (process.env.DEBUG === 'true') return '\\\\72.68.60.254\\d';
    try {
        fs.accessSync('D:\\', fs.constants.R_OK | fs.constants.W_OK);
        return 'D:\\';
    }
    catch {
        return 'C:\\';
    }
};

/**
 * Las carpetas donde puede estar la evidencia, en orden de probabilidad.
 *
 * La foto de una caída entra por el flujo de novedades, así que casi siempre
 * está en `imageNovelty`. Las otras están porque la evidencia se puede haber
 * subido por otra pantalla, y buscar en cuatro carpetas cuesta cuatro `stat` —
 * mucho menos que un aviso que sale sin foto porque estaba una carpeta más allá.
 */
const carpetasDeEvidencia = (): string[] => {
    const base = path.join(unidadBase(), 'imagen_clientApp');
    return [
        path.join(base, 'imageNovelty'),
        base,
        path.join(base, 'manager'),
        path.join(base, 'document_report_page'),
    ];
};

const MIME_POR_EXTENSION: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};


/**
 * La foto de la caída, leída del disco.
 *
 * `evidence` es la URL que multimedia devolvió al subir el archivo, con la forma
 * `…/novelty/img=novelty_1234.png`. De ahí solo interesa el NOMBRE del archivo:
 * se lee del disco y no por HTTP a nuestra propia URL, porque pedirse un archivo
 * a uno mismo por la red agrega un viaje, un certificado que validar y un modo
 * de fallar más, para leer un archivo que está en el disco de al lado.
 *
 * `path.basename` es además lo que impide que un `evidence` con `../..` lea un
 * archivo de otra carpeta: se descarta todo lo que no sea el nombre.
 *
 * Devuelve `null` si no hay evidencia o si no se encuentra. El llamador manda el
 * aviso igual, en texto: una caída sin foto se avisa; una caída que no se avisa,
 * no existe para el que la tiene que atender.
 */
export const leerEvidencia = (evidence?: string | null): {
    buffer: Buffer;
    mimeType: string;
    filename: string;
} | null => {

    const url = String(evidence ?? '').trim();
    if (!url) return null;

    // El nombre está después de `img=` cuando la URL viene de multimedia, y es
    // el último segmento cuando viene de cualquier otro lado.
    const trasIgual = url.split('img=').pop() ?? '';
    const nombre = path.basename(trasIgual.split('?')[0]);
    if (!nombre) return null;

    const extension = path.extname(nombre).toLowerCase();
    const mimeType = MIME_POR_EXTENSION[extension];
    if (!mimeType) return null;   // no es una imagen que el grupo pueda ver

    for (const carpeta of carpetasDeEvidencia()) {
        const ruta = path.join(carpeta, nombre);
        try {
            return { buffer: fs.readFileSync(ruta), mimeType, filename: nombre };
        }
        catch {
            continue;   // en esta carpeta no está; se prueba la siguiente
        }
    }

    return null;
};


// ─────────────────────── 1. El aviso de una caída ────────────────────────────

/** Lo que este servicio necesita saber de un episodio recién abierto. */
export interface EpisodioParaAvisar {
    localName?: string;
    failedAt?: Date | string | number;
    evidence?: string | null;
}


/**
 * AVISA AL GRUPO QUE UN ESTABLECIMIENTO SE QUEDÓ SIN CONEXIÓN.
 *
 * Ésta es la función que se dispara desde donde nace la caída. Manda la foto con
 * el nombre del establecimiento y la hora como pie; si no hay foto, manda el
 * mismo texto sin adjunto.
 *
 * NO SE ESPERA Y NO LANZA. Se llama sin `await` desde la ruta —igual que
 * `avisarAlReporte`— porque quien reportó la caída no tiene por qué esperar a
 * que WhatsApp conteste, y sobre todo porque un bot lento no puede convertir un
 * registro correcto en un 500 para el operador.
 */
export const avisarCaidaAlGrupo = (
    episodio: EpisodioParaAvisar,
    fotoEnElCuerpo?: string | null,
): void => {

    if (!ALERTAS_ACTIVAS) return;

    // El trabajo va dentro de una promesa que se resuelve sola. Cualquier fallo
    // muere acá adentro, en el log, sin volver al llamador.
    void (async () => {
        try {
            const failedAt = episodio.failedAt ? new Date(episodio.failedAt) : new Date();

            const caption = captionDeCaida({
                localName: episodio.localName ?? '',
                failedAt,
                tz: TZ_ALERTA,
            });

            // Dos formas de tener la foto, y se prueban en este orden:
            //
            //   1. `evidence` — la URL que multimedia devolvió al subirla. Es la
            //      del recurso nuevo, y la buena: el archivo está en el disco.
            //   2. `buffer_img` — la imagen dentro del JSON, en base64. Es la de
            //      la ruta vieja, que es por donde entran hoy casi todas las
            //      caídas desde la app de estación. NO se guarda en ningún lado:
            //      se decodifica, se manda y se tira.
            const foto = leerEvidencia(episodio.evidence) ?? (() => {
                const enMemoria = parsearDataUrl(fotoEnElCuerpo);
                if (!enMemoria) return null;

                return {
                    buffer: enMemoria.buffer,
                    mimeType: enMemoria.mimeType,
                    filename: `falla_${Date.now()}${enMemoria.extension}`,
                };
            })();

            if (foto) {
                await sendMediaToWhatsapp({
                    buffer: foto.buffer,
                    mimeType: foto.mimeType,
                    caption,
                    filename: foto.filename,
                    number: GRUPO_INFO_IMPORTANTE,
                });
            }
            else {
                // Sin foto el aviso sale igual: lo que importa es que alguien se
                // entere de que ese local está ciego.
                await sendTextToWhatsapp({ text: caption, number: GRUPO_INFO_IMPORTANTE });
            }

            console.log(`[dvr-alerta] avisada la caída de «${episodio.localName}»${foto ? ' con foto' : ' sin foto'}`);
        }
        catch (error: any) {
            console.log(`[dvr-alerta] no se pudo avisar la caída de «${episodio.localName}»: ${error?.message ?? error}`);
        }
    })();
};


// ──────────────────── 2. Lo que sigue caído, para el corte ───────────────────

/**
 * Los establecimientos que están sin conexión AHORA.
 *
 * Se pregunta a la base en cada corte y no se guarda en memoria: entre un corte
 * y el siguiente un local se cae o se restablece, y una lista cacheada avisaría
 * de algo que ya se arregló. Es el mismo criterio que el corte de silencio.
 */
export const fallasActivasAhora = async (): Promise<{ localName: string; failedAt: Date }[]> => {
    const abiertas = await DvrFailureModel
        .find({ active: true })
        .select('localName failedAt')
        .sort({ failedAt: 1 })
        .lean();

    return abiertas.map(falla => ({
        localName: falla.localName ?? '',
        failedAt: falla.failedAt,
    }));
};


/**
 * MANDA AL GRUPO LA LISTA DE LO QUE SIGUE CAÍDO.
 *
 * Si no hay nada caído NO MANDA NADA — `textoDeListaActivas` devuelve null y acá
 * se corta. Ver el porqué en `dvrAlert.lib.ts`: un «todo en orden» cada hora
 * enseña a ignorar el grupo.
 *
 * Devuelve cuántas fallas se listaron (0 = no se envió nada), para que el reloj
 * pueda dejarlo en el log sin volver a consultar.
 */
export const enviarListaDeActivas = async (ahora: Date = new Date()): Promise<number> => {

    if (!ALERTAS_ACTIVAS) return 0;

    const fallas = await fallasActivasAhora();
    const texto = textoDeListaActivas({ fallas, ahora, tz: TZ_ALERTA });

    if (!texto) return 0;

    await sendTextToWhatsapp({ text: texto, number: GRUPO_INFO_IMPORTANTE });

    return fallas.length;
};


export default { avisarCaidaAlGrupo, enviarListaDeActivas, fallasActivasAhora };
