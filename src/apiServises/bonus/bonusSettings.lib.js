import BonusSettingsModel from './bonusSettings.model.js';

/*
 * Acceso al valor del bono, aparte de las rutas.
 *
 * Vive suelto porque lo necesita el sellado de novedades
 * (libs/bonus/bonusSeal.lib.js), y ese camino no debería tener que importar un
 * router de Express para leer un número.
 */

/** Lo que dice el reglamento cuando todavía nadie configuró nada. */
export const DEFAULT_POINT_VALUE = 0.20;

/** Sin tasa cargada no se puede convertir a bolívares; cero lo deja explícito. */
export const DEFAULT_EXCHANGE_RATE = 0;


/**
 * Las dos variables globales del sistema de bonificación.
 *
 * Nunca falla ni devuelve null: si no hay documento, o si la consulta se cae,
 * responde los valores por defecto. Sellar una novedad no puede quedar
 * bloqueado porque falte una configuración.
 */
export const getBonusSettings = async () => {
    try {
        const ajustes = await BonusSettingsModel.findOne().select('pointValue exchangeRate').lean();

        const valor = Number(ajustes?.pointValue);
        const tasa = Number(ajustes?.exchangeRate);

        return {
            pointValue: Number.isFinite(valor) && valor >= 0 ? valor : DEFAULT_POINT_VALUE,
            exchangeRate: Number.isFinite(tasa) && tasa >= 0 ? tasa : DEFAULT_EXCHANGE_RATE,
        };
    }
    catch {
        return { pointValue: DEFAULT_POINT_VALUE, exchangeRate: DEFAULT_EXCHANGE_RATE };
    }
};


/** Solo el valor del bono. Es lo único que necesita el sellado de novedades. */
export const getBonusPointValue = async () => (await getBonusSettings()).pointValue;


/**
 * Cambia una o las dos variables y archiva las anteriores.
 *
 * Hay un solo documento: si no existe se crea, y si existe se actualiza
 * empujando el par viejo al historial.
 *
 * Acepta cambios parciales: mandar solo la tasa deja el valor del bono como
 * estaba. Es lo habitual, porque la tasa cambia mucho más seguido.
 *
 * @param {{pointValue?: number, exchangeRate?: number}} cambios
 * @param {{nameUser: string, _id: string}} usuario  quién los hizo
 */
export const saveBonusSettings = async (cambios, usuario) => {
    const ajustes = await BonusSettingsModel.findOne();

    const nuevoValor = Number.isFinite(Number(cambios?.pointValue)) ? Number(cambios.pointValue) : undefined;
    const nuevaTasa = Number.isFinite(Number(cambios?.exchangeRate)) ? Number(cambios.exchangeRate) : undefined;

    if (!ajustes) {
        return BonusSettingsModel.create({
            pointValue: nuevoValor ?? DEFAULT_POINT_VALUE,
            exchangeRate: nuevaTasa ?? DEFAULT_EXCHANGE_RATE,
            updatedBy: usuario,
            history: [],
        });
    }

    const cambiaValor = nuevoValor !== undefined && nuevoValor !== ajustes.pointValue;
    const cambiaTasa = nuevaTasa !== undefined && nuevaTasa !== ajustes.exchangeRate;

    // Se archiva el PAR completo, no solo lo que cambió: al revisar un corte
    // hace falta saber con qué dos números se calculó, y reconstruirlo cruzando
    // historiales separados es la clase de cuenta que sale mal.
    if (cambiaValor || cambiaTasa) {
        ajustes.history.push({
            pointValue: ajustes.pointValue,
            exchangeRate: ajustes.exchangeRate,
            changedAt: new Date(),
            changedBy: ajustes.updatedBy ?? null,
        });
    }

    if (nuevoValor !== undefined) ajustes.pointValue = nuevoValor;
    if (nuevaTasa !== undefined) ajustes.exchangeRate = nuevaTasa;
    ajustes.updatedBy = usuario;

    return ajustes.save();
};
