import moment from 'moment-timezone';
import mongoose from 'mongoose';
import Noveltie from '../../apiServises/noveltie/noveltie.model.js';
import BonusRuleModel from '../../apiServises/bonus/bonusRule.model.js';
import MenuModel from '../../apiServises/menu/menu.model.js';
import LocalModel from '../../apiServises/local/local.model.js';
import Schedules from '../../apiServises/schedules/schedule.model.js';
import AttendanceModel from '../../apiServises/user/attendance.model.js';
import UserModel from '../../apiServises/user/user.model.js';
import { IsDaylightSavingTimeBoolean } from '../../apiServises/time/time.model.js';
import { pickSchedule } from '../../apiServises/schedules/schedule.logic.js';
import { estadoDvrPorLocal, sinFallas } from '../../apiServises/dvrFailure/dvrFailure.report.js';

// ══════════════════════════════════════════════════════════════════════
// SERVICIO: Conteo de novedades del DÍA OPERATIVO (08:00 → 07:00 del día
// siguiente), agrupado por franquicia → establecimiento.
// ══════════════════════════════════════════════════════════════════════
// Buckets por local (fuente: modelo Noveltie):
//   total      todas las novedades del período
//   positivas  validationResult.isApproved === true
//   negativas  validationResult.isApproved === false
//   ignoradas  validationResult.isApproved ausente/null (nadie las validó)
//   enviadas   sharedByAmazonActive === true (enviada al grupo; givenToTheGroup
//              está DEPRECATED en el modelo)
//   diurno / nocturno  según shift ('day' | 'night'; null no suma a ninguno)
//
// Solo cuentan los establecimientos "que se ven hoy": isActive:true Y con
// rangos de monitoreo para el día operativo en su horario vigente (normal o
// de invierno, según usesUsTimezone + el flag global usWinterActive).
// La fecha se ancla con el mismo criterio de zona fija del monitoreo.
//
// Cada local trae además `dvr` —el estado de sus cámaras en la jornada— y
// `status`, que dice si reportó, si no reportó, o si no PODÍA reportar por
// tener el DVR caído. Ver el bloque "QUIÉN NO REPORTÓ, Y QUIÉN NO PODÍA".

const REPORT_TZ = process.env.MONITORING_TZ || 'America/Caracas';

const WEEKDAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Ventana del día operativo que contiene (o termina en) `now`.
 * Empieza a las 08:00 y termina a las 07:00 del día siguiente (hora REPORT_TZ).
 */
function getOperationalDay(now = moment.tz(REPORT_TZ)) {
    const start = now.clone().startOf('day').hour(8);
    if (now.isBefore(start)) start.subtract(1, 'day');   // antes de las 08:00 → empezó ayer
    const end = start.clone().add(23, 'hours');          // 07:00 del día siguiente
    return { start, end };
}

/** Fecha civil (medianoche UTC) del inicio del día operativo — la que usa attendance. */
function civilDateOf(startMoment) {
    return new Date(Date.UTC(startMoment.year(), startMoment.month(), startMoment.date()));
}

/**
 * Establecimientos "en el horario" del día operativo: activos y con al menos
 * un rango de monitoreo para ese día de la semana en su horario vigente.
 * @returns [{ _id, name, franchiseName }]
 */
async function getLocalsInTodaySchedule(startMoment) {
    const [timeDoc, schedules, activeLocals] = await Promise.all([
        IsDaylightSavingTimeBoolean.findOne(),
        Schedules.find(),
        LocalModel.find({ isActive: true }).select('_id name franchiseReference franchise').lean(),
    ]);

    const isWinter = Boolean(timeDoc?.usWinterActive);
    const weekday = startMoment.day();   // 0=Dom … 6=Sáb (día en que ABRE la ventana)

    const scheduledIds = new Set();
    for (const doc of schedules) {
        const { ranges } = pickSchedule(doc, isWinter);
        if (ranges.some(r => Number(r.dayMonitoring) === weekday)) {
            scheduledIds.add(String(doc.idLocal));
        }
    }

    return activeLocals
        .filter(l => scheduledIds.has(String(l._id)))
        .map(l => ({
            _id: l._id,
            name: l.name,
            // Mismo criterio de agrupación que el front (groupByFranchiseComprehensive)
            franchiseName: l.franchiseReference?.name_franchise || l.franchise || 'Sin franquicia',
        }));
}

