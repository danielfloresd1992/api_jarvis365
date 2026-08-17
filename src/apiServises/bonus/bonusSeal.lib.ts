import { Types } from 'mongoose';
import MenuModel from '../menu/menu.model.js';
import UserModel from '../user/user.model.js';
import AttendanceModel from '../user/attendance.model.js';
import LocalModel from '../local/local.model.js';
import { getBonusSettings } from './bonusSettings.lib.js';
import { resolveBonusForNovelty } from './resolveBonus.lib.js';
import type { BonusSeal } from './resolveBonus.lib.js';

// ══════════════════════════════════════════════════════════════════════
// ARMAR EL SELLO DE UNA NOVEDAD
// ══════════════════════════════════════════════════════════════════════
// La contracara impura de `resolveBonus.lib.ts`: junta de la base todo lo que la
// función pura necesita, la llama, y devuelve lo que se guarda en
// `Noveltie.bonus`.
//
// Están separadas a propósito, y no es orden por el orden: `resolveBonusForNovelty`
// no toca la base ni el reloj, y por eso se puede probar con objetos planos y sin
// Mongo. Meterle adentro los `findById` y el `populate` mataría esa propiedad, que
// es la que importa cuando el resultado es dinero.
//
// La división también separa dónde puede fallar cada cosa: los errores de acá son
// de RECOLECCIÓN —un populate que falta, la fecha equivocada—, no de cálculo.


/** Lo mínimo que hace falta de la novedad para poder sellarla. */
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


/**
 * El día civil a las 00:00 UTC, que es como `Attendance` guarda su `date`.
 *
 * Se calcula con los componentes UTC de la fecha para que coincida con lo que
 * escribe `dayRoster.service.js`. Buscar la asistencia con la fecha-hora cruda no
 * encontraría nada nunca, y el turno caería silenciosamente a la capa siguiente
 * de la cascada.
 */
const diaCivil = (fecha: Date): Date => new Date(Date.UTC(
    fecha.getUTCFullYear(),
    fecha.getUTCMonth(),
    fecha.getUTCDate(),
));


/**
 * Resuelve y arma el sello de bonificación de una novedad.
 *
 * Devuelve `null` si no se pudo resolver —le falta la alerta, o la consulta se
 * cayó—. Quien llame debe tratar ese `null` como "no sellar": dejar
 * `bonus.applies` en `null` significa "no se evaluó" y se puede reprocesar,
 * mientras que un sello a medias queda congelado y mintiendo.
 *
 * NO decide CUÁNDO sellar. Eso es de la máquina de estados de la validación y
 * vive en el PUT: acá solo se arma el sello de la novedad que se pida.
 */
export const buildBonusSeal = async (noveltie: SealableNovelty): Promise<BonusSeal | null> => {
    try {
        if (!noveltie?.menuRef) return null;

        // CUÁNDO OCURRIÓ, no cuándo se valida. Con esta fecha se busca el turno
        // en el horario: una novedad del sábado validada el lunes tiene que
        // resolver el sábado.
        const cuando = noveltie.sharedByUser?.createdAt ?? noveltie.createdAt ?? new Date();
        const operadorId = noveltie.sharedByUser?.user?.id ?? null;

        const [alerta, operador, asistencia, establecimiento] = await Promise.all([

            // La regla POPULADA. Sin esto llega un ObjectId, la función pura lo
            // ve como "no es un objeto" y devuelve 'sin-regla' con el sistema
            // perfectamente configurado — y como el sello se congela, ese cero
            // queda grabado. Es el error más caro de este archivo.
            MenuModel.findById(noveltie.menuRef).populate('bonusRule').lean(),

            operadorId
                ? UserModel.findById(operadorId).select('workSchedule').lean()
                : null,

            operadorId
                ? AttendanceModel.findOne({ userId: operadorId, date: diaCivil(cuando) }).lean()
                : null,

            noveltie.establishment
                ? LocalModel.findById(noveltie.establishment).select('franchiseReference').lean()
                : null,
        ]);

        if (!alerta) return null;

        const settings = await getBonusSettings();

        return resolveBonusForNovelty({
            user: operador as never,
            attendance: asistencia as never,
            menu: alerta as never,
            establishment: establecimiento as never,
            settings,

            at: cuando,          // cuándo ocurrió → con esto se busca el turno
            frozenAt: new Date() // cuándo se decidió → queda en el sello
        });
    }
    catch (error) {
        // La bonificación NUNCA puede tumbar una validación. Sin sello la novedad
        // queda en `applies: null`, que significa "no se evaluó" y se puede
        // reprocesar; con la validación caída, el operador no puede trabajar.
        console.log('No se pudo armar el sello de bonificación:', (error as Error)?.message);
        return null;
    }
};


export default buildBonusSeal;
