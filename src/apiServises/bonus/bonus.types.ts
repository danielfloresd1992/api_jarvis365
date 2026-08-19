import type { Types } from 'mongoose';
import type { BonusAward, BonusScope, BonusOverride } from './bonusRule.model.js';

// ══════════════════════════════════════════════════════════════════════
// LOS TIPOS DEL SELLADO
// ══════════════════════════════════════════════════════════════════════
// Lo que ENTRA a resolver una bonificación y lo que SALE como sello.
//
// Los tipos de entrada son estructurales —describen lo que se lee, no
// documentos de Mongoose— para que la resolución se pueda llamar con objetos
// planos en una prueba y con `.lean()` en producción.


// ── Lo que se necesita para resolver ─────────────────────────────────

/** El operador que reportó, con su horario. */
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

/** El establecimiento donde ocurrió, con su marca. */
export interface EstablishmentLike {
    _id?: Types.ObjectId | string;
    franchiseReference?: {
        franchise?: Types.ObjectId | string | { _id?: Types.ObjectId | string } | null;
    } | null;
}

/** Una regla, con lo que se lee de ella. */
export interface ResolvableRule extends Partial<BonusAward> {
    _id?: Types.ObjectId | null;
    active?: boolean;
    overrides?: BonusOverride[] | null;
}

/** Una asignación de la alerta: qué regla (populada) y dónde aplica. */
export interface AssignmentLike {
    rule?: ResolvableRule | Types.ObjectId | string | null;
    scope?: Partial<BonusScope> | null;
}

/** La alerta, con su interruptor y sus asignaciones. */
export interface MenuLike {
    /** `false` corta antes de mirar reglas. `null` = nunca se decidió. */
    bonifies?: boolean | null;
    bonusRules?: AssignmentLike[] | null;
}

/** Todo lo que recibe la resolución. */
export interface ResolveBonusParams {
    user?: ShiftHolder | null;
    attendance?: AttendanceLike | null;
    menu?: MenuLike | null;
    establishment?: EstablishmentLike | null;
    settings?: { pointValue?: number | null } | null;
    /** Cuándo OCURRIÓ: con esta fecha se busca el turno en el horario. */
    at?: Date;
    /** Cuándo se DECIDIÓ: es la fecha que queda en el sello. */
    frozenAt?: Date;
}


// ── Lo que sale ───────────────────────────────────────────────────────

export type WorkShift = 'day' | 'night';

/** De dónde salió el valor: la regla general o una excepción del local. */
export type AppliedFrom = 'rule' | 'override';

/**
 * De qué capa del horario salió el turno.
 * `'default'` = se asumió diurno sin dato; conviene revisar antes de pagar.
 */
export type ShiftSource = 'override' | 'regla' | 'shiftType' | 'default';

/**
 * Por qué una novedad aprobada NO bonificó.
 *
 *   no-bonifica         la alerta tiene el interruptor en false: es una
 *                       decisión tomada, no falta de configuración
 *   sin-regla           bonifica, pero todavía no tiene asignaciones
 *   fuera-de-alcance    tiene, pero ninguna aplica en ese establecimiento
 *   regla-inactiva      la que aplica está desactivada
 *   regla-sin-popular   llegó un ObjectId en vez de la regla — error de quien
 *                       llamó, no una decisión; se distingue para no confundirlos
 */
export type SkipReason =
    | 'no-bonifica' | 'sin-regla' | 'fuera-de-alcance' | 'regla-inactiva' | 'regla-sin-popular';

/**
 * Bonificó. `applies: true` es el discriminante: para leer `bonusPerAlert` hay
 * que haber comprobado antes que bonifica, o el corte suma `undefined` y da NaN.
 */
export interface BonusApplied {
    applies: true;
    /** De cuál regla salió. Rastro, no fuente: los números de abajo mandan. */
    rule: Types.ObjectId | null;
    appliedFrom: AppliedFrom;
    /** EL NÚMERO OPERATIVO: cuántos bonos vale esta alerta sola. */
    bonusPerAlert: number;
    /** Los dos números de la regla, para leer "4x1" en vez de "0,25". */
    alertsRequired: number;
    bonusAwarded: number;
    workShift: WorkShift;
    shiftSource: ShiftSource;
    /** Cuánto valía UN bono en ese momento. */
    pointValue: number | null;
    frozenAt: Date;
}

/** No bonificó, y por qué. Se guarda igual: es una decisión, no una ausencia. */
export interface BonusSkipped {
    applies: false;
    reason: SkipReason;
    frozenAt: Date;
}

/** Lo que se guarda en `Noveltie.bonus`. */
export type BonusSeal = BonusApplied | BonusSkipped;
