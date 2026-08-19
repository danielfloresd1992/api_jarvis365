import type {
    ResolveBonusParams, BonusSeal, BonusSkipped, SkipReason,
    ShiftHolder, AttendanceLike, EstablishmentLike, AssignmentLike, ResolvableRule,
    WorkShift, ShiftSource,
} from './bonus.types.js';
import type { BonusScope, BonusOverride } from './bonusRule.model.js';

// ══════════════════════════════════════════════════════════════════════
// CUÁNTO BONIFICA UNA NOVEDAD
// ══════════════════════════════════════════════════════════════════════
// Función PURA: no toca la base ni el reloj. Todo entra por parámetro y sale
// el sello que se congela en `Noveltie.bonus`. Por eso se prueba sin Mongo.
//
// Devuelve cuánto vale ESTA alerta suelta, no un total. Una regla de "4 por
// bono" deja 0,25 en cada una; el corte suma. Seis alertas son 1,5 — las que
// sobran del grupo no se pierden.
//
// Los tipos viven en bonus.types.ts.

export const WORK_SHIFT = { DAY: 'day', NIGHT: 'night' } as const;
export const APPLIED_FROM = { RULE: 'rule', OVERRIDE: 'override' } as const;


// ── Ayudas ────────────────────────────────────────────────────────────

/** Un id como texto, venga como ObjectId, string o documento con `_id`. */
const id = (valor: unknown): string => {
    if (!valor) return '';
    if (typeof valor === 'string') return valor;
    if (typeof valor === 'object' && '_id' in (valor as object)) return String((valor as { _id: unknown })._id);
    return String(valor);
};

const esNocturno = (valor?: string | null) => String(valor || '').trim().toLowerCase().startsWith('noc');

/** Un número usable, o el de reserva. Evita que un null llegue al pago. */
const numero = (valor: unknown, porDefecto: number) => {
    const n = Number(valor);
    return Number.isFinite(n) ? n : porDefecto;
};

/** ¿La regla llegó populada? Un ObjectId suelto no tiene estos campos. */
const esRegla = (r: unknown): r is ResolvableRule =>
    typeof r === 'object' && r !== null && ('alertsRequired' in r || 'bonusAwarded' in r || 'active' in r);

const noBonifica = (reason: SkipReason, frozenAt: Date): BonusSkipped => ({ applies: false, reason, frozenAt });


// ── El turno del operador ─────────────────────────────────────────────

/**
 * Misma cascada que dayRoster.service.js:
 *     override del día  >  horario de ese día  >  jornada base  >  diurno
 * Devuelve también de qué capa salió, para poder explicar el pago después.
 */
export const resolveWorkShift = (
    user?: ShiftHolder | null,
    attendance?: AttendanceLike | null,
    fecha: Date = new Date(),
): { workShift: WorkShift; shiftSource: ShiftSource } => {

    const turno = (v?: string | null): WorkShift => (esNocturno(v) ? WORK_SHIFT.NIGHT : WORK_SHIFT.DAY);

    const override = attendance?.scheduleOverride?.shift;
    if (override) return { workShift: turno(override), shiftSource: 'override' };

    // Con .lean() el Map de Mongoose llega como objeto plano; se toleran los dos.
    const porDia = user?.workSchedule?.scheduleByDay;
    const clave = String(new Date(fecha).getDay());
    const delDia = porDia instanceof Map ? porDia.get(clave) : porDia?.[clave];
    if (delDia?.shift) return { workShift: turno(delDia.shift), shiftSource: 'regla' };

    const base = user?.workSchedule?.shiftType;
    if (base) return { workShift: turno(base), shiftSource: 'shiftType' };

    return { workShift: WORK_SHIFT.DAY, shiftSource: 'default' };
};


// ── Dónde aplica ──────────────────────────────────────────────────────

/** ¿Este alcance cubre este establecimiento? */
export const isInScope = (alcance?: Partial<BonusScope> | null, establishment?: EstablishmentLike | null): boolean => {
    if (!alcance?.mode || alcance.mode === 'all') return true;

    const local = id(establishment?._id ?? establishment);
    const marca = id(establishment?.franchiseReference?.franchise);

    const listado = (Boolean(local) && (alcance.locals || []).some(l => id(l) === local))
        || (Boolean(marca) && (alcance.franchises || []).some(f => id(f) === marca));

    return alcance.mode === 'only' ? listado : !listado;
};

