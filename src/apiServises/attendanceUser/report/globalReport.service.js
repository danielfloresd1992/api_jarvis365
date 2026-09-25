import UserModel from '../../user/user.model.js';
import { accumulateOvertime } from '../services/overtime.lib.js';
import { dayRuleOf } from '../services/workday.lib.js';

// Reporte consolidado de todos los empleados activos en un rango de fechas.
// Se resuelve en UNA agregación que parte de "users" (así aparecen también los
// que no tienen registros) y cuenta dentro de Mongo; solo las horas extras se
// calculan en Node, con la misma función que el resto de la app.


// Cuenta los registros del período que cumplen la condición.
const countRecords = (cond) => ({
    $size: { $filter: { input: '$attendanceRecords', as: 'r', cond } }
});

// Condición: el registro tiene ese tipo de jornada (override) o ese status.
const workTypeOrStatus = (value) => ({
    $or: [
        { $eq: ['$$r.scheduleOverride.workType', value] },
        { $eq: ['$$r.status', value] }
    ]
});


// Arma la agregación: empleados activos + sus registros del rango + los conteos.
// $dayOfWeek de Mongo: 1 = domingo … 7 = sábado.
const buildPipeline = (fromDate, toDate) => [
    // Activos y dentro del horario ($ne: true también deja pasar el campo inexistente).
    { $match: { inabilited: false, 'workSchedule.outForkSchedule': { $ne: true } } },

    // Registros del rango de cada empleado (usa el índice { userId, date }).
    {
        $lookup: {
            from: 'attendances',
            let: { uid: '$_id' },
            pipeline: [
                {
                    $match: {
                        $expr: {
                            $and: [
                                { $eq: ['$userId', '$$uid'] },
                                { $gte: ['$date', fromDate] },
                                { $lte: ['$date', toDate] }
                            ]
                        }
                    }
                },
                // Solo los campos que usan los conteos y las horas extras.
                { $project: { date: 1, isLate: 1, isExtraDay: 1, checkIn: 1, checkOut: 1, status: 1, 'scheduleOverride.workType': 1, 'scheduleOverride.shift': 1, 'overtime.status': 1, 'overtime.approvedMinutes': 1, discountUnits: 1, onDuty: 1, auxiliary: 1, _id: 0 } }
            ],
            as: 'attendanceRecords'
        }
    },

    {
        $addFields: {
            // Retardos de lunes a viernes y de fin de semana.
            lateWeekday: countRecords({
                $and: [
                    { $eq: ['$$r.isLate', true] },
                    { $in: [{ $dayOfWeek: '$$r.date' }, [2, 3, 4, 5, 6]] }
                ]
            }),
            lateWeekend: countRecords({
                $and: [
                    { $eq: ['$$r.isLate', true] },
                    { $in: [{ $dayOfWeek: '$$r.date' }, [1, 7]] }
                ]
            }),
            extraDays: countRecords({ $eq: ['$$r.isExtraDay', true] }),
            totalPresent: countRecords({ $ne: ['$$r.checkIn', null] }),
            // Falta cargada por el admin o ausencia del registro (cada día cuenta una vez).
            faltaCount: countRecords({
                $or: [
                    { $eq: ['$$r.scheduleOverride.workType', 'falta'] },
                    { $eq: ['$$r.status', 'ausente'] }
                ]
            }),
            discountUnits: { $sum: '$attendanceRecords.discountUnits' },
            onDutyDays: countRecords({ $eq: ['$$r.onDuty', true] }),
            auxiliaryDays: countRecords({ $eq: ['$$r.auxiliary', true] }),
            permisoCount: countRecords(workTypeOrStatus('permiso')),
            vacacionesCount: countRecords(workTypeOrStatus('vacaciones')),
            // Lo mínimo para calcular las horas extras en Node (se borra después).
            overtimeSource: {
                $map: {
                    input: '$attendanceRecords',
                    as: 'r',
                    in: {
                        date: '$$r.date',
                        checkIn: '$$r.checkIn',
                        checkOut: '$$r.checkOut',
                        shift: '$$r.scheduleOverride.shift',
                        overtime: { status: '$$r.overtime.status', approvedMinutes: '$$r.overtime.approvedMinutes' }
                    }
                }
            },
            // Horario semanal (se borra después) y turno (se queda en la respuesta),
            // para resolver el turno de cada día.
            shiftByDay: '$workSchedule.scheduleByDay',
            shiftType: '$workSchedule.shiftType'
        }
    },

    // Fuera lo pesado y lo sensible. "inabilited" se conserva a propósito.
    {
        $project: {
            attendanceRecords: 0,
            password: 0,
            user: 0,
            updateByUser: 0,
            workSchedule: 0,
            createdOn: 0,
            date: 0,
        }
    },

    { $sort: { 'jobInformation.department': 1, surName: 1, name: 1 } }
];


