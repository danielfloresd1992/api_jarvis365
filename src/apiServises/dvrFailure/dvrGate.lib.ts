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

/**
 * LAS DOS ALERTAS DEL DVR, POR SU `_id` HISTÓRICO.
 *
 * Son las mismas dos que Jarvis-express reconoce a mano desde marzo de 2023:
 * la que reporta la caída y la que reporta el restablecimiento. El plan es que
 * esto lo diga el catálogo (`Menu.dvrEffect`), pero ese campo es nuevo y nadie
 * lo marcó todavía — y mientras tanto la compuerta no puede quedarse dormida.
 *
 * Por eso el efecto se resuelve en dos pasos: el catálogo manda, y si no dice
 * nada se cae a estos `_id`. El día que las dos alertas tengan su `dvrEffect`
 * cargado, este respaldo deja de usarse solo.
 */
export const ALERTA_DVR_LEGADA = {
    down: '640f7c747d44282c3f625d79',   // «Falla de conexión con DVR»
    up: '6417181494525c2ce4fc98aa',     // «Conexión restablecida»
} as const;


/**
 * Qué le hace esta alerta a la conexión: 'down', 'up' o nada.
 *
 * @param alertId    el `_id` de la alerta que se está cargando
 * @param dvrEffect  lo que diga el catálogo, si dice algo
 */
export const resolveDvrEffect = ({ alertId, dvrEffect }: {
    alertId?: string | null;
    dvrEffect?: string | null;
}): 'down' | 'up' | null => {
    if (dvrEffect === 'down' || dvrEffect === 'up') return dvrEffect;

    const id = String(alertId ?? '');
    if (id === ALERTA_DVR_LEGADA.down) return 'down';
    if (id === ALERTA_DVR_LEGADA.up) return 'up';
    return null;
};


export interface EntradaDelCandado {
    /** Qué le hace al DVR la alerta que se está cargando, YA RESUELTO. */
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
