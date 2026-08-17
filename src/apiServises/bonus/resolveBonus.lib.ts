import type { Types } from 'mongoose';
import type { BonusAward, BonusScope, BonusOverride } from './bonusRule.model.js';

// ══════════════════════════════════════════════════════════════════════
// CUÁNTO BONIFICA UNA NOVEDAD
// ══════════════════════════════════════════════════════════════════════
// Resuelve la regla de una alerta para un operador y un establecimiento
// concretos, y devuelve lo que hay que congelar en la novedad.
//
// Es una función PURA: no consulta la base ni mira el reloj. Todo lo que necesita
// entra por parámetro, incluido el valor del bono. Eso la hace probable sin base
// de datos, que es lo que importa cuando el resultado es dinero.
//
// Los tipos de entrada son ESTRUCTURALES —describen lo que se lee, no documentos
// de Mongoose— justamente para no perder eso: se la puede llamar con objetos
// planos en una prueba y con documentos `.lean()` en producción.
//
//
// LO QUE DEVUELVE NO ES UN TOTAL
//
// Devuelve cuánto vale ESTA alerta suelta (`bonusPerAlert`). El total del período
// se calcula al corte, sumando ese campo entre todas las novedades aprobadas. Una
// regla de "4 alertas por 1 bono" deja 0,25 en cada una, y seis alertas suman 1,5
// — las que sobran del grupo NO se pierden.


/** Turnos, como los guarda el sello. */
export const WORK_SHIFT = {
    DAY: 'day',
    NIGHT: 'night',
} as const;

export type WorkShift = typeof WORK_SHIFT[keyof typeof WORK_SHIFT];


/** De dónde salió el valor: de la regla general o de una excepción. */
export const APPLIED_FROM = {
    RULE: 'rule',
    OVERRIDE: 'override',
} as const;

export type AppliedFrom = typeof APPLIED_FROM[keyof typeof APPLIED_FROM];


/**
 * De qué capa del horario salió el turno.
 *
 * `'default'` importa: significa que se asumió diurno SIN dato, y esas novedades
 * conviene revisarlas antes de pagar.
 */
export type ShiftSource = 'override' | 'regla' | 'shiftType' | 'default';


/** Por qué una novedad aprobada no bonificó. */
export type SkipReason = 'sin-regla' | 'regla-inactiva' | 'fuera-de-alcance';


// ── Lo que la función necesita leer ───────────────────────────────────

/** El operador, con lo justo para resolver su turno. */
export interface ShiftHolder {
    workSchedule?: {
        scheduleByDay?: Map<string, { shift?: string | null }> | Record<string, { shift?: string | null } | undefined> | null;
        shiftType?: string | null;
    } | null;
}

/** Su asistencia de ese día, si la hay. */
export interface AttendanceLike {
    scheduleOverride?: { shift?: string | null } | null;
}

/** Dónde ocurrió, con su marca. */
export interface EstablishmentLike {
    _id?: Types.ObjectId | string;
    franchiseReference?: {
        franchise?: Types.ObjectId | string | { _id?: Types.ObjectId | string } | null;
    } | null;
}

/** Una regla resoluble: lo que se lee de ella, venga de donde venga. */
export interface ResolvableRule extends Partial<BonusAward> {
    _id?: Types.ObjectId | null;
    active?: boolean;
    scope?: Partial<BonusScope> | null;
    overrides?: BonusOverride[] | null;
}

/** La alerta, con su regla POPULADA. */
export interface MenuLike {
    bonusRule?: ResolvableRule | Types.ObjectId | string | null;
}


// ── Lo que devuelve ───────────────────────────────────────────────────

/**
 * Bonificó, y con cuánto.
 *
 * `applies: true` es el DISCRIMINANTE de la unión: para leer `bonusPerAlert` hay
 * que haber comprobado antes que la novedad bonifica. Sin eso, un
 * `sello.bonusPerAlert` sobre una novedad que no bonificó daría `undefined`, y
 * `undefined` sumado en el corte da NaN — un total en blanco en vez de un error.
 */
