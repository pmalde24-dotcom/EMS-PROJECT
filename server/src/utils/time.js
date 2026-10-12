'use strict';

/** Returns the local Y-M-D parts for an instant in a given IANA timezone. */
function zonedParts(date = new Date(), timeZone = 'Asia/Kolkata') {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const parts = fmt.formatToParts(date).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour % 24, minute: +parts.minute, second: +parts.second };
}

/** UTC-midnight Date representing the local calendar day (used as the unique attendance key). */
function dateKey(date = new Date(), timeZone = 'Asia/Kolkata') {
  const p = zonedParts(date, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** "HH:MM" of an instant in a timezone. */
function timeString(date = new Date(), timeZone = 'Asia/Kolkata') {
  const p = zonedParts(date, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
const toMinutes = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Builds the UTC instant for a local wall-clock time on a given local day. */
function instantFor(dateKeyUtc, hhmm, timeZone = 'Asia/Kolkata') {
  const [h, m] = String(hhmm).split(':').map(Number);
  const guess = new Date(Date.UTC(dateKeyUtc.getUTCFullYear(), dateKeyUtc.getUTCMonth(), dateKeyUtc.getUTCDate(), h, m));
  // Correct for the timezone offset on that date.
  const p = zonedParts(guess, timeZone);
  const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const wanted = Date.UTC(dateKeyUtc.getUTCFullYear(), dateKeyUtc.getUTCMonth(), dateKeyUtc.getUTCDate(), h, m);
  return new Date(guess.getTime() + (wanted - actual));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthRange = (year, month) => ({ start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)) });
const periodKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const weekStartOf = (d = new Date()) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = x.getUTCDay(); x.setUTCDate(x.getUTCDate() - ((day + 6) % 7)); return x; };
const listDays = (start, end) => { const out = []; for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(new Date(d)); return out; };

module.exports = { zonedParts, dateKey, timeString, minutesBetween, toMinutes, instantFor, MONTHS, monthRange, periodKey, weekStartOf, listDays };