/**
 * Cuán específico es un alcance para este establecimiento:
 *   3 lo nombra por local · 2 por marca · 1 general · 0 no aplica
 * Un 'except' que no lo excluye cuenta como general.
 */
const especificidad = (alcance: Partial<BonusScope> | null | undefined, establishment?: EstablishmentLike | null): number => {
    if (!isInScope(alcance, establishment)) return 0;
    if (alcance?.mode !== 'only') return 1;

    const local = id(establishment?._id ?? establishment);
    const marca = id(establishment?.franchiseReference?.franchise);
    if (local && (alcance.locals || []).some(l => id(l) === local)) return 3;
    if (marca && (alcance.franchises || []).some(f => id(f) === marca)) return 2;
    return 1;
};

/**
 * De las asignaciones de la alerta, la que aplica acá. Gana la MÁS ESPECÍFICA:
 * sin esa prioridad el resultado dependería del orden de carga.
 */
export const pickAssignment = (
    asignaciones?: AssignmentLike[] | null,
    establishment?: EstablishmentLike | null,
): AssignmentLike | null => {
    let mejor: AssignmentLike | null = null;
    let peso = 0;
    for (const a of asignaciones || []) {
        const p = especificidad(a?.scope, establishment);
        if (p > peso) { mejor = a; peso = p; }
    }
    return mejor;
};

/** La excepción del local, si la hay; si no, la de su marca. La más específica gana. */
const findOverride = (rule: ResolvableRule, establishment?: EstablishmentLike | null): BonusOverride | null => {
    const local = id(establishment?._id ?? establishment);
    const marca = id(establishment?.franchiseReference?.franchise);
    const lista = rule.overrides || [];
    return (local && lista.find(o => id(o.local) === local))
        || (marca && lista.find(o => id(o.franchise) === marca))
        || null;
};


// ── La resolución ─────────────────────────────────────────────────────

/**
 * Resuelve la bonificación de una novedad.
 *
 * Recibe (ver ResolveBonusParams):
 *   user           el operador, con workSchedule
 *   attendance     su asistencia de ese día — opcional
 *   menu           la alerta, con `bonusRules[].rule` POPULADA
 *   establishment  dónde ocurrió, con franchiseReference
 *   settings       { pointValue } — cuánto vale un bono hoy
 *   at             cuándo OCURRIÓ (para el turno)
 *   frozenAt       cuándo se DECIDIÓ (queda en el sello)
 *
 * Devuelve el sello: `{ applies: true, bonusPerAlert, … }` o
 * `{ applies: false, reason }`.
 */
export const resolveBonusForNovelty = ({
    user, attendance = null, menu, establishment, settings = {},
    at = new Date(), frozenAt = new Date(),
}: ResolveBonusParams): BonusSeal => {

    // 1. El interruptor de la alerta. Solo un `false` EXPLÍCITO corta: `null`
    //    es lo que traen las alertas anteriores a este campo, y ésas se siguen
    //    resolviendo por sus asignaciones.
    if (menu?.bonifies === false) return noBonifica('no-bonifica', frozenAt);

    // 2. Qué asignación aplica en este establecimiento.
    const asignaciones = menu?.bonusRules || [];
    if (!asignaciones.length) return noBonifica('sin-regla', frozenAt);

    const asignacion = pickAssignment(asignaciones, establishment);
    if (!asignacion) return noBonifica('fuera-de-alcance', frozenAt);

    // 3. Su regla, y que esté viva.
    const regla = asignacion.rule;
    if (!esRegla(regla)) return noBonifica('regla-sin-popular', frozenAt);
    if (regla.active === false) return noBonifica('regla-inactiva', frozenAt);

    // 4. El turno decide CUÁNTOS bonos, y es el del operador.
    const { workShift, shiftSource } = resolveWorkShift(user, attendance, at);

    // 5. La excepción del local, si la hay, pisa la regla — solo en lo que declara.
    const override = findOverride(regla, establishment);
    const alertsRequired = Math.max(1, numero(override?.alertsRequired, numero(regla.alertsRequired, 1)));
    const bonusAwarded = numero(override?.bonusAwarded?.[workShift], numero(regla.bonusAwarded?.[workShift], 1));

    return {
        applies: true,
        rule: regla._id ?? null,
        appliedFrom: override ? APPLIED_FROM.OVERRIDE : APPLIED_FROM.RULE,
        bonusPerAlert: bonusAwarded / alertsRequired,
        alertsRequired,
        bonusAwarded,
        workShift,
        shiftSource,
        pointValue: settings?.pointValue ?? null,
        frozenAt,
    };
};
