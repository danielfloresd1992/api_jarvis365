import ExchangeRateModel, { type ExchangeRateActor, type ExchangeRateDoc } from './exchangeRate.model.js';
import type { HydratedDocument } from 'mongoose';

/*
 * Acceso a la tasa de cambio, aparte de las rutas.
 *
 * Vive suelto porque la nómina la necesita para convertir cada corte que
 * responde, y ese camino no debería tener que importar un router de Express
 * para leer un número.
 *
 * Los tipos se importan con `type` adelante y no sueltos: las pruebas cargan
 * estas fuentes en crudo con el borrador de tipos de Node, que NO elimina un
 * import de tipo que no esté marcado, y el módulo reventaría al enlazar
 * pidiéndole al modelo un export que en tiempo de ejecución no existe.
 */

/**
 * Sin tasa cargada no se puede convertir a bolívares; cero lo deja explícito.
 *
 * Y no un número plausible, a diferencia del bono: allá el defecto es el 0,20
 * que fija el reglamento, un dato escrito en alguna parte. Acá no hay
 * reglamento que valga —la tasa la dice el mercado cada día—, así que el único
 * valor honesto es el que se nota. Un cero en pantalla se ve, se pregunta y se
 * corrige; el último que hubo se paga como si fuera el de hoy.
 */
export const DEFAULT_EXCHANGE_RATE = 0;


/** La tasa con todo lo que hace falta para mostrarla y explicarla en pantalla. */
export interface ExchangeRateDetail {
    /** Bolívares por dólar. */
    value: number;

    /** De dónde salió el número, para decirlo al lado de la cifra. */
    source: string | null;

    /** Cuándo se cargó. Es lo que responde "¿esta tasa es de hoy?". */
    updatedAt: Date | null;

    updatedBy: ExchangeRateActor | null;

    /**
     * Si alguien la cargó alguna vez. Es la EXISTENCIA del documento: un cero
     * guardado no puede darse, lo impide `exchangeRate.schema.ts`, así que no
     * hay más caso de "sin configurar" que este.
     */
    configured: boolean;
}


/**
 * La tasa vigente, con su procedencia y su fecha.
 *
 * NUNCA falla ni devuelve null: si no hay documento, o si la consulta se cae,
 * responde cero y `configured: false`. Y no crea nada — leer no escribe en la
 * base.
 */
export const getExchangeRateDetail = async (): Promise<ExchangeRateDetail> => {
    try {
        // Los campos se piden uno por uno, como en `bonusSettings.lib.ts`, y acá
        // pesa más que allá: este documento arrastra `history`, que crece una
        // entrada por cada tasa cargada y no tiene tope. Sin el `select`, cada
        // lectura de un corte de nómina o de un bono —que es quien llama acá, y
        // varias veces por pantalla— se traería años de auditoría para usar un
        // solo número. El historial se lee donde hace falta, en su ruta.
        const tasa = await ExchangeRateModel
            .findOne()
            .select('value source updatedAt updatedBy')
            .lean();

        const valor = Number(tasa?.value);

        return {
            value: Number.isFinite(valor) && valor >= 0 ? valor : DEFAULT_EXCHANGE_RATE,
            source: tasa?.source ?? null,
            updatedAt: tasa?.updatedAt ?? null,
            updatedBy: tasa?.updatedBy ?? null,
            configured: Boolean(tasa),
        };
    }
    catch {
        return {
            value: DEFAULT_EXCHANGE_RATE,
            source: null,
            updatedAt: null,
            updatedBy: null,
            configured: false,
        };
    }
};


/**
 * Solo el número. Es lo único que necesita la nómina para convertir un corte.
 *
 * Que no lance es deliberado y es la razón de ser de esta función: leer un
 * corte de nómina no puede fallar porque nadie haya cargado la tasa todavía.
 * Sin tasa, la columna de bolívares sale en cero y se ve que falta; con una
 * excepción, la pantalla entera —los dólares incluidos, que sí son el dato
 * bueno— se queda sin cargar por una variable de presentación.
 *
 * Por eso tampoco lleva `| null` en el retorno: quien la llame no tiene que
 * defenderse de un caso que no ocurre.
 */
export const getExchangeRate = async (): Promise<number> =>
    (await getExchangeRateDetail()).value;


/**
 * Carga la tasa del día y archiva la anterior.
 *
 * Hay un solo documento: si no existe se crea, y si existe se actualiza
 * empujando la tasa vieja al historial con quién la había puesto.
 *
 * SE ARCHIVA SIEMPRE, aunque el valor repita al anterior. El bono se saltea ese
 * caso —reguardar el mismo número no es un cambio del reglamento y dejaría en
 * su auditoría uno que nunca ocurrió—; acá cada PUT es alguien declarando la
 * tasa de hoy, y que dos días seguidos haya dado lo mismo es parte de la
 * respuesta a "¿a qué tasa se pagó este corte?".
 *
 * No recalcula nada hacia atrás: los cortes cerrados conservan sus montos en
 * dólares y esos no dependen de la tasa. Lo que sí cambia al guardar acá es la
 * columna de bolívares de todo lo que se lea después, y eso es el diseño: el
 * bolívar es una conversión, no un dato sellado.
 *
 * @param value    bolívares por dólar. Ya validado: mayor que cero.
 * @param source   de dónde salió. `null` es "no lo dijo".
 * @param usuario  quién la cargó.
 */
export const saveExchangeRate = async (
    value: number,
    source: string | null,
    usuario: ExchangeRateActor,
): Promise<HydratedDocument<ExchangeRateDoc>> => {

    const tasa = await ExchangeRateModel.findOne();

    if (!tasa) {
        return ExchangeRateModel.create({
            value,
            source,
            updatedBy: usuario,
            history: [],
        });
    }

    // `changedAt` es cuándo dejó de regir esta tasa, no cuándo empezó: se
    // escribe en el momento en que la reemplaza la nueva. Ver el comentario de
    // `ExchangeRateChange` en el modelo — la auditoría se lee al derecho solo
    // si las dos puntas están de acuerdo en eso.
    tasa.history.push({
        value: tasa.value,
        source: tasa.source ?? null,
        changedAt: new Date(),
        changedBy: tasa.updatedBy ?? null,
    });

    tasa.value = value;
    tasa.source = source;
    tasa.updatedBy = usuario;

    return tasa.save();
};