export interface BonusApplied {
    applies: true;

    /** De cuál regla salió. Es rastro, no fuente: los números de abajo mandan. */
    rule: Types.ObjectId | null;
    appliedFrom: AppliedFrom;

    /** EL NÚMERO OPERATIVO: cuántos bonos vale esta alerta sola. */
    bonusPerAlert: number;

    /** Los dos números de la regla, para poder leer "4x1" en vez de "0,25". */
    alertsRequired: number;
    bonusAwarded: number;

    workShift: WorkShift;
    shiftSource: ShiftSource;

    /** Cuánto valía UN bono en ese momento. `null` si no había valor cargado. */
    pointValue: number | null;

    frozenAt: Date;
}

/** No bonificó, y por qué. Se guarda igual: es una decisión, no una ausencia. */
export interface BonusSkipped {
    applies: false;
    reason: SkipReason;
    frozenAt: Date;
}

export type BonusSeal = BonusApplied | BonusSkipped;


export interface ResolveBonusParams {
    user?: ShiftHolder | null;
    attendance?: AttendanceLike | null;
    menu?: MenuLike | null;
    establishment?: EstablishmentLike | null;
    settings?: { pointValue?: number | null } | null;

    /**
     * CUÁNDO OCURRIÓ el hecho. Con esta fecha se busca el turno en el horario,
     * así que tiene que ser la del reporte y no la de ahora: una novedad del
     * sábado validada el lunes tiene que resolver el sábado.
     */
    at?: Date;

    /**
     * CUÁNDO SE DECIDIÓ. Es otra fecha, y por eso es otro parámetro.
     *
     * Estuvieron juntas y era un error esperando: el llamador natural pasa la
     * fecha del reporte en `at`, y el sello quedaba fechado el día del hecho en
     * vez del día en que alguien lo aprobó. Se ve plausible y no salta.
     */
    frozenAt?: Date;
}


// ══════════════════════════════════════════════════════════════════════

const comoTexto = (valor: unknown): string => {
    if (!valor) return '';
    if (typeof valor === 'string') return valor;
    if (typeof valor === 'object' && '_id' in (valor as Record<string, unknown>)) {
        return String((valor as { _id?: unknown })._id);
    }
    return String(valor);
};

const esNocturno = (valor?: string | null): boolean =>
    String(valor || '').trim().toLowerCase().startsWith('noc');

/** Igual que en dayRoster: el día de la semana con el que se indexa el horario. */
const diaDeLaSemana = (fecha: Date): number => new Date(fecha).getDay();


/**
 * El turno en el que trabajaba el operador, con la MISMA cascada que usa
 * dayRoster.service.js para la jornada efectiva:
 *
 *     override del día  >  su horario de ese día  >  su jornada base
 *
 * Se devuelve también de qué capa salió: sin eso, explicar por qué una novedad
 * pagó nocturno obliga a reconstruir el horario de esa fecha, que quizá ya
 * cambió.
 */
