// Dates au format local AAAA-MM-JJ.
// Les calculs passent par UTC pour ne pas être faussés par les changements d'heure.

const pad = n => String(n).padStart(2, '0');

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(iso, n) {
  const d = new Date(toUTC(iso) + n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Les 7 jours (lundi → dimanche) de la semaine qui contient `iso`.
export function weekDays(iso) {
  const dayOfWeek = new Date(toUTC(iso)).getUTCDay(); // 0 = dimanche
  const monday = addDays(iso, -((dayOfWeek + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}