/**
 * Encargados de turno (guardia del día, attendance.onDuty) para la fecha civil
 * del día operativo. Prioriza el departamento de Operaciones; el turno efectivo
 * se resuelve igual que el endpoint que designa la guardia:
 * override del día > regla semanal > turno global.
 * @returns { diurno: string|null, nocturno: string|null }
 */
async function getOnDutyByShift(startMoment) {
    const civilDate = civilDateOf(startMoment);
    const records = await AttendanceModel.find({ date: civilDate, onDuty: true })
        .select('userId scheduleOverride')
        .lean();
    if (records.length === 0) return { diurno: null, nocturno: null };

    const users = await UserModel.find({ _id: { $in: records.map(r => r.userId) } })
        .select('name surName jobInformation workSchedule')
        .lean();
    const usersById = new Map(users.map(u => [String(u._id), u]));

    const dayNumber = civilDate.getUTCDay();
    const resolveShift = (workSchedule, record) => {
        if (record?.scheduleOverride?.shift) return record.scheduleOverride.shift;
        const map = workSchedule?.scheduleByDay;
        const rule = map?.get?.(String(dayNumber)) || map?.[String(dayNumber)] || null;
        return rule?.shift || workSchedule?.shiftType || 'Diurno';
    };

    const result = { diurno: null, nocturno: null };
    // Orden estable: Operaciones primero (es el departamento del monitoreo)
    const sorted = [...records].sort((a, b) => {
        const da = usersById.get(String(a.userId))?.jobInformation?.department === 'Operaciones' ? 0 : 1;
        const db = usersById.get(String(b.userId))?.jobInformation?.department === 'Operaciones' ? 0 : 1;
        return da - db;
    });
    for (const record of sorted) {
        const user = usersById.get(String(record.userId));
        if (!user) continue;
        const fullName = `${user.name} ${user.surName ?? ''}`.trim();
        const shift = resolveShift(user.workSchedule, record);
        if (shift === 'Nocturno') { if (!result.nocturno) result.nocturno = fullName; }
        else { if (!result.diurno) result.diurno = fullName; }
    }
    return result;
}

const emptyCounts = () => ({ total: 0, positivas: 0, negativas: 0, ignoradas: 0, enviadas: 0, diurno: 0, nocturno: 0 });

const addCounts = (target, source) => {
    for (const key of Object.keys(target)) target[key] += source[key] ?? 0;
    return target;
};

// ══════════════════════════════════════════════════════════════════════
// QUIÉN NO REPORTÓ, Y QUIÉN NO PODÍA
// ══════════════════════════════════════════════════════════════════════
// Un establecimiento en 0 se venía leyendo como "no reportó". Pero si tiene el
// DVR caído no es que no haya reportado: es que NO PODÍA. No se monitorean
// cámaras que no se ven, y contarlo como omisión culpa al operador de un corte
// de conexión.
//
// Por eso los locales se reparten en TRES estados y no en dos:
//
//   reportaron    pasó al menos una novedad
//   sinReportar   está en 0 y el DVR anda — acá sí hay algo que preguntar
//   sinConexion   tiene el DVR caído AHORA: fuera de la cuenta
//
// El criterio para excluir es "caído AHORA", no "se cayó alguna vez hoy".
// Cuando la conexión vuelve, el local regresa a la cuenta normal en el mismo
// momento — que es lo que se pidió: al restablecer, vuelve a estar activo.
//
// El caso de borde queda A LA VISTA en lugar de escondido: un local que estuvo
// ciego ocho horas y volvió hace diez minutos cuenta como `sinReportar`, porque
// ahora sí puede. Para eso cada fila lleva `dvr.downtimeMinutes` — los minutos
// que estuvo ciego DENTRO de la jornada—: quien lea el reporte ve el 0 y ve al
// lado por qué, sin que el conteo decida por él.
const emptyDvrTotals = () => ({
    downNow: 0,
    affectedToday: 0,
    downtimeMinutes: 0,
    episodes: 0,
});

const emptyStatus = () => ({ reportaron: 0, sinReportar: 0, sinConexion: 0 });

