// Human-readable labels for ISO week keys ("2026-W31" → "Jul W4").
// Locked display rule: a week is claimed by the month its Monday falls in,
// numbered by which Monday of that month it is (Aug 31 → "Aug W5").
// Non-ISO input (weeks arrays contain nulls) passes through unchanged.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_WEEK = /^(\d{4})-W(\d{2})$/;

export function weekLabel(week) {
  const match = typeof week === "string" ? ISO_WEEK.exec(week) : null;
  if (!match) return week;

  // ISO week 1 is the week containing Jan 4; back up to that week's Monday (UTC).
  const year = Number(match[1]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayW1 = new Date(Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7)));
  const monday = new Date(mondayW1.getTime() + (Number(match[2]) - 1) * 7 * 86400000);

  return `${MONTHS[monday.getUTCMonth()]} W${Math.floor((monday.getUTCDate() - 1) / 7) + 1}`;
}
