import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';

import {
    getZonedDateParts, toUtcMidnightFromZonedParts, utcMidnightOf, addUtcDays, minutesOfDay, hhmmToMinutes,
} from '../src/apiServises/attendanceUser/services/attendanceTime.lib.js';
import {
    dayRuleOf, activeOverrideOf, resolveShift, weeklyRuleCount, defaultTimesOf, DAY_OFF_WORK_TYPES,
} from '../src/apiServises/attendanceUser/services/workday.lib.js';
import { LATE_GRACE_MINUTES, computeDiscountUnits, appliesLateRule, isArrivalUntracked } from '../src/apiServises/attendanceUser/services/lateness.lib.js';
import {
    overtimeOfDay, accumulateOvertime, overtimeOnCheckout, resolveMinutesToApprove,
} from '../src/apiServises/attendanceUser/services/overtime.lib.js';
import { summarizeAttendance } from '../src/apiServises/attendanceUser/report/userReport.service.js';

// Gancho de resolución, el mismo de nomina.test.ts: el corte diario importa
// tabulador.model.js, cuya fuente es .ts. Va antes del import dinámico.
registerHooks({
    resolve(especificador, contexto, siguiente) {
        if (especificador.startsWith('.') && especificador.endsWith('.js') && contexto.parentURL) {
            const enTypeScript = `${especificador.slice(0, -3)}.ts`;
            if (existsSync(new URL(enTypeScript, contexto.parentURL))) return siguiente(enTypeScript, contexto);
        }
        return siguiente(especificador, contexto);
    },
});

const { buildDailyAttendanceReport, registerAbsencesAsFaults } = await import('../src/apiServises/attendanceUser/report/attendanceReport.service.js');
const { default: UserModel } = await import('../src/apiServises/user/user.model.js');
const { default: AttendanceModel } = await import('../src/apiServises/attendanceUser/attendanceUser.model.js');

// Fecha con hora de Caracas (UTC-4).
const caracas = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-04:00`);


test('fechas en hora de Caracas', async (t) => {
    await t.test('a las 22:00 de Caracas ya es mañana en UTC, pero el día sigue siendo hoy', () => {
        const partes = getZonedDateParts(caracas('2026-09-23', '22:00'));
        assert.equal(partes.day, 23);
        assert.equal(minutesOfDay(partes), 22 * 60);
        assert.equal(toUtcMidnightFromZonedParts(partes).toISOString(), '2026-09-23T00:00:00.000Z');
    });

    await t.test('utcMidnightOf recorta sin tocar la original y conserva las fechas inválidas', () => {
        const original = new Date('2026-09-23T15:30:00Z');
        assert.equal(utcMidnightOf(original).toISOString(), '2026-09-23T00:00:00.000Z');
        assert.equal(original.toISOString(), '2026-09-23T15:30:00.000Z');
        assert.ok(Number.isNaN(utcMidnightOf('nada').getTime()));
    });

    await t.test('addUtcDays cruza meses', () => {
        assert.equal(addUtcDays(new Date('2026-10-01T00:00:00Z'), -1).toISOString(), '2026-09-30T00:00:00.000Z');
    });

    await t.test('hhmmToMinutes', () => {
        assert.equal(hhmmToMinutes('09:05'), 545);
        assert.equal(hhmmToMinutes('ab:cd'), null);
        assert.equal(hhmmToMinutes('9'), null, 'sin minutos no es una hora');
        assert.equal(hhmmToMinutes('9:'), 540, 'minutos vacíos cuentan como 0, igual que antes');
    });
});


test('jornada efectiva', async (t) => {
    const regla = { workType: 'laboral', shift: 'Nocturno' };

    await t.test('dayRuleOf lee Map y objeto plano', () => {
        assert.deepEqual(dayRuleOf(new Map([['3', regla]]), 3), regla);
        assert.deepEqual(dayRuleOf({ 3: regla }, 3), regla);
        assert.equal(dayRuleOf(undefined, 3), null);
        assert.equal(dayRuleOf({}, 3), null);
    });

    await t.test('un override sin workType no cuenta como override activo', () => {
        assert.equal(activeOverrideOf({ scheduleOverride: { shift: 'Nocturno' } }), null);
        assert.deepEqual(activeOverrideOf({ scheduleOverride: { workType: 'extra' } }), { workType: 'extra' });
        assert.equal(activeOverrideOf(null), null);
    });

    await t.test('resolveShift: override > regla > perfil > Diurno', () => {
        assert.equal(resolveShift({ shift: 'Diurno' }, regla, { shiftType: 'Nocturno' }), 'Diurno');
        assert.equal(resolveShift(null, regla, { shiftType: 'Diurno' }), 'Nocturno');
        assert.equal(resolveShift(null, null, { shiftType: 'Nocturno' }), 'Nocturno');
        assert.equal(resolveShift(null, null, null), 'Diurno');
    });

    await t.test('weeklyRuleCount', () => {
        assert.equal(weeklyRuleCount(new Map([['1', regla], ['2', regla]])), 2);
        assert.equal(weeklyRuleCount({ 1: regla }), 1);
        assert.equal(weeklyRuleCount(null), 0);
    });

    await t.test('horas estándar del turno, con el diurno como respaldo', () => {
        assert.deepEqual(defaultTimesOf('Nocturno'), { startTime: '18:00', endTime: '07:00' });
        assert.deepEqual(defaultTimesOf('Diurno'), { startTime: '08:00', endTime: '18:00' });
        assert.deepEqual(defaultTimesOf('Mixto'), { startTime: '08:00', endTime: '18:00' });
    });

    await t.test('días libres', () => {
        assert.deepEqual([...DAY_OFF_WORK_TYPES].sort(), ['descanso', 'falta', 'permiso', 'vacaciones']);
    });
});


test('regla del retardo', async (t) => {
    await t.test('la tolerancia es de 8 minutos', () => {
        assert.equal(LATE_GRACE_MINUTES, 8);
    });

    await t.test('unidades de descuento por minutos de retardo', () => {
        const casos: [number | null, number][] = [
            [null, 0], [-5, 0], [0, 0], [8, 0], [9, 1], [20, 1], [21, 2], [40, 2], [41, 3], [60, 3], [61, 4],
        ];
        for (const [minutos, unidades] of casos) {
            assert.equal(computeDiscountUnits(minutos), unidades, `${minutos} min`);
        }
    });

    await t.test('sin control ni seguimiento no se evalúa el retardo, ni con horario especial', () => {
        const exento = { lateArrivalControl: false, lateArrivalTracking: false };
        assert.equal(appliesLateRule({ workSchedule: exento, hasOverride: false, isNewToday: false }), false);
        assert.equal(appliesLateRule({ workSchedule: exento, hasOverride: true, isNewToday: false }), false);
    });

    await t.test('con una sola bandera apagada se mantiene la regla de siempre', () => {
        const sinControl = { lateArrivalControl: false, lateArrivalTracking: true };
        assert.equal(appliesLateRule({ workSchedule: sinControl, hasOverride: false, isNewToday: false }), false);
        assert.equal(appliesLateRule({ workSchedule: sinControl, hasOverride: true, isNewToday: false }), true, 'el horario especial sigue forzando el control');

        const sinSeguimiento = { lateArrivalControl: true, lateArrivalTracking: false };
        assert.equal(appliesLateRule({ workSchedule: sinSeguimiento, hasOverride: false, isNewToday: false }), true);
    });

    await t.test('el primer día de un empleado nuevo nunca cuenta', () => {
        const controlado = { lateArrivalControl: true, lateArrivalTracking: true };
        assert.equal(appliesLateRule({ workSchedule: controlado, hasOverride: true, isNewToday: true }), false);
    });

    await t.test('sin workSchedule no se evalúa, salvo con horario especial', () => {
        assert.equal(appliesLateRule({ workSchedule: undefined, hasOverride: false, isNewToday: false }), false);
        assert.equal(appliesLateRule({ workSchedule: undefined, hasOverride: true, isNewToday: false }), true);
    });

    await t.test('la llegada queda sin seguimiento solo con las dos banderas en false', () => {
        assert.equal(isArrivalUntracked({ lateArrivalControl: false, lateArrivalTracking: false }), true);
        assert.equal(isArrivalUntracked({ lateArrivalControl: false, lateArrivalTracking: true }), false);
        assert.equal(isArrivalUntracked({ lateArrivalControl: true, lateArrivalTracking: false }), false);
        assert.equal(isArrivalUntracked(undefined), false, 'sin banderas valen los defaults del modelo (true)');
    });
});


test('falta automática del corte', async (t) => {
    // Tres diurnos (08:00) que no marcaron al corte de las 15:00. Sin Mongo: se
    // sustituyen las estáticas de los modelos ya importados, como en exchangeRate.test.ts.
    const empleado = (nombre: string, banderas: object) => ({
        _id: nombre,
        name: nombre,
        surName: '',
        dni: nombre,
        jobInformation: { department: 'Operaciones' },
        createdOn: new Date('2026-01-01T12:00:00Z'),
        workSchedule: { shiftType: 'Diurno', ...banderas },
    });
    const usuarios = [
        empleado('seguido', { lateArrivalControl: true, lateArrivalTracking: true }),
        empleado('exento', { lateArrivalControl: false, lateArrivalTracking: false }),
        empleado('sinControl', { lateArrivalControl: false, lateArrivalTracking: true }),
    ];
    t.mock.method(UserModel, 'find', () => ({ populate: async () => usuarios }));
    t.mock.method(AttendanceModel, 'find', async () => []);

    const report = await buildDailyAttendanceReport(caracas('2026-09-23', '15:00'));
    const candidatos = Object.fromEntries(report.absents.map((a: any) => [a.name, a.autoFaultCandidate]));

    await t.test('solo queda fuera quien tiene las dos banderas en false', () => {
        assert.deepEqual(candidatos, { exento: false, seguido: true, sinControl: true });
    });

    await t.test('el exento sigue saliendo como ausente en el informe', () => {
        assert.equal(report.totals.absent, 3);
    });

    await t.test('al exento no se le escribe la falta', async () => {
        const escritura = t.mock.method(AttendanceModel, 'findOneAndUpdate', async () => null);
        const soloExento = { ...report, absents: report.absents.filter((a: any) => a.name === 'exento') };

        const faults = await registerAbsencesAsFaults(soloExento);

        assert.equal(faults.attempted, 0);
        assert.equal(faults.registered, 0);
        assert.equal(escritura.mock.callCount(), 0);
    });
});


test('horas extras', async (t) => {
    // Diurno: base 9 h. De 08:00 a 20:00 son 12 h → 180 min de excedente.
    const dia = (overtime: object = {}) => ({
        checkIn: new Date('2026-09-23T12:00:00Z'),
        checkOut: new Date('2026-09-24T00:00:00Z'),
        overtime,
    });

    await t.test('overtimeOfDay con aprobación parcial', () => {
        const r = overtimeOfDay(dia({ status: 'approved', approvedMinutes: 60 }), 'Diurno');
        assert.equal(r.minutes, 180);
        assert.equal(r.approvedMinutes, 60);
        assert.equal(r.unapprovedMinutes, 120);
        assert.equal(r.isPartial, true);
    });

    await t.test('accumulateOvertime: aprobadas + pendientes + rechazadas = generadas', () => {
        const totals = accumulateOvertime([
            { record: dia({ status: 'approved', approvedMinutes: 60 }), shift: 'Diurno' },
            { record: dia({ status: 'pending' }), shift: 'Diurno' },
            { record: dia({ status: 'rejected' }), shift: 'Diurno' },
        ]);
        assert.equal(totals.totalMinutes, 540);
        assert.equal(totals.approvedMinutes + totals.pendingMinutes + totals.rejectedMinutes, totals.totalMinutes);
    });

    await t.test('overtimeOnCheckout según autoApproveOvertime', () => {
        const fecha = new Date('2026-01-01T12:00:00Z');
        assert.deepEqual(
            overtimeOnCheckout({ workSchedule: { autoApproveOvertime: true } }, fecha),
            { 'overtime.status': 'approved', 'overtime.auto': true, 'overtime.decidedAt': fecha, 'overtime.approvedMinutes': null },
        );
        assert.ok(overtimeOnCheckout({ workSchedule: { autoApproveOvertime: true } })['overtime.decidedAt'] instanceof Date, 'sin fecha usa ahora');
        assert.deepEqual(overtimeOnCheckout({}), { 'overtime.status': 'pending', 'overtime.auto': false, 'overtime.approvedMinutes': null });
    });

    await t.test('resolveMinutesToApprove', () => {
        assert.deepEqual(resolveMinutesToApprove('approved', undefined, 180), { minutesToApprove: null });
        assert.deepEqual(resolveMinutesToApprove('rejected', 60, 180), { minutesToApprove: null });
        assert.deepEqual(resolveMinutesToApprove('approved', '180', 180), { minutesToApprove: null }, 'aprobar el total se guarda como null');
        assert.deepEqual(resolveMinutesToApprove('approved', 60, 180), { minutesToApprove: 60 });
        assert.match(resolveMinutesToApprove('approved', 0, 180).error, /entero mayor que cero/);
        assert.match(resolveMinutesToApprove('approved', 1.5, 180).error, /entero mayor que cero/);
        assert.match(resolveMinutesToApprove('approved', 200, 180).error, /solo generó 180/);
    });
});


test('resumen del reporte de un empleado', () => {
    const lunesAViernes = new Map(['1', '2', '3', '4', '5'].map(d => [d, { workType: 'laboral', startTime: '09:00', endTime: '18:00' }]));
    const user = { workSchedule: { scheduleByDay: lunesAViernes } };
    const records = [
        // Lunes: llegó 20 min tarde y se quedó hasta las 19:30.
        { date: new Date('2026-09-21T00:00:00Z'), checkIn: caracas('2026-09-21', '09:20'), checkOut: caracas('2026-09-21', '19:30'), isLate: true, isJustified: true },
    ];

    const r = summarizeAttendance(user, records, new Date('2026-09-20T00:00:00Z'), new Date('2026-09-23T00:00:00Z'), caracas('2026-09-22', '12:00'));

    assert.equal(r.totalWorkingDays, 4, 'el domingo no tiene regla y cuenta como laboral');
    assert.equal(r.presentDays, 1);
    assert.equal(r.absentDays, 2, 'el miércoles es futuro y no cuenta como ausencia');
    assert.equal(r.lateMinutes, 20);
    assert.equal(r.justifiedLateDays, 1);
    assert.equal(r.extraMinutes, 70);
    assert.equal(r.expectedMinutes, 3 * 9 * 60);
    assert.equal(r.attendanceRate, 25);
});
