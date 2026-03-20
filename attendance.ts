// ─────────────────────────────────────────────────────────────────────────────
// utils/attendance.ts
// All time calculations that mirror the backend logic so the UI stays in sync.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AttendanceRecord,
  AttendanceRow,
  PeriodSummary,
  User,
  WorkSchedule,
} from '../types'

// ── Constants (must match backend) ───────────────────────────────────────────
const LATE_GRACE_MINUTES = 5

// ── Low-level helpers ─────────────────────────────────────────────────────────

/** "HH:mm" → total minutes from midnight */
export function timeToMinutes(time: string): number {
  if (!time) return 0
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** minutes → "Xh Ym" display string */
export function minutesToHM(mins: number): string {
  if (mins <= 0) return '0h 00m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** "+Xh Ym" with sign */
export function minutesToHMSigned(mins: number): string {
  if (mins <= 0) return '—'
  return `+${minutesToHM(mins)}`
}

/** "+Xm" late display */
export function minutesToLate(mins: number): string {
  if (mins <= 0) return '—'
  return `+${mins}m`
}

/** ISO datetime → "HH:mm" in local time */
export function isoToHHMM(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** ISO date → short label: "Lun 03/03" */
export function isoToDayLabel(iso: string): string {
  const d = new Date(iso)
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${days[d.getUTCDay()]} ${day}/${month}`
}

// ── Resolve effective schedule for a given record ─────────────────────────────
/**
 * Priority: scheduleOverride > scheduleByDay[dayOfWeek] > ""
 * Mirrors backend: override.startTime || dayRule?.startTime || null
 */
export function resolveSchedule(
  record: AttendanceRecord,
  user: User
): { startTime: string; endTime: string; isRestDay: boolean } {
  const override = record.scheduleOverride
  const dayOfWeek = new Date(record.date).getUTCDay()
  const dayRule = user.workSchedule?.scheduleByDay?.[String(dayOfWeek)]

  const startTime =
    (override?.workType && override.workType !== 'descanso' ? override.startTime : null) ||
    (dayRule?.workType !== 'descanso' ? dayRule?.startTime : null) ||
    ''

  const endTime =
    (override?.workType && override.workType !== 'descanso' ? override.endTime : null) ||
    (dayRule?.workType !== 'descanso' ? dayRule?.endTime : null) ||
    ''

  const isRestDay =
    (override?.workType === 'descanso') ||
    (!override?.workType && dayRule?.workType === 'descanso') ||
    false

  return { startTime, endTime, isRestDay }
}

// ── Per-row computation ───────────────────────────────────────────────────────
export function computeRow(record: AttendanceRecord, user: User): AttendanceRow {
  const { startTime, endTime, isRestDay } = resolveSchedule(record, user)

  // Worked minutes (checkIn → checkOut)
  const workedMinutes =
    record.checkIn && record.checkOut
      ? Math.round(
          (new Date(record.checkOut).getTime() - new Date(record.checkIn).getTime()) / 60000
        )
      : 0

  // Scheduled minutes (startTime → endTime, same calendar day)
  const scheduledMinutes =
    startTime && endTime ? timeToMinutes(endTime) - timeToMinutes(startTime) : 0

  // Extra minutes = worked beyond scheduled end (only when both exist and worked > scheduled)
  const extraMinutes =
    workedMinutes > 0 && scheduledMinutes > 0
      ? Math.max(0, workedMinutes - scheduledMinutes)
      : record.isExtraDay && workedMinutes > 0
      ? workedMinutes
      : 0

  // Late minutes (checkIn vs startTime + grace)
  let lateMinutes = 0
  if (record.isLate && record.checkIn && startTime) {
    const checkInMins =
      new Date(record.checkIn).getHours() * 60 + new Date(record.checkIn).getMinutes()
    lateMinutes = Math.max(0, checkInMins - (timeToMinutes(startTime) + LATE_GRACE_MINUTES))
  }

  return {
    ...record,
    workedMinutes,
    scheduledMinutes,
    extraMinutes,
    lateMinutes,
    effectiveStartTime: startTime,
    effectiveEndTime: endTime,
    dayLabel: isoToDayLabel(record.date),
    dayOfWeek: new Date(record.date).getUTCDay(),
    isRestDay,
  }
}

// ── Period summary ────────────────────────────────────────────────────────────
export function computeSummary(rows: AttendanceRow[]): PeriodSummary {
  let workDays = 0
  let presentDays = 0
  let absentDays = 0
  let lateDays = 0
  let justifiedLateDays = 0
  let extraDays = 0
  let totalWorkedMinutes = 0
  let totalExtraMinutes = 0
  let totalLateMinutes = 0
  let expectedMinutes = 0

  for (const row of rows) {
    if (row.isRestDay || row.status === 'pendiente') continue

    workDays++
    if (row.scheduledMinutes > 0) expectedMinutes += row.scheduledMinutes

    if (row.status === 'presente' || row.status === 'franco-trabajado') {
      presentDays++
      totalWorkedMinutes += row.workedMinutes
      totalExtraMinutes += row.extraMinutes
    }
    if (row.status === 'ausente') absentDays++
    if (row.isLate) {
      lateDays++
      totalLateMinutes += row.lateMinutes
      if (row.isJustified) justifiedLateDays++
    }
    if (row.isExtraDay || row.extraMinutes > 0) extraDays++
  }

  const attendanceRate = workDays > 0 ? Math.round((presentDays / workDays) * 100) : 0

  return {
    workDays,
    presentDays,
    absentDays,
    lateDays,
    justifiedLateDays,
    extraDays,
    totalWorkedMinutes,
    totalExtraMinutes,
    totalLateMinutes,
    expectedMinutes,
    attendanceRate,
  }
}

// ── Generate all calendar days in a range ────────────────────────────────────
/**
 * Returns every day between from–to (inclusive) as ISO midnight UTC strings.
 * Used to fill gaps where no AttendanceRecord exists yet (pending days).
 */
export function daysInRange(from: Date, to: Date): string[] {
  const days: string[] = []
  const cur = new Date(from)
  cur.setUTCHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setUTCHours(0, 0, 0, 0)
  while (cur <= end) {
    days.push(cur.toISOString())
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return days
}

/**
 * Merges real records with phantom "pending" records for days with no data.
 * The table always shows a complete calendar, not just days with records.
 */
export function fillCalendar(
  records: AttendanceRecord[],
  user: User,
  from: Date,
  to: Date
): AttendanceRow[] {
  const byDate = new Map(
    records.map((r) => [r.date.split('T')[0], r])
  )

  return daysInRange(from, to).map((isoDay) => {
    const key = isoDay.split('T')[0]
    const existing = byDate.get(key)

    if (existing) return computeRow(existing, user)

    // Phantom record for days with no data
    const phantom: AttendanceRecord = {
      _id: `phantom-${key}`,
      userId: user._id,
      date: isoDay,
      isLate: false,
      isJustified: false,
      isExtraDay: false,
      status: 'pendiente',
      createdAt: isoDay,
      updatedAt: isoDay,
    }
    return computeRow(phantom, user)
  })
}
