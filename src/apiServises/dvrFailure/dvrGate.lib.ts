// ══════════════════════════════════════════════════════════════════════
// ¿SE LE ACEPTA ESTA ALERTA A UN ESTABLECIMIENTO SIN CÁMARAS?
// ══════════════════════════════════════════════════════════════════════
// Un local con una caída de DVR abierta no puede reportar nada: sin cámaras no
// hay nada que ver. Lo único que se le acepta es la alerta que dice que la
// conexión VOLVIÓ.
//
// Está acá y no dentro del controlador porque es la regla que decide si alguien
// puede o no cargar su trabajo. Equivocarla en el lado prudente pierde el
// bloqueo; equivocarla en el otro deja a los establecimientos sin poder
// reportar, y eso se nota tarde y mal. Pura y con pruebas.

export interface EntradaDelCandado {
    /** Qué le hace al DVR la alerta que se está cargando (Menu.dvrEffect). */
    dvrEffect?: string | null;

    /** ¿El establecimiento tiene una caída abierta AHORA? */
    hayCaidaAbierta: boolean;

    /**
     * ¿Existe en el catálogo alguna alerta marcada como 'up'?
     *
     * Sin ella no habría ninguna forma de desbloquear un local.
     */
    hayComoDesbloquear: boolean;
}


/**
 * ¿Hay que rechazar esta alerta?
 *
 * Las tres condiciones tienen que darse a la vez:
 *
 *   1. el establecimiento está caído,
 *   2. la alerta NO es la de restablecimiento, y
 *   3. existe una alerta de restablecimiento en el catálogo.
 *
 * La tercera es la que más importa y la menos evidente. Si nadie marcó todavía
 * una alerta como 'up' —el campo `dvrEffect` es nuevo y arranca en null—, echar
 * el candado dejaría al local encerrado para siempre: no habría alerta capaz de
 * abrirlo. Así que sin llave no se cierra la puerta.
 *
 * Es además lo que hace que desplegar esto no rompa nada: hasta que el catálogo
 * se marque, la regla no bloquea a nadie.
 */
export const debeRechazarLaAlerta = ({
    dvrEffect,
    hayCaidaAbierta,
    hayComoDesbloquear,
}: EntradaDelCandado): boolean => {
    if (!hayCaidaAbierta) return false;
    if (dvrEffect === 'up') return false;      // es la que reabre: siempre pasa
    if (!hayComoDesbloquear) return false;     // sin llave no se cierra
    return true;
};


// ══════════════════════════════════════════════════════════════════════
// ¿ESTE LOCAL ENTRA EN EL CORTE DE "SIN REPORTAR AL GRUPO"?
// ══════════════════════════════════════════════════════════════════════
// El corte horario manda al grupo la lista de establecimientos que no enviaron
// nada en la última hora. Un local solo merece estar en esa lista si de verdad
// PODÍA haber reportado y no lo hizo.
//
// Son cuatro condiciones, y las cuatro tienen que darse:
//
//   1. está en monitoreo AHORA y es ANALÍTICO — el perimetral no reporta
//      alertas, así que reclamarle sería reclamar por algo que no le toca;
//   2. ya lo estaba hace una hora — al que acaba de abrir no se le puede
//      reclamar una hora que no trabajó;
//   3. tiene el conteo habilitado — un administrador puede sacarlo de la lista
//      (obra, local cerrado por dentro, cámara apuntando a un depósito);
//   4. NO tiene una falla de conexión con el DVR abierta.
//
// La cuarta es la que faltaba, y es la que más se notaba: un local sin cámaras
// aparecía todas las horas en el grupo como si el operador no hubiera hecho su
// trabajo, cuando lo que pasaba es que no había nada que mirar.
//
// Se evalúa EN EL MOMENTO DEL CORTE, con el estado de ese instante. No se
// guarda ni se cachea: entre un corte y el siguiente un local se cae, se
// restablece, o un administrador cambia el interruptor, y el corte que viene
// tiene que reflejarlo sin esperar a nada.

export interface EntradaDelCorte {
    /** ¿Está en ventana de monitoreo analítico en este momento? */
    enVentanaAnalitica: boolean;

    /** ¿También lo estaba hace una hora? */
    estabaHaceUnaHora: boolean;

    /** ¿Un administrador lo sacó de la lista? */
    exento: boolean;

    /** ¿Tiene una caída de DVR abierta ahora mismo? */
    dvrCaido: boolean;
}


/**
 * ¿Se lo juzga en este corte?
 *
 * Solo `true` cuando el local podía reportar de verdad. Cualquier motivo para
 * dudarlo lo deja afuera: es preferible no reclamarle a uno que debía, que
 * reclamarle todas las horas a uno que no podía — eso último enseña a ignorar
 * la lista entera, y entonces deja de servir para nadie.
 */
export const entraEnElCorteDeSilencio = ({
    enVentanaAnalitica,
    estabaHaceUnaHora,
    exento,
    dvrCaido,
}: EntradaDelCorte): boolean => {
    if (!enVentanaAnalitica) return false;
    if (!estabaHaceUnaHora) return false;
    if (exento) return false;
    if (dvrCaido) return false;
    return true;
};


export default debeRechazarLaAlerta;
