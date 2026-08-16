// ══════════════════════════════════════════════════════════════════════
// CUÁNTO BONIFICA UNA NOVEDAD
// ══════════════════════════════════════════════════════════════════════
// Resuelve la regla de una alerta para un operador y un establecimiento
// concretos, y devuelve lo que hay que congelar en la novedad.
//
// Es una función PURA: no consulta la base ni mira el reloj. Todo lo que
// necesita entra por parámetro, incluido el valor del bono. Eso la hace
// probable sin base de datos, que es lo que importa cuando el resultado es
// dinero.
//
//
// LO QUE DEVUELVE NO ES UN TOTAL
//
// Devuelve cuánto vale ESTA alerta suelta (`bonusPerAlert`). El total del
// período se calcula al corte, sumando ese campo entre todas las novedades
// aprobadas. Una regla de "4 alertas por 1 bono" deja 0,25 en cada una, y seis
// alertas suman 1,5 — las que sobran del grupo NO se pierden.

/** Turnos, como los guarda el sello. */
export const WORK_SHIFT = {
    DAY: 'day',
    NIGHT: 'night',
};

/** De dónde salió el valor: de la regla general o de una excepción. */
export const APPLIED_FROM = {
    RULE: 'rule',
    OVERRIDE: 'override',
};


const comoTexto = (valor) => {
    if (!valor) return '';
    if (typeof valor === 'string') return valor;
    if (valor._id) return String(valor._id);
    return String(valor);
};

const esNocturno = (valor) => String(valor || '').trim().toLowerCase().startsWith('noc');

/** Igual que en dayRoster: el día de la semana con el que se indexa el horario. */
const diaDeLaSemana = (fecha) => new Date(fecha).getDay();


/**
 * El turno en el que trabajaba el operador, con la MISMA cascada que usa
 * dayRoster.service.js para la jornada efectiva:
 *
 *     override del día  >  su horario de ese día  >  su jornada base
 *
 * Se devuelve también de qué capa salió: sin eso, explicar por qué una novedad
 * pagó nocturno obliga a reconstruir el horario de esa fecha, que quizá ya
 * cambió.
 *
 * @param {object} user        el usuario que reportó, con workSchedule
 * @param {object} attendance  su asistencia de ese día, si la hay
 * @param {Date}   fecha       cuándo reportó
 */
export const resolveWorkShift = (user, attendance, fecha) => {
    const override = attendance?.scheduleOverride?.shift;
    if (override) {
        return { workShift: esNocturno(override) ? WORK_SHIFT.NIGHT : WORK_SHIFT.DAY, shiftSource: 'override' };
    }

    // Con .lean() el Map de Mongoose llega como objeto plano y las claves son
    // cadenas; se toleran las dos formas.
    const porDia = user?.workSchedule?.scheduleByDay;
    const clave = String(diaDeLaSemana(fecha));
    const delDia = porDia instanceof Map ? porDia.get(clave) : porDia?.[clave];

    if (delDia?.shift) {
        return { workShift: esNocturno(delDia.shift) ? WORK_SHIFT.NIGHT : WORK_SHIFT.DAY, shiftSource: 'regla' };
    }

    const base = user?.workSchedule?.shiftType;
    if (base) {
        return { workShift: esNocturno(base) ? WORK_SHIFT.NIGHT : WORK_SHIFT.DAY, shiftSource: 'shiftType' };
    }

    // Sin horario cargado se asume diurno, pero queda dicho de dónde salió:
    // son las novedades que conviene revisar antes de pagar.
    return { workShift: WORK_SHIFT.DAY, shiftSource: 'default' };
};


/**
 * ¿La regla aplica en este establecimiento?
 *
 * El alcance se declara por marca o por establecimiento, y en dos sentidos:
 * 'only' enumera dónde SÍ, 'except' dónde NO. Hacen falta los dos porque el
 * reglamento usa los dos —"SOLO FRANCISCAS" y "todos los Mister excepto Fort
 * Lauderdale"—, y con uno solo el segundo obliga a mantener a mano la lista de
 * todos los demás.
 */