/**
 * Construye el reporte de conteo de novedades.
 * @param {object} [options]
 * @param {boolean} [options.isFinal]  true → reporte final del día operativo COMPLETO
 *                                     (08:00→07:00); false → corte parcial hasta ahora.
 * @param {Date|moment} [options.at]   instante de referencia (default: ahora).
 * @param {string} [options.category]       categoría OPERATIVA ('delay', 'food'…)
 * @param {string} [options.bonusCategory]  categoría de BONIFICACIÓN
 *
 * Los dos filtros son opcionales y se combinan (AND). Sin ellos el reporte es
 * exactamente el de siempre, que es el que usan el job de WhatsApp y el PDF.
 */
export async function buildNoveltyCountReport({ isFinal = false, at, category, bonusCategory } = {}) {
    const now = at ? moment.tz(at, REPORT_TZ) : moment.tz(REPORT_TZ);
    const { start, end } = getOperationalDay(now);
    const rangeEnd = isFinal ? end : moment.min(now, end);

    const locals = await getLocalsInTodaySchedule(start);
    const localIds = locals.map(l => new mongoose.Types.ObjectId(String(l._id)));

    // ── Filtro por categoría ──────────────────────────────────────────
    // Las categorías no viven en la novedad sino en su alerta (`Menu`), así que
    // primero se resuelve QUÉ alertas entran y después se filtra por `menuRef`.
    //
    // Se hace en pasos y no con un $lookup porque el catálogo de alertas es
    // chico y estable: una consulta que devuelve ids sale mucho más barata que
    // cruzar toda la colección de novedades del día.
    //
    // La de BONIFICACIÓN suma un salto: dejó de colgar de la alerta y ahora
    // cuelga de su regla, así que va `BonusRule → Menu → Noveltie`. Sigue siendo
    // barato por lo mismo — son dos colecciones chicas — y evita duplicar la
    // categoría en cada alerta, que era de dónde venía el problema.
    let menuFilter = null;
    if (category || bonusCategory) {
        const criterio = { ...(category ? { category } : {}) };

        if (bonusCategory) {
            const reglas = await BonusRuleModel.find({ bonusCategory }).select('_id').lean();
            // Dentro del array de asignaciones: basta con que UNA apunte a una
            // regla de esa categoría para que la alerta entre.
            criterio['bonusRules.rule'] = { $in: reglas.map(r => r._id) };
        }

        const menus = await MenuModel.find(criterio).select('_id').lean();

        // Con la lista vacía el $in no matchea nada, que es lo correcto: el
        // filtro pedido no tiene alertas y el reporte debe dar cero, no todo.
        menuFilter = { menuRef: { $in: menus.map(m => m._id) } };
    }

    // Conteo por establecimiento en una sola agregación.
    // Compatibilidad con documentos históricos:
    //  - se filtra por `date` (todas las consultas del repo usan ese campo; se
    //    setea en cada creación aunque el esquema lo marque deprecated),
    //  - el local puede venir en `establishment` (vigente) o solo en
    //    `local.idLocal` (docs viejos),
    //  - "enviada" puede estar solo en `givenToTheGroup` (flag previo a
    //    `sharedByAmazonActive`).
    const rows = localIds.length === 0 ? [] : await Noveltie.aggregate([
        {
            $match: {
                date: { $gte: start.toDate(), $lt: rangeEnd.toDate() },
                $or: [
                    { establishment: { $in: localIds } },
                    { 'local.idLocal': { $in: localIds } },
                ],
                ...(menuFilter ?? {}),
            },
        },
        {
            $group: {
                _id: { $ifNull: ['$establishment', '$local.idLocal'] },
                total:     { $sum: 1 },
                positivas: { $sum: { $cond: [{ $eq: ['$validationResult.isApproved', true] }, 1, 0] } },
                negativas: { $sum: { $cond: [{ $eq: ['$validationResult.isApproved', false] }, 1, 0] } },
                // Ignoradas: isApproved no es booleano (ausente o null) → nadie la validó
                ignoradas: { $sum: { $cond: [{ $ne: [{ $type: '$validationResult.isApproved' }, 'bool'] }, 1, 0] } },
                enviadas:  { $sum: { $cond: [{ $or: [
                    { $eq: ['$sharedByAmazonActive', true] },
                    { $eq: ['$givenToTheGroup', true] },
                ] }, 1, 0] } },
                diurno:    { $sum: { $cond: [{ $eq: ['$shift', 'day'] }, 1, 0] } },
                nocturno:  { $sum: { $cond: [{ $eq: ['$shift', 'night'] }, 1, 0] } },
            },
        },
    ]);
    const countsByLocal = new Map(rows.map(r => [String(r._id), r]));

    // ── Estado del DVR de cada establecimiento ────────────────────────
    // Se consulta con la MISMA ventana que las novedades, así los minutos
    // ciegos que se informan son los de esta jornada y no los del episodio
    // entero — una caída puede venir de ayer y seguir abierta.
    const dvrByLocal = await estadoDvrPorLocal(localIds, start.toDate(), rangeEnd.toDate(), REPORT_TZ);

    // Franquicia → locales (incluye locales en horario aunque lleven 0)
    const franchisesMap = new Map();
    for (const local of locals) {
        const counts = { ...emptyCounts(), ...(countsByLocal.get(String(local._id)) ?? {}) };
        delete counts._id;

        const dvr = dvrByLocal.get(String(local._id)) ?? sinFallas();

        // Los tres estados. `sinConexion` gana sobre `sinReportar`: un local
        // caído queda fuera de la cuenta de omisiones aunque esté en 0.
        const status = dvr.down ? 'sinConexion'
            : counts.total > 0 ? 'reportaron'
                : 'sinReportar';

        if (!franchisesMap.has(local.franchiseName)) {
            franchisesMap.set(local.franchiseName, {
                name: local.franchiseName,
                totals: emptyCounts(),
                dvr: emptyDvrTotals(),
                status: emptyStatus(),
                locals: [],
            });
        }
        const group = franchisesMap.get(local.franchiseName);
        group.locals.push({ idLocal: String(local._id), name: local.name, ...counts, dvr, status });
        addCounts(group.totals, counts);

        group.status[status] += 1;
        group.dvr.downNow += dvr.down ? 1 : 0;
        group.dvr.affectedToday += dvr.episodes > 0 ? 1 : 0;
        group.dvr.downtimeMinutes += dvr.downtimeMinutes;
        group.dvr.episodes += dvr.episodes;
    }

    const franchises = [...franchisesMap.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    franchises.forEach(f => f.locals.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })));

    const totals = franchises.reduce((acc, f) => addCounts(acc, f.totals), emptyCounts());

    const dvrTotals = franchises.reduce((acc, f) => {
        for (const key of Object.keys(acc)) acc[key] += f.dvr[key] ?? 0;
        return acc;
    }, emptyDvrTotals());

    const statusTotals = franchises.reduce((acc, f) => {
        for (const key of Object.keys(acc)) acc[key] += f.status[key] ?? 0;
        return acc;
    }, emptyStatus());

    // La lista corta de los que están caídos ahora, con su hora. Es lo que se
    // pinta arriba del reporte y lo que se avisa por socket: quien lo mira
    // quiere saber cuáles son sin recorrer todas las franquicias.
    const dvrDownNow = franchises
        .flatMap(f => f.locals.map(local => ({ ...local, franchiseName: f.name })))
        .filter(local => local.dvr.down)
        .map(local => ({
            idLocal: local.idLocal,
            name: local.name,
            franchiseName: local.franchiseName,
            failedAt: local.dvr.failedAt,
            failedAtLabel: local.dvr.failedAtLabel,
            downtimeMinutes: local.dvr.downtimeMinutes,
            reportedByName: local.dvr.reportedByName,
        }))
        .sort((a, b) => new Date(a.failedAt) - new Date(b.failedAt));

    const onDuty = await getOnDutyByShift(start);

    return {
        isFinal,
        dateLabel: start.format('DD/MM/YYYY'),
        weekdayLabel: WEEKDAYS_ES[start.day()],
        windowLabel: `${start.format('DD/MM HH:mm')} → ${end.format('DD/MM HH:mm')}`,
        cutoffLabel: rangeEnd.format('DD/MM HH:mm'),
        generatedAtLabel: now.format('DD/MM/YYYY HH:mm'),
        operationalDayKey: start.format('YYYY-MM-DD'),
        onDuty,
        totals,

        // Cuántos reportaron, cuántos no, y cuántos no podían. Se devuelve
        // contado y no derivado por cada consumidor: el criterio de qué es "no
        // reportó" tiene que ser uno solo, y vive acá.
        status: statusTotals,

        // El estado de las cámaras: cuántos caídos ahora, cuántos se cayeron en
        // algún momento del día, y los minutos ciegos de la jornada.
        dvr: { ...dvrTotals, locals: dvrDownNow },

        localsInSchedule: locals.length,
        franchises,
    };
}

export { getOperationalDay, REPORT_TZ };