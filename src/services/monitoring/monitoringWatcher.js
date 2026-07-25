import colors from 'colors';
import Schedules from '../../apiServises/schedules/schedule.model.js';
import LocalModel from '../../apiServises/local/local.model.js';
import { IsDaylightSavingTimeBoolean } from '../../apiServises/time/time.model.js';
import { getActiveMonitoringNow } from '../../apiServises/schedules/schedule.logic.js';
import MonitoringStateModel from './monitoringState.model.js';
import { maybeSendNoveltyReport } from '../noveltyReport/noveltyReport.job.js';
import { maybeSendSilenceReport } from '../noveltyReport/noveltySilence.job.js';
import { io } from '../socket/io.js';

// ══════════════════════════════════════════════════════════════════════
// WATCHER DE MONITOREO — Detecta en tiempo real qué establecimiento entra
// o sale de su ventana de monitoreo, POR TIPO, y lo anuncia por socket.
// ══════════════════════════════════════════════════════════════════════
// Cada TICK_MS evalúa, para cada local ACTIVO (isActive:true) con horario:
//   getActiveMonitoringNow(scheduleDoc, isWinter)
// que ya resuelve: rangos corridos (fin <= inicio, cruzan medianoche), el tipo
// por rango y el HORARIO DE INVIERNO — se usa `dayMonitoringWinter` cuando el
// local tiene `usesUsTimezone` y el interruptor global `usWinterActive`
// (recurso time) está encendido. El flag se relee en cada tick.
//
// El estado es POR TIPO ('analytical' | 'perimeter'): un local con
// 12:00–23:00 analítico y 23:00–07:00 perimetral genera a las 23:00 DOS
// eventos (fin del analítico + inicio del perimetral), no silencio.
//
// Transiciones (una por tipo que cambia):
//   tipo entra en ventana  → 'monitoring-start' { ..., type, typeLabel }
//   tipo sale de ventana   → 'monitoring-end'   { ..., type, typeLabel }
// Payload: { idLocal, name, type, typeLabel, usingWinter, at }
//
// ESTADO DURABLE: colección `monitoringstates` (un doc por local, campo
// `activeTypes`). Al arrancar se siembra desde ahí: un reinicio no pierde las
// transiciones ocurridas durante el downtime. Solo un local nunca visto se
// siembra en silencio. Se escribe únicamente cuando algo cambia.

const TICK_MS = 30_000;

// Etiquetas en español para el anuncio por voz del front
const TYPE_LABELS = {
    analytical: 'analítico',
    perimeter:  'perimetral',
};

// Caché de trabajo (espejo de la colección): idLocal → Set de tipos activos
const previousTypes = new Map();
// Último nombre conocido por local
const lastKnownNames = new Map();

let seeded = false;
let timer = null;

/** Carga el estado persistido a la caché en memoria (una vez por proceso). */
async function seedFromDatabase() {
    const persisted = await MonitoringStateModel.find();
    for (const doc of persisted) {
        previousTypes.set(doc.idLocal, new Set(doc.activeTypes ?? []));
        if (doc.name) lastKnownNames.set(doc.idLocal, doc.name);
    }
    seeded = true;
    console.log(colors.cyan(`[monitoring] estado sembrado desde Mongo (${persisted.length} locales)`));
}

