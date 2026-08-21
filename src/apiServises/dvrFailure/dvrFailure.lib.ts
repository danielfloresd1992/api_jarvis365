import moment from 'moment-timezone';

// ══════════════════════════════════════════════════════════════════════
// LAS DOS CUENTAS QUE HACEN LOS ENDPOINTS DE CAÍDAS
// ══════════════════════════════════════════════════════════════════════
// A qué día operativo pertenece una hora, y cuánto duró un episodio. Están acá y
// no dentro de las rutas para poder probarlas sin levantar Express: de la
// primera depende en qué día cae cada estadística, y de la segunda, el número
// que después se suma.

/**
 * La zona en la que se define la jornada.
 *
 * El mismo valor y la misma variable que usa el reporte de novedades. Si un día
 * se muda la operación, se cambia en el entorno y las dos cosas se mueven
 * juntas.
 */
const REPORT_TZ = process.env.MONITORING_TZ || 'America/Caracas';

/** Hora a la que abre la jornada de monitoreo. */
const OPENS_AT = 8;


/**
 * El día operativo al que pertenece un instante.
 *
 * La jornada va de las 08:00 a las 07:00 del día siguiente, así que una caída de
 * las 02:00 es del día ANTERIOR. Sin esto, la madrugada partiría cada noche en
 * dos días distintos y la estadística de un turno nocturno aparecería repartida
 * entre dos fechas.
 *
 * Devuelve medianoche UTC del día en que ABRE la jornada, que es la misma forma
 * que usa asistencia. Guardar una fecha civil y no un instante es lo que permite
 * comparar por igualdad sin arrastrar la hora.
 */
export const operationalDateOf = (when: Date | string | number = new Date()): Date => {
    const instante = moment.tz(when, REPORT_TZ);

    const apertura = instante.clone().startOf('day').hour(OPENS_AT);
    if (instante.isBefore(apertura)) apertura.subtract(1, 'day');

    return new Date(Date.UTC(apertura.year(), apertura.month(), apertura.date()));
};


/**
 * Cuántos minutos estuvo ciego el establecimiento.
 *
 * Se redondea hacia arriba y con mínimo 1: una caída que duró cuarenta segundos
 * ocurrió, y un 0 en la columna de tiempo ciego se lee como "no pasó nada".
 *
 * Si el restablecimiento resulta anterior a la caída —relojes de estación
 * desfasados, o una carga a mano con la hora mal— devuelve 0 en vez de un
 * negativo: un número negativo envenena la suma del mes entero, y el episodio
 * sigue quedando registrado para poder revisarlo.
 */
export const downtimeMinutesBetween = (failedAt: Date, restoredAt: Date): number => {
    const milisegundos = restoredAt.getTime() - failedAt.getTime();
    if (!Number.isFinite(milisegundos) || milisegundos <= 0) return 0;

    return Math.max(1, Math.ceil(milisegundos / 60_000));
};


export default { operationalDateOf, downtimeMinutesBetween };
