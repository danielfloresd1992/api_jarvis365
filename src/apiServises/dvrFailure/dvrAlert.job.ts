import moment from 'moment-timezone';
import { enviarListaDeActivas } from './dvrAlert.service.js';
import { TZ_ALERTA } from './dvrAlert.lib.js';

// ══════════════════════════════════════════════════════════════════════
// EL RELOJ: LA LISTA DE CAÍDAS ACTIVAS, CADA HORA EN PUNTO
// ══════════════════════════════════════════════════════════════════════
// Un solo trabajo: despertarse a la hora en punto y pedirle al servicio que
// mande la lista. No sabe qué dice el mensaje ni cómo se entrega — de eso se
// encargan `dvrAlert.lib.ts` y `dvrAlert.service.ts`.
//
// Se agenda con un `setTimeout` que se re-agenda solo, en vez de un
// `setInterval` de una hora. Dos razones, y las dos se notan en producción:
//
//   1. un `setInterval` que arranca a las 09:17 dispara a las 10:17, 11:17…
//      —nunca en punto—, y la lista se llamaría «corte de las 10:17»;
//   2. `setInterval` acumula deriva; volver a calcular cuánto falta para la
//      próxima hora después de cada envío la corrige sola, y de paso sobrevive a
//      un cambio de horario de verano sin desfasarse.


/** ¿Ya se inició? Un segundo arranque duplicaría los mensajes del grupo. */
let relojIniciado = false;

/** El handle del temporizador, para poder detenerlo en las pruebas. */
let temporizador: NodeJS.Timeout | null = null;


/**
 * Cuántos milisegundos faltan para la próxima hora en punto.
 *
 * Se suma un segundo de gracia para caer del lado de adentro de la hora: sin él,
 * un temporizador que despierta unos milisegundos antes formatearía el corte con
 * la hora ANTERIOR («corte de las 09:59» en el mensaje de las 10:00).
 */
export const milisegundosHastaLaProximaHora = (desde: Date = new Date()): number => {
    const ahora = moment.tz(desde, TZ_ALERTA);
    const proxima = ahora.clone().startOf('hour').add(1, 'hour');

    return proxima.diff(ahora) + 1_000;
};


/** Un corte: pide el envío y deja constancia. Nunca deja escapar un error. */
const correrCorte = async (): Promise<void> => {
    try {
        const ahora = new Date();
        const cuantas = await enviarListaDeActivas(ahora);

        const hora = moment.tz(ahora, TZ_ALERTA).format('HH:mm');

        console.log(cuantas > 0
            ? `[dvr-alerta] corte de las ${hora}: ${cuantas} establecimiento(s) sin conexión, lista enviada`
            : `[dvr-alerta] corte de las ${hora}: sin caídas activas, no se envía nada`);
    }
    catch (error: any) {
        // Un fallo en un corte no puede llevarse el reloj por delante: se anota y
        // se espera al siguiente. Si esto tumbara el temporizador, la lista
        // dejaría de salir para siempre y nadie se enteraría hasta que hiciera
        // falta.
        console.log(`[dvr-alerta] falló el corte horario: ${error?.message ?? error}`);
    }
};


/** Se agenda el próximo corte y, al terminarlo, se vuelve a agendar. */
const agendarProximoCorte = (): void => {
    const espera = milisegundosHastaLaProximaHora();

    temporizador = setTimeout(async () => {
        await correrCorte();
        agendarProximoCorte();
    }, espera);

    // Que un temporizador pendiente no sea motivo para que el proceso siga vivo:
    // si todo lo demás terminó, esto no debería impedir que Node cierre.
    temporizador.unref?.();
};


/**
 * Arranca el reloj. Se llama UNA vez, al levantar el servidor.
 *
 * Igual que el scheduler de asistencia: apagado fuera de producción salvo que se
 * pida con `DVR_ALERT_ENABLED=true`. El envío en sí también lo comprueba, así que
 * aunque este reloj corra no sale nada al grupo sin el permiso explícito.
 */
export const startDvrAlertScheduler = (): void => {
    if (relojIniciado) {
        console.log('[dvr-alerta] el reloj ya estaba iniciado; se ignora la segunda llamada.');
        return;
    }

    const bandera = process.env.DVR_ALERT_ENABLED;
    const habilitado = bandera !== undefined
        ? bandera === 'true'
        : process.env.NODE_ENV === 'production';

    if (!habilitado) {
        console.log('[dvr-alerta] reloj DESACTIVADO (DVR_ALERT_ENABLED/NODE_ENV). No se enviará la lista horaria.');
        return;
    }

    relojIniciado = true;
    agendarProximoCorte();

    const proxima = moment.tz(TZ_ALERTA).startOf('hour').add(1, 'hour').format('HH:mm');
    console.log(`[dvr-alerta] reloj activo · próximo corte a las ${proxima} (${TZ_ALERTA})`);
};


/** Detiene el reloj. Existe para las pruebas y para un apagado ordenado. */
export const stopDvrAlertScheduler = (): void => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
    relojIniciado = false;
};


export default startDvrAlertScheduler;