async function tick() {
    try {
        if (!seeded) await seedFromDatabase();

        const [timeDoc, schedules, activeLocals] = await Promise.all([
            IsDaylightSavingTimeBoolean.findOne(),
            Schedules.find(),
            LocalModel.find({ isActive: true }).select('_id name'),
        ]);

        const isWinter = Boolean(timeDoc?.usWinterActive);
        const nameById = new Map(activeLocals.map(l => [String(l._id), l.name]));
        nameById.forEach((name, id) => lastKnownNames.set(id, name));

        // Estado actual por local: Set de tipos dentro de su ventana ahora mismo
        const currentTypes = new Map();
        const usingWinterById = new Map();
        for (const doc of schedules) {
            const id = String(doc.idLocal);
            if (!nameById.has(id)) continue;   // local inactivo o inexistente → no se monitorea
            const status = getActiveMonitoringNow(doc, isWinter);
            currentTypes.set(id, new Set(status.active ? status.types : []));
            usingWinterById.set(id, Boolean(status.usingWinter));
        }

        // Transiciones por tipo: unión de locales conocidos y actuales
        const allIds = new Set([...previousTypes.keys(), ...currentTypes.keys()]);
        for (const id of allIds) {
            const isKnown = previousTypes.has(id);
            const before  = previousTypes.get(id) ?? new Set();
            const now     = currentTypes.get(id) ?? new Set();
            const name    = lastKnownNames.get(id) ?? id;
            const winter  = usingWinterById.get(id) ?? false;

            // Tipos que cambiaron de estado en este tick
            const started = [...now].filter(t => !before.has(t));
            const ended   = [...before].filter(t => !now.has(t));
            const changed = isKnown && (started.length > 0 || ended.length > 0);

            if (changed) {
                const at = new Date();

                for (const type of started) {
                    io.emit('monitoring-start', {
                        idLocal: id, name, type,
                        typeLabel: TYPE_LABELS[type] ?? type,
                        usingWinter: winter,
                        at: at.toISOString(),
                    });
                    console.log(colors.cyan(`[monitoring] INICIO monitoreo ${TYPE_LABELS[type] ?? type} en ${name}${winter ? ' (horario de invierno)' : ''}`));
                }

                for (const type of ended) {
                    io.emit('monitoring-end', {
                        idLocal: id, name, type,
                        typeLabel: TYPE_LABELS[type] ?? type,
                        usingWinter: winter,
                        at: at.toISOString(),
                    });
                    console.log(colors.cyan(`[monitoring] FIN monitoreo ${TYPE_LABELS[type] ?? type} en ${name}${winter ? ' (horario de invierno)' : ''}`));
                }

                await MonitoringStateModel.updateOne(
                    { idLocal: id },
                    {
                        $set: {
                            name,
                            activeTypes: [...now],
                            active: now.size > 0,
                            usingWinter: winter,
                            ...(started.length > 0 ? { lastStartAt: at } : {}),
                            ...(ended.length   > 0 ? { lastEndAt:   at } : {}),
                        },
                    },
                    { upsert: true },
                );
            }
            else if (!isKnown) {
                // Primer avistamiento del local → sembrar en silencio (sin emitir)
                await MonitoringStateModel.updateOne(
                    { idLocal: id },
                    {
                        $set: {
                            name,
                            activeTypes: [...now],
                            active: now.size > 0,
                            usingWinter: winter,
                        },
                    },
                    { upsert: true },
                );
            }

            // La caché conserva la entrada aunque el local salga de la consulta
            // (quedó vacía); evita re-siembras y mantiene el espejo con Mongo.
            previousTypes.set(id, now);
        }

        // Reporte de conteo de novedades: aprovecha este mismo bucle para los
        // cortes cada 2 horas y el cierre de las 07:00. Es idempotente vía
        // Mongo (slotKey único), así que llamarlo en cada tick es seguro.
        await maybeSendNoveltyReport();

        // Detector de silencio (cada hora, desde las 09:00): locales con
        // monitoreo ANALÍTICO en ventana cuyo acumulado de validadas-y-enviadas
        // no crece → aviso de texto al grupo.
        await maybeSendSilenceReport();
    }
    catch (error) {
        // El bucle nunca tumba el proceso: se loguea y se reintenta al siguiente tick
        console.log(colors.red(`[monitoring] error en el tick del watcher: ${error?.message ?? error}`));
    }
}

/** Arranca el watcher. Llamar una sola vez, después de io.init(server). */
function startMonitoringWatcher() {
    if (timer) return;               // idempotente: evita bucles duplicados
    tick();                          // primera pasada inmediata (siembra + transiciones reales)
    timer = setInterval(tick, TICK_MS);
    console.log(colors.cyan(`[monitoring] watcher de monitoreo iniciado (tick cada ${TICK_MS / 1000}s)`));
}

function stopMonitoringWatcher() {
    if (timer) clearInterval(timer);
    timer = null;
}

export { startMonitoringWatcher, stopMonitoringWatcher };
