// Business-time arithmetic. All inputs are UTC instants; the business calendar
// is evaluated in a fixed-offset local time (Asia/Manila has no DST).

const MIN = 60_000;
const DAY = 86_400_000;

const parseHHMM = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return (h * 60 + (m || 0)) * MIN;
};

export function makeCalendar({
  offsetHours = 8,
  start = '08:00',
  end = '17:00',
  days = [1, 2, 3, 4, 5],
  holidays = [],
} = {}) {
  const offset = offsetHours * 3_600_000;
  const startMs = parseHHMM(start);
  const endMs = parseHHMM(end);
  const holidaySet = new Set(holidays.filter(Boolean));
  const daySet = new Set(days);

  const isBusinessDay = (localMidnight) => {
    const d = new Date(localMidnight);
    return daySet.has(d.getUTCDay()) && !holidaySet.has(d.toISOString().slice(0, 10));
  };

  // Business milliseconds between two UTC instants.
  function businessMs(fromUtc, toUtc) {
    if (fromUtc == null || toUtc == null || toUtc <= fromUtc) return 0;
    const from = fromUtc + offset;
    const to = toUtc + offset;
    let total = 0;
    for (let day = Math.floor(from / DAY) * DAY; day < to; day += DAY) {
      if (!isBusinessDay(day)) continue;
      const a = Math.max(from, day + startMs);
      const b = Math.min(to, day + endMs);
      if (b > a) total += b - a;
    }
    return total;
  }

  // The UTC instant reached after `ms` of business time starting at fromUtc.
  function addBusinessMs(fromUtc, ms) {
    const from = fromUtc + offset;
    let left = ms;
    let day = Math.floor(from / DAY) * DAY;
    for (let i = 0; i < 3660; i++, day += DAY) {
      if (!isBusinessDay(day)) continue;
      const a = Math.max(from, day + startMs);
      const b = day + endMs;
      if (b <= a) continue;
      if (b - a >= left) return a + left - offset;
      left -= b - a;
    }
    return day - offset; // no business days configured
  }

  return {
    businessMs,
    addBusinessDays: (fromUtc, days) => addBusinessMs(fromUtc, days * (endMs - startMs)),
    hoursPerDay: (endMs - startMs) / 3_600_000,
    businessMinutes: (a, b) => businessMs(a, b) / MIN,
    businessDays: (a, b) => businessMs(a, b) / (endMs - startMs),
  };
}

// UberTicket returns both "2026-09-23T08:35:02.000000Z" and "2026-09-23 08:35:02";
// both are UTC (updated_at and closed_at match to the second).
export function parseUtc(s) {
  if (!s) return null;
  const iso = String(s).trim().replace(' ', 'T').replace(/(\.\d{3})\d*/, '$1');
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
  return Number.isNaN(t) ? null : t;
}
