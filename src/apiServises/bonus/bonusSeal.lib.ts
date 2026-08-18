import type { Types } from 'mongoose';
import MenuModel from '../menu/menu.model.js';
import UserModel from '../user/user.model.js';
import AttendanceModel from '../user/attendance.model.js';
import LocalModel from '../local/local.model.js';
import { getBonusSettings } from './bonusSettings.lib.js';
import { resolveBonusForNovelty } from './resolveBonus.lib.js';
import type { BonusSeal } from './bonus.types.js';

// ══════════════════════════════════════════════════════════════════════
// ARMAR EL SELLO DE UNA NOVEDAD
// ══════════════════════════════════════════════════════════════════════
// La mitad IMPURA del sellado: va a la base, junta lo que la resolución
// necesita, la llama, y devuelve lo que se guarda en `Noveltie.bonus`.
//
// Está separada de resolveBonus.lib.ts a propósito: aquélla no toca la base ni
// el reloj y por eso se prueba sin Mongo. Los errores de acá son de
// RECOLECCIÓN —un populate que falta, la fecha equivocada—, no de cálculo.
//
// No decide CUÁNDO sellar: eso es del PUT de novedades.


/** Lo mínimo que hace falta de la novedad para sellarla. */
export interface SealableNovelty {
    _id?: Types.ObjectId | string;
    menuRef?: Types.ObjectId | string | null;
    establishment?: Types.ObjectId | string | null;
    createdAt?: Date;
    sharedByUser?: {
        createdAt?: Date;
        user?: { id?: Types.ObjectId | string | null } | null;
    } | null;
}


/** El día a las 00:00 UTC — así guarda `Attendance.date`. Con la hora cruda no matchea nunca. */
const diaCivil = (fecha: Date): Date =>
    new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));


/**
 * Arma el sello de bonificación de una novedad.
 *
 * Recibe la novedad y busca en la base:
 *   Menu        la alerta, con `bonusRules.rule` POPULADA
 *   User        el operador que reportó, con su horario
 *   Attendance  su asistencia del día en que ocurrió
 *   Local       el establecimiento, con su marca
 *   Settings    cuánto vale un bono hoy
 *
 * Devuelve el sello, o `null` si no se pudo armar. Ese `null` significa
 * "no sellar": la novedad queda en `applies: null` y se puede reprocesar. Un
 * sello a medias quedaría congelado y mintiendo.
 */
export const buildBonusSeal = async (noveltie: SealableNovelty): Promise<BonusSeal | null> => {
    try {
        if (!noveltie?.menuRef) return null;

        // Cuándo OCURRIÓ, no cuándo se valida: con esta fecha se busca el turno.
        // Una novedad del sábado validada el lunes tiene que resolver el sábado.
        const cuando = noveltie.sharedByUser?.createdAt ?? noveltie.createdAt ?? new Date();
        const operadorId = noveltie.sharedByUser?.user?.id ?? null;

        const [alerta, operador, asistencia, establecimiento, settings] = await Promise.all([
            // Populate ANIDADO. Sin él llega un ObjectId y la resolución devuelve
            // 'regla-sin-popular' — y el sello se congela con eso.
            MenuModel.findById(noveltie.menuRef).populate('bonusRules.rule').lean(),
            operadorId ? UserModel.findById(operadorId).select('workSchedule').lean() : null,
            operadorId ? AttendanceModel.findOne({ userId: operadorId, date: diaCivil(cuando) }).lean() : null,
            noveltie.establishment ? LocalModel.findById(noveltie.establishment).select('franchiseReference').lean() : null,
            getBonusSettings(),
        ]);

        if (!alerta) return null;

        return resolveBonusForNovelty({
            user: operador as never,
            attendance: asistencia as never,
            menu: alerta as never,
            establishment: establecimiento as never,
            settings,
            at: cuando,           // cuándo ocurrió → el turno
            frozenAt: new Date(), // cuándo se decidió → el sello
        });
    }
    catch (error) {
        // La bonificación NUNCA tumba una validación: sin sello se reprocesa;
        // con la validación caída, el operador no puede trabajar.
        console.log('No se pudo armar el sello de bonificación:', (error as Error)?.message);
        return null;
    }
};


export default buildBonusSeal;
