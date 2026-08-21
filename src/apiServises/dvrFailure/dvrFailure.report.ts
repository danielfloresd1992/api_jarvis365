import moment from 'moment-timezone';
import { Types } from 'mongoose';
import DvrFailureModel from './dvrFailure.model.js';
import { overlapMinutes } from './dvrFailure.lib.js';

// ══════════════════════════════════════════════════════════════════════
// EL ESTADO DE LOS DVR, VISTO DESDE EL REPORTE DE NOVEDADES
// ══════════════════════════════════════════════════════════════════════
// El reporte del día cuenta cuántas novedades pasó cada establecimiento, y un
// local en 0 se lee como "no reportó". Pero un local con el DVR caído no es que
// no haya reportado: es que NO PODÍA. Nadie puede monitorear cámaras que no se
// ven, y culpar al operador por eso es el falso positivo más caro del reporte.
//
// Este módulo responde, para una lista de establecimientos y una ventana de
// tiempo, qué le pasó al DVR de cada uno. El reporte lo usa para dos cosas:
// mostrar la falla con su hora, y sacar a los caídos de la cuenta de los que no
// reportaron.
//
// Va en un archivo aparte de `dvrFailure.lib.ts` a propósito: aquélla es pura y
// su test la importa directamente, sin Mongoose. Acá sí se consulta la base.


/** Lo que el reporte sabe del DVR de un establecimiento en la jornada. */
export interface DvrEstadoLocal {
    /** ¿Está caído AHORA? Es lo que decide si se lo excluye de "no reportó". */
    down: boolean;

    /** Hora de la caída vigente, o de la última del día si ya volvió. */
    failedAt: Date | null;

    /** Esa misma hora en formato HH:mm, lista para pintar. */
    failedAtLabel: string | null;

    /** Cuándo volvió, si volvió dentro de la jornada. */
    restoredAt: Date | null;
    restoredAtLabel: string | null;

    /** Cuántas veces se cayó en esta jornada. */
    episodes: number;

    /** Minutos que estuvo ciego DENTRO de la jornada. */
    downtimeMinutes: number;

    /** Quién pasó la caída vigente. Vacío si entró por el puente sin sesión. */
    reportedByName: string;
}


/** Un establecimiento sin ninguna caída en la jornada. */
export const sinFallas = (): DvrEstadoLocal => ({
    down: false,
    failedAt: null,
    failedAtLabel: null,
    restoredAt: null,
    restoredAtLabel: null,
    episodes: 0,
    downtimeMinutes: 0,
    reportedByName: '',
});


/**
 * El estado del DVR de cada establecimiento durante una ventana.
 *
 * @param localIds  los establecimientos que entran en el reporte
 * @param start     apertura de la jornada
 * @param end       cierre de la ventana evaluada (el corte, o el fin del día)
 * @param tz        zona con la que se arman las etiquetas de hora
 *
 * @returns un Map de idLocal → estado. Los locales sin caídas NO aparecen: el
 *          llamador usa `sinFallas()` para ésos y así no se recorre dos veces.
 *
 * Trae los episodios que SE SOLAPAN con la ventana, no los que empezaron dentro:
 * una caída de ayer que sigue abierta es justamente el caso que hay que ver, y
 * filtrando por `failedAt >= start` se perdería.
 */
export const estadoDvrPorLocal = async (
    localIds: Types.ObjectId[],
    start: Date,
    end: Date,
    tz: string,
): Promise<Map<string, DvrEstadoLocal>> => {

    const estados = new Map<string, DvrEstadoLocal>();
    if (localIds.length === 0) return estados;

    const episodios = await DvrFailureModel.find({
        local: { $in: localIds },

        // Empezó antes de que cerrara la ventana…
        failedAt: { $lt: end },

        // …y o bien sigue abierta, o cerró después de que la ventana abriera.
        $or: [
            { restoredAt: null },
            { restoredAt: { $gt: start } },
        ],
    })
        .select('local localName failedAt restoredAt active reportedByName')
        .sort({ failedAt: 1 })
        .lean();

    const etiqueta = (fecha: Date | null) => (fecha ? moment.tz(fecha, tz).format('HH:mm') : null);

    for (const episodio of episodios) {
        const clave = String(episodio.local);
        const actual = estados.get(clave) ?? sinFallas();

        actual.episodes += 1;
        actual.downtimeMinutes += overlapMinutes(
            episodio.failedAt,
            episodio.restoredAt ?? null,
            start,
            end,
        );

        // Qué hora se muestra cuando hubo varias caídas en el día: la de la que
        // sigue abierta si hay una, y si no la de la última. Es la que responde
        // "¿desde cuándo?", que es lo que se pregunta al mirar la fila.
        //
        // Los episodios vienen ordenados por `failedAt`, así que el último que
        // se procesa es el más reciente; y en cuanto aparece uno activo, gana y
        // ya no lo pisa nadie —no puede haber dos abiertos del mismo local—.
        if (!actual.down) {
            actual.down = Boolean(episodio.active);
            actual.failedAt = episodio.failedAt;
            actual.failedAtLabel = etiqueta(episodio.failedAt);
            actual.restoredAt = episodio.restoredAt ?? null;
            actual.restoredAtLabel = etiqueta(episodio.restoredAt ?? null);
            actual.reportedByName = episodio.reportedByName ?? '';
        }

        estados.set(clave, actual);
    }

    return estados;
};


export default estadoDvrPorLocal;