export const resolveWorkShift = (
    user?: ShiftHolder | null,
    attendance?: AttendanceLike | null,
    fecha: Date = new Date(),
): { workShift: WorkShift; shiftSource: ShiftSource } => {

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

    // Sin horario cargado se asume diurno, pero queda dicho de dónde salió: son
    // las novedades que conviene revisar antes de pagar.
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
export const isInScope = (rule?: ResolvableRule | null, establishment?: EstablishmentLike | null): boolean => {
    const alcance = rule?.scope;
    if (!alcance || !alcance.mode || alcance.mode === 'all') return true;

    const idLocal = comoTexto(establishment?._id ?? establishment);
    const idMarca = comoTexto(establishment?.franchiseReference?.franchise);

    const estaListado =
        (alcance.locals || []).some(l => comoTexto(l) === idLocal && Boolean(idLocal))
        || (alcance.franchises || []).some(f => comoTexto(f) === idMarca && Boolean(idMarca));

    return alcance.mode === 'only' ? estaListado : !estaListado;
};


/**
 * La excepción que corresponde a este establecimiento, si la hay.
 *
 * Gana la más específica: si hay una para el local, la de su franquicia no se
 * mira. Sin esa prioridad, una alerta con excepción de marca Y de local dependería
 * del orden en que se cargaron, que es lo peor posible.
 */
const findOverride = (
    rule?: ResolvableRule | null,
    establishment?: EstablishmentLike | null,
): BonusOverride | null => {

    const idLocal = comoTexto(establishment?._id ?? establishment);
    const idMarca = comoTexto(establishment?.franchiseReference?.franchise);
    const excepciones = rule?.overrides || [];

    return excepciones.find(e => comoTexto(e.local) === idLocal && Boolean(idLocal))
        ?? excepciones.find(e => comoTexto(e.franchise) === idMarca && Boolean(idMarca))
        ?? null;
};


/** Un número usable, o el de reserva. Evita que un null se propague al pago. */
const numero = (valor: unknown, porDefecto: number): number => {
    const n = Number(valor);
    return Number.isFinite(n) ? n : porDefecto;
};


/**
 * El sello de una novedad que no bonifica. Se guarda igual: "no bonifica" es una
 * decisión, y verse igual que "nunca se selló" borra esa diferencia.
 */
const noBonifica = (motivo: SkipReason, sellado: Date): BonusSkipped => ({
    applies: false,
    reason: motivo,
    frozenAt: sellado,
});


/**
 * Resuelve la bonificación de una novedad.
 *
 * @param params.menu  la alerta, con `bonusRule` POPULADA. Sin popular llega un
 *                     ObjectId y el resultado es 'sin-regla' aunque todo esté
 *                     bien configurado — y como el sello se congela, ese cero
 *                     queda grabado.
 */
export const resolveBonusForNovelty = ({
    user,
    attendance = null,
    menu,
    establishment,
    settings = {},
    at = new Date(),
    frozenAt = new Date(),
}: ResolveBonusParams): BonusSeal => {

    const rule = menu?.bonusRule;

    // Sin regla la alerta no bonifica. Ojo: eso NO es lo mismo que "nadie la
    // revisó todavía" — esa diferencia la lleva Menu.bonusReviewed.
    if (!rule || typeof rule !== 'object' || !('scope' in rule || 'alertsRequired' in rule || 'active' in rule)) {
        return noBonifica('sin-regla', frozenAt);
    }

    const regla = rule as ResolvableRule;

    if (regla.active === false) return noBonifica('regla-inactiva', frozenAt);
    if (!isInScope(regla, establishment)) return noBonifica('fuera-de-alcance', frozenAt);

    // El turno decide CUÁNTOS bonos otorga, y es el del operador.
    const { workShift, shiftSource } = resolveWorkShift(user, attendance, at);

    // La excepción del establecimiento gana sobre la regla general, y solo en los
    // campos que declara: una excepción que solo cambia el nocturno hereda el
    // resto.
    const override = findOverride(regla, establishment);

    const alertsRequired = Math.max(1, numero(override?.alertsRequired, numero(regla.alertsRequired, 1)));
    const bonusAwarded = numero(
        override?.bonusAwarded?.[workShift],
        numero(regla.bonusAwarded?.[workShift], 1),
    );

    return {
        applies: true,

        rule: regla._id ?? null,
        appliedFrom: override ? APPLIED_FROM.OVERRIDE : APPLIED_FROM.RULE,

        // El número operativo: lo que vale ESTA alerta suelta. El corte suma este
        // campo entre todas las novedades aprobadas del período.
        bonusPerAlert: bonusAwarded / alertsRequired,

        alertsRequired,
        bonusAwarded,

        workShift,
        shiftSource,

        pointValue: settings?.pointValue ?? null,

        frozenAt,
    };
};