export const isInScope = (rule, establishment) => {
    const alcance = rule?.scope;
    if (!alcance || alcance.mode === 'all') return true;

    const idLocal = comoTexto(establishment?._id ?? establishment);
    const idMarca = comoTexto(establishment?.franchiseReference?.franchise);

    const estaListado =
        (alcance.locals || []).some(l => comoTexto(l) === idLocal && idLocal)
        || (alcance.franchises || []).some(f => comoTexto(f) === idMarca && idMarca);

    return alcance.mode === 'only' ? estaListado : !estaListado;
};


/**
 * La excepción que corresponde a este establecimiento, si la hay.
 *
 * Gana la más específica: si hay una para el local, la de su franquicia no se
 * mira. Sin esa prioridad, una alerta con excepción de marca Y de local
 * dependería del orden en que se cargaron, que es lo peor posible.
 */
const findOverride = (rule, establishment) => {
    const idLocal = comoTexto(establishment?._id ?? establishment);
    const idMarca = comoTexto(establishment?.franchiseReference?.franchise);
    const excepciones = rule?.overrides || [];

    return excepciones.find(e => comoTexto(e.local) === idLocal && idLocal)
        ?? excepciones.find(e => comoTexto(e.franchise) === idMarca && idMarca)
        ?? null;
};


/** Un número usable, o el de reserva. Evita que un null se propague al pago. */
const numero = (valor, porDefecto) => {
    const n = Number(valor);
    return Number.isFinite(n) ? n : porDefecto;
};


/** El sello de una novedad que no bonifica. Se guarda igual: "no bonifica" es
 *  una decisión, y verse igual que "nunca se selló" borra esa diferencia. */
const noBonifica = (motivo, ahora) => ({
    applies: false,
    reason: motivo,
    frozenAt: ahora,
});


/**
 * Resuelve la bonificación de una novedad.
 *
 * @param {object} params
 * @param {object} params.user           quien reportó, con su workSchedule
 * @param {object} [params.attendance]   su asistencia de ese día, si la hay
 * @param {object} params.menu           la alerta, con `bonusRule` POPULADA
 * @param {object} params.establishment  dónde ocurrió, con franchiseReference
 * @param {object} params.settings       { pointValue } — el valor global del bono
 * @param {Date}   [params.at]           cuándo se reportó (default: ahora)
 *
 * @returns {object} lo que se guarda en `Noveltie.bonus`
 */
export const resolveBonusForNovelty = ({ user, attendance = null, menu, establishment, settings = {}, at = new Date() }) => {

    const rule = menu?.bonusRule;

    // Sin regla la alerta no bonifica. Ojo: eso NO es lo mismo que "nadie la
    // revisó todavía" — esa diferencia la lleva Menu.bonusReviewed.
    if (!rule || typeof rule !== 'object') return noBonifica('sin-regla', at);
    if (rule.active === false) return noBonifica('regla-inactiva', at);
    if (!isInScope(rule, establishment)) return noBonifica('fuera-de-alcance', at);

    // El turno decide CUÁNTOS bonos otorga, y es el del operador.
    const { workShift, shiftSource } = resolveWorkShift(user, attendance, at);

    // La excepción del establecimiento gana sobre la regla general, y solo en
    // los campos que declara: una excepción que solo cambia el nocturno hereda
    // el resto.
    const override = findOverride(rule, establishment);

    const alertsRequired = Math.max(1, numero(override?.alertsRequired, numero(rule.alertsRequired, 1)));
    const bonusAwarded = numero(
        override?.bonusAwarded?.[workShift],
        numero(rule.bonusAwarded?.[workShift], 1),
    );

    return {
        applies: true,

        rule: rule._id ?? null,
        appliedFrom: override ? APPLIED_FROM.OVERRIDE : APPLIED_FROM.RULE,

        // El número operativo: lo que vale ESTA alerta suelta. El corte suma
        // este campo entre todas las novedades aprobadas del período.
        bonusPerAlert: bonusAwarded / alertsRequired,

        // Los dos números de la regla, para poder leer "4x1" en vez de "0,25".
        alertsRequired,
        bonusAwarded,

        workShift,
        shiftSource,

        pointValue: numero(settings.pointValue, null),

        frozenAt: at,
    };
};
