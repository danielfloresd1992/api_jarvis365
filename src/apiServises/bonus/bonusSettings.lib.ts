import BonusSettingsModel, { BonusActor, BonusSettingsDoc } from './bonusSettings.model.js';
import type { HydratedDocument } from 'mongoose';

/*
 * Acceso al valor global, aparte de las rutas.
 *
 * Vive suelto porque lo necesita el sellado de novedades, y ese camino no debería
 * tener que importar un router de Express para leer un número.
 *
 * Acá NO se lee la tasa de cambio. Vive en `apiServises/exchangeRate/` y se pide
 * ahí; dejar un atajo en esta lib volvería a atar la nómina a la configuración
 * del bono, que es lo que la mudanza vino a cortar.
 */

/** Lo que dice el reglamento cuando todavía nadie configuró nada. */
export const DEFAULT_POINT_VALUE = 0.20;


/** El valor global, siempre presente. */
export interface BonusSettingsValues {
    pointValue: number;
}


/**
 * La variable global del sistema de bonificación.
 *
 * Nunca falla ni devuelve null: si no hay documento, o si la consulta se cae,
 * responde el valor por defecto. Sellar una novedad no puede quedar bloqueado
 * porque falte una configuración — y por eso el tipo de retorno no lleva
 * `| null`: quien la llame no tiene que defenderse de un caso que no ocurre.
 *
 * Devuelve un objeto y no el número pelado porque es lo que espera el sellado
 * (`resolveBonusForNovelty` recibe `settings`), y porque así agregar otra
 * variable de bonificación no obliga a tocar a los llamadores.
 */
export const getBonusSettings = async (): Promise<BonusSettingsValues> => {
    try {
        const ajustes = await BonusSettingsModel.findOne().select('pointValue').lean();

        const valor = Number(ajustes?.pointValue);

        return {
            pointValue: Number.isFinite(valor) && valor >= 0 ? valor : DEFAULT_POINT_VALUE,
        };
    }
    catch {
        return { pointValue: DEFAULT_POINT_VALUE };
    }
};


/** Solo el valor del bono. Es lo único que necesita el sellado de novedades. */
export const getBonusPointValue = async (): Promise<number> =>
    (await getBonusSettings()).pointValue;


/**
 * Cambia el valor del bono y archiva el anterior.
 *
 * Hay un solo documento: si no existe se crea, y si existe se actualiza empujando
 * el valor viejo al historial.
 *
 * Recibe el número y no un parcial `{ pointValue?: number }`: desde que la tasa
 * se mudó, este documento tiene un solo campo y un parcial vacío no significa
 * nada — el esquema ya exige el valor, así que un "no lo toques" no puede
 * llegar hasta acá.
 *
 * @param pointValue  cuánto pasa a valer un bono, en dólares.
 * @param usuario     quién lo cambió.
 */
export const saveBonusSettings = async (
    pointValue: number,
    usuario: BonusActor,
): Promise<HydratedDocument<BonusSettingsDoc>> => {

    const ajustes = await BonusSettingsModel.findOne();

    if (!ajustes) {
        return BonusSettingsModel.create({
            pointValue,
            updatedBy: usuario,
            history: [],
        });
    }

    // Solo si de verdad cambió: reguardar el mismo número dejaría en la auditoría
    // un cambio que nunca ocurrió.
    if (pointValue !== ajustes.pointValue) {
        ajustes.history.push({
            pointValue: ajustes.pointValue,
            changedAt: new Date(),
            changedBy: ajustes.updatedBy ?? null,
        });
    }

    ajustes.pointValue = pointValue;
    ajustes.updatedBy = usuario;

    return ajustes.save();
};
