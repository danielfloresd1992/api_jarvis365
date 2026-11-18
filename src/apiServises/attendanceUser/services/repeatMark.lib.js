// ══════════════════════════════════════════════════════════════════════
// EL MISMO MARCAJE, DOS VECES
// ══════════════════════════════════════════════════════════════════════
// Dos marcajes de la misma persona con menos de REPEAT_MARK_SECONDS entre sí son
// uno solo enviado dos veces: la huella y la cédula casi a la vez, dos kioscos
// que recibieron la misma huella, un reintento… El segundo no se registra.
// Antes se tomaba como la salida y cerraba la jornada recién abierta (o, tras
// la salida del turno nocturno, abría la jornada de hoy).

export const REPEAT_MARK_SECONDS = 60;


// lastMarkMs = «cuándo fue el último marcaje de la persona»: su entrada o salida
// más reciente (de los registros de ayer y hoy), en ms, o null. Una hora futura
// (puesta a mano por un administrador) no es un marcaje que ya pasó.
export function lastMarkMs(records, now) {
    let last = null;
    for (const record of records ?? []) {
        for (const value of [record?.checkIn, record?.checkOut]) {
            const ms = value ? new Date(value).getTime() : NaN;
            if (!Number.isFinite(ms) || ms > now.getTime()) continue;
            if (last === null || ms > last) last = ms;
        }
    }
    return last;
}

// repeatedMarkSeconds = «¿este marcaje repite el anterior?»: hace cuántos
// segundos fue el anterior, o null si es un marcaje nuevo.
export function repeatedMarkSeconds(records, now) {
    const last = lastMarkMs(records, now);
    if (last === null) return null;
    const seconds = (now.getTime() - last) / 1000;
    return seconds < REPEAT_MARK_SECONDS ? Math.floor(seconds) : null;
}

export const repeatedMarkMessage = (secondsAgo) =>
    `Ya registramos tu marcaje ${secondsAgo < 1 ? 'hace un instante' : `hace ${secondsAgo} s`}. No hace falta marcar otra vez.`;
