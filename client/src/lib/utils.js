import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...args) => twMerge(clsx(args));

/* ── ગુજરાતી લેબલ મેપિંગ (enum → label) ─────────────────────────── */
export const STATUS_LABELS = {
  active: 'કાર્યરત', probation: 'પ્રોબેશન પર', notice_period: 'નોટિસ પીરિયડ', resigned: 'રાજીનામું આપેલ',
  terminated: 'સેવામુક્ત', retired: 'નિવૃત્ત', inactive: 'નિષ્ક્રિય',
  present: 'હાજર', absent: 'ગેરહાજર', half_day: 'અર્ધ દિવસ', late: 'મોડું આવ્યા', early_exit: 'વહેલા ગયા',
  on_leave: 'રજા પર', holiday: 'રજા (તહેવાર)', weekly_off: 'સાપ્તાહિક રજા', work_from_home: 'ઘરેથી કામ', od: 'ઓફિસ ડ્યુટી',
  pending: 'પ્રતીક્ષામાં', manager_approved: 'મેનેજર મંજૂર', hr_approved: 'HR મંજૂર', approved: 'મંજૂર', rejected: 'નામંજૂર', cancelled: 'રદ',
  todo: 'કરવાનું બાકી', in_progress: 'ચાલુ છે', in_review: 'સમીક્ષામાં', completed: 'પૂર્ણ', blocked: 'અવરોધિત',
  low: 'નીચી', medium: 'મધ્યમ', high: 'ઉચ્ચ', urgent: 'તાત્કાલિક', critical: 'ગંભીર', normal: 'સામાન્ય',
  draft: 'ડ્રાફ્ટ', submitted: 'સબમિટ કરેલ', pending_approval: 'મંજૂરી બાકી', processed: 'પ્રોસેસ કરેલ', locked: 'લોક કરેલ', paid: 'ચૂકવેલ',
  available: 'ઉપલબ્ધ', assigned: 'સોંપેલ', maintenance: 'મેન્ટેનન્સમાં', lost: 'ખોવાયેલ', damaged: 'ક્ષતિગ્રસ્ત',
  applied: 'અરજી કરેલ', screening: 'સ્ક્રીનિંગ', shortlisted: 'શોર્ટલિસ્ટ', interview_scheduled: 'ઇન્ટરવ્યુ નિર્ધારિત',
  selected: 'પસંદ કરેલ', offer_sent: 'ઓફર મોકલેલ', hired: 'નિયુક્ત', withdrawn: 'પાછી ખેંચેલ',
  full_time: 'પૂર્ણ સમય', part_time: 'અંશ સમય', contract: 'કરાર', intern: 'ઇન્ટર્ન', consultant: 'કન્સલ્ટન્ટ',
  male: 'પુરુષ', female: 'સ્ત્રી', other: 'અન્ય', prefer_not_to_say: 'જણાવવું નથી',
  super_admin: 'સુપર એડમિન', hr_admin: 'HR એડમિન', hr_manager: 'HR મેનેજર', department_manager: 'ડિપાર્ટમેન્ટ મેનેજર',
  team_leader: 'ટીમ લીડર', employee: 'કર્મચારી',
  gender: '', salary: '',
  paid_leave: 'પગારવાળી રજા', unpaid: 'વેતન વગર',
  planning: 'આયોજન', active_project: 'સક્રિય',
  probationer: 'પ્રોબેશનર', permanent: 'કાયમી', contractual: 'કરાર આધારિત', trainee: 'તાલીમાર્થી',
};

export const label = (v, fallback = '—') => (v === null || v === undefined || v === '' ? fallback : STATUS_LABELS[v] || String(v).replace(/_/g, ' '));
export const labelize = (v) => (v ? String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

export const STATUS_TONES = {
  present: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  available: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  hired: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  manager_approved: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  probation: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  in_review: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
  submitted: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  late: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  half_day: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  absent: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  blocked: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  notice_period: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  on_leave: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
  holiday: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
  weekly_off: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  work_from_home: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300',
  urgent: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  high: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};
export const tone = (v) => STATUS_TONES[v] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

/* ── ફોર્મેટિંગ ───────────────────────────────────────────────────── */
const DATE_OPTS = { day: '2-digit', month: 'short', year: 'numeric' };
export const fmtDate = (d, fallback = '—') => (d ? new Date(d).toLocaleDateString('en-IN', DATE_OPTS) : fallback);
export const fmtDateTime = (d, fallback = '—') => (d ? new Date(d).toLocaleString('en-IN', { ...DATE_OPTS, hour: '2-digit', minute: '2-digit' }) : fallback);
export const fmtTime = (d, fallback = '—') => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : fallback);
export const fmtDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const currency = (n, symbol = '₹') => (n === null || n === undefined || n === '' ? '—' : `${symbol}${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
export const compact = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(2)} કરોડ`;
  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(2)} લાખ`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
};
export const hours = (minutes) => `${Math.floor((minutes || 0) / 60)} કલાક ${String((minutes || 0) % 60).padStart(2, '0')} મિનિટ`;
export const initials = (name) => (name || '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const relativeTime = (d) => {
  if (!d) return '—';
  const diff = (Date.now() - new Date(d)) / 1000;
  const units = [[31536000, 'વર્ષ'], [2592000, 'મહિનો'], [604800, 'અઠવાડિયું'], [86400, 'દિવસ'], [3600, 'કલાક'], [60, 'મિનિટ']];
  for (const [secs, unit] of units) {
    if (Math.abs(diff) >= secs) return diff > 0 ? `${Math.floor(diff / secs)} ${unit} પહેલા` : `${Math.floor(-diff / secs)} ${unit} પછી`;
  }
  return 'હમણાં જ';
};
export const todayInput = () => new Date().toISOString().slice(0, 10);
export const monthName = (m) => ['જાન્યુઆરી', 'ફેબ્રુઆરી', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન', 'જુલાઈ', 'ઓગસ્ટ', 'સપ્ટેમ્બર', 'ઓક્ટોબર', 'નવેમ્બર', 'ડિસેમ્બર'][m - 1] || '';
export const dayName = (d) => ['રવિ', 'સોમ', 'મંગળ', 'બુધ', 'ગુરુ', 'શુક્ર', 'શનિ'][new Date(d).getDay()];
export const agesAgoText = (d) => (d ? `${Math.max(0, Math.floor((Date.now() - new Date(d)) / 31557600000))} વર્ષ` : '—');

/** Short Gujarati day names indexed 0=Sunday (used by shift weekly-off pickers). */
export const daysOfWeek = ['રવિ', 'સોમ', 'મંગળ', 'બુધ', 'ગુરુ', 'શુક્ર', 'શનિ'];
