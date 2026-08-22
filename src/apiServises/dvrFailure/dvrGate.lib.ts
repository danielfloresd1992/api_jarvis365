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


export default debeRechazarLaAlerta;