// Agrega a cada empleado sus minutos y días de horas extras, y borra los campos auxiliares.
// Turno de cada día: override > regla semanal > turno del empleado.
const addOvertimeTo = (employees) => {
    employees.forEach(emp => {
        const days = (emp.overtimeSource || []).map(rec => {
            const dayRule = rec?.date ? dayRuleOf(emp.shiftByDay, new Date(rec.date).getUTCDay()) : null;
            return { record: rec, shift: rec?.shift || dayRule?.shift || emp.shiftType || 'Diurno' };
        });

        const ot = accumulateOvertime(days);
        emp.overtimeApprovedMinutes = ot.approvedMinutes;
        emp.overtimePendingMinutes = ot.pendingMinutes;
        emp.overtimeRejectedMinutes = ot.rejectedMinutes;
        emp.overtimeApprovedDays = ot.approvedDays;
        emp.overtimePendingDays = ot.pendingDays;

        delete emp.overtimeSource;
        delete emp.shiftByDay;
    });
};


// Suma un campo numérico de todos los empleados (los ausentes cuentan 0).
const sumOf = (employees, key) => employees.reduce((acc, emp) => acc + (emp[key] || 0), 0);


// Totales de toda la plantilla. Las horas extras van en minutos.
const buildTotals = (employees) => ({
    totalEmployees: employees.length,
    // El $match ya deja fuera a los dados de baja: hoy inactiveEmployees es siempre 0.
    // Se mantienen porque el front los lee.
    activeEmployees: employees.filter(r => !r.inabilited).length,
    inactiveEmployees: employees.filter(r => r.inabilited).length,
    totalLateWeekday: sumOf(employees, 'lateWeekday'),
    totalLateWeekend: sumOf(employees, 'lateWeekend'),
    totalExtraDays: sumOf(employees, 'extraDays'),
    totalPresent: sumOf(employees, 'totalPresent'),
    totalFalta: sumOf(employees, 'faltaCount'),
    totalDiscountUnits: sumOf(employees, 'discountUnits'),
    totalPermiso: sumOf(employees, 'permisoCount'),
    totalVacaciones: sumOf(employees, 'vacacionesCount'),
    totalOnDuty: sumOf(employees, 'onDutyDays'),
    totalAuxiliary: sumOf(employees, 'auxiliaryDays'),
    totalOvertimeApprovedMinutes: sumOf(employees, 'overtimeApprovedMinutes'),
    totalOvertimePendingMinutes: sumOf(employees, 'overtimePendingMinutes'),
    totalOvertimeRejectedMinutes: sumOf(employees, 'overtimeRejectedMinutes'),
});


// Genera el reporte global del rango: { totals, employees }.
export async function buildGlobalReport(fromDate, toDate) {
    const employees = await UserModel.aggregate(buildPipeline(fromDate, toDate));
    addOvertimeTo(employees);
    return { totals: buildTotals(employees), employees };
}
