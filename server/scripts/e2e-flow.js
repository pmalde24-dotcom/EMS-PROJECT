'use strict';
/**
 * EMS — end-to-end business flow test (repeatable / idempotent).
 *
 *   કર્મચારી બનાવો → લોગિન → હાજરી પંચ → રજા અરજી → મેનેજર મંજૂરી → HR મંજૂરી →
 *   પગાર સ્ટ્રક્ચર → પગાર રન (generate → approve → process → lock → mark-paid) →
 *   પે-સ્લિપ PDF → કર્મચારી પોતાની પે-સ્લિપ જુએ → સુરક્ષા → ઓડિટ લોગ
 *
 * Usage:
 *   npm run test:e2e                          (API on :4000, current month payroll)
 *   PAYROLL_MONTH=11 PAYROLL_YEAR=2026 npm run test:e2e   (fresh payroll period)
 *   API_URL=http://host:4000/api npm run test:e2e
 *
 * Notes:
 *  - Fixes a single test employee (chirag.patel.e2e@acmetech.example.com) so re-runs
 *    reuse it instead of piling up duplicates. Steps already completed on a previous
 *    run are reported as ⏭️ skip, not failure.
 *  - A payroll run is unique per (period, department). If the target period already has
 *    a run, the script reuses it; run it again with PAYROLL_MONTH=<free month> to
 *    exercise a brand-new payslip for the test employee.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_URL || 'http://127.0.0.1:4000/api';
const NEW_EMAIL = 'chirag.patel.e2e@acmetech.example.com';
const NEW_PASSWORD = 'Password@123';
const MONTH = Number(process.env.PAYROLL_MONTH || new Date().getMonth() + 1);
const YEAR = Number(process.env.PAYROLL_YEAR || new Date().getFullYear());
const PERIOD = `${YEAR}-${String(MONTH).padStart(2, '0')}`;

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];

const step = (n, name) => console.log(`\n▸ પગલું ${n}: ${name}`);
const ok = (msg, extra = '') => { pass++; console.log(`   ✅ ${msg}${extra ? ` — ${extra}` : ''}`); };
const bad = (msg, data) => {
  fail++;
  failures.push(msg);
  console.log(`   ❌ ${msg}`);
  if (data !== undefined) console.log(`      → ${JSON.stringify(data).slice(0, 300)}`);
};
const info = (msg) => console.log(`   ℹ️  ${msg}`);
const skipped = (msg) => { skip++; console.log(`   ⏭️  ${msg}`); };

async function api(method, path_, { token, body, raw = false } = {}) {
  const res = await fetch(BASE + path_, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, ...json };
}

async function login(email, password, label) {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (!r.data?.accessToken) throw new Error(`${label}: લોગિન નિષ્ફળ (${r.status}) — ${r.message || 'ટોકન મળ્યો નથી'}`);
  ok(`${label} લોગિન`, email);
  return r.data.accessToken;
}

const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const T0 = (a, b) => (a && b ? (((new Date(b) - new Date(a)) / 3600000) - 0).toFixed(2) + 'h' : '—');

(async () => {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  EMS — સંપૂર્ણ બિઝનેસ ફ્લો ટેસ્ટ (E2E)');
  console.log(`  API: ${BASE}   |   પગાર સમયગાળો: ${PERIOD}`);
  console.log('══════════════════════════════════════════════════════════');

  /* 0 ── Health */
  step(0, 'API સ્વાસ્થ્ય');
  const health = await api('GET', '/health');
  health.success ? ok('API ચાલુ છે', `uptime ${health.data?.uptime ?? '?'}s`) : bad('API ડાઉન છે', health);

  /* 1 ── Super admin login + master data */
  step(1, 'સુપર એડમિન લોગિન અને માસ્ટર ડેટા');
  const admin = await login('superadmin@company.com', 'SuperAdmin@123', 'સુપર એડમિન');
  const ref = await api('GET', '/settings/reference-data', { token: admin });
  const departments = ref.data?.departments || [];
  const designations = ref.data?.designations || [];
  const leaveTypes = ref.data?.leaveTypes || [];
  departments.length && designations.length
    ? ok('માસ્ટર ડેટા મળ્યો', `${departments.length} ડિપાર્ટમેન્ટ, ${designations.length} હોદ્દા, ${leaveTypes.length} રજા પ્રકાર`)
    : bad('માસ્ટર ડેટા ખાલી', ref.message);

  /* 2 ── Employee (create or reuse) */
  step(2, 'કર્મચારી બનાવો (login સાથે)');
  const byEmail = await api('GET', `/employees?q=${encodeURIComponent(NEW_EMAIL)}&limit=5`, { token: admin });
  let employee = (byEmail.data || []).find((e) => e.email === NEW_EMAIL);

  const mgrList = await api('GET', `/employees?q=${encodeURIComponent('vikram.shah')}&limit=5`, { token: admin });
  const manager = (mgrList.data || []).find((e) => e.email === 'vikram.shah@acmetech.example.com');
  if (!manager) bad('મેનેજર (vikram.shah) શોધમાં મળ્યા નથી — 2-સ્તરીય ચેન ચકાસી શકાશે નહીં');

  if (!employee) {
    const created = await api('POST', '/employees', {
      token: admin,
      body: {
        firstName: 'Chirag', lastName: 'Patel (E2E)', email: NEW_EMAIL,
        phone: '+91 98250 12345', dateOfBirth: '1995-04-12', gender: 'male', maritalStatus: 'single',
        joiningDate: d(0), employmentType: 'full_time', employmentStatus: 'probation', employeeCategory: 'probationer',
        department: departments[0]?._id, designation: designations[0]?._id,
        reportingManager: manager?._id, teamLeader: manager?._id,
        workLocation: 'Ahmedabad HQ', probationEndDate: d(90), noticePeriodDays: 30,
        address: { line1: '12, Satellite Road', city: 'Ahmedabad', state: 'Gujarat', country: 'India', pincode: '380015' },
        emergencyContact: { name: 'Meera Patel', relationship: 'Mother', phone: '+91 99000 11111' },
        password: NEW_PASSWORD, role: 'employee', sendWelcomeEmail: false,
      },
    });
    if ((created.status === 201 || created.success) && created.data?.employee?._id) {
      employee = created.data.employee;
      ok('કર્મચારી + લોગિન બન્યાં (auto-provision)', `${employee.firstName} ${employee.lastName} · ${employee.employeeId}`);
      info(`login: ${created.data.login?.email} · role: ${created.data.login?.role} · tempPassword: ${created.data.login?.temporaryPassword || '(set by request)'}`);
    } else bad('કર્મચારી બનાવવામાં નિષ્ફળ', created.message || created);
  } else info(`કર્મચારી પહેલેથી હાજર: ${employee.firstName} ${employee.lastName} · ${employee.employeeId}`);
  const empId = employee?._id;
  if (!empId) throw new Error('કર્મચારી ID ન મળ્યું — આગળ ચાલી શકાય નહીં');
  if (manager && String(employee.reportingManager?._id || employee.reportingManager || '') !== String(manager._id)) {
    const link = await api('PATCH', `/employees/${empId}`, { token: admin, body: { reportingManager: manager._id, teamLeader: manager._id } });
    link.success ? ok('રિપોર્ટિંગ મેનેજર જોડ્યા', `${manager.firstName} ${manager.lastName} — રજા ચેન 2-સ્તરીય બનશે`) : info(`મેનેજર લિંક કરી શકાઈ નહીં: ${link.message}`);
  } else if (manager) info('રિપોર્ટિંગ મેનેજર પહેલેથી જોડાયેલા છે');

  /* 3 ── Ensure the login is linked to the employee */
  step(3, 'લોગિન ↔ કર્મચારી લિંક ચકાસો');
  const usersFound = await api('GET', `/users?search=${encodeURIComponent(NEW_EMAIL)}&limit=5`, { token: admin });
  const testUser = (usersFound.data || []).find((u) => u.email === NEW_EMAIL);
  const linkedId = testUser?.employee?._id || testUser?.employee;
  if (testUser && String(linkedId || '') !== String(empId)) {
    const fix = await api('PATCH', `/users/${testUser._id}`, { token: admin, body: { employee: empId } });
    fix.success ? ok('લિંક સુધારી', `user ${NEW_EMAIL} → employee ${employee.employeeId}`) : bad('લિંક સુધારી શકાઈ નહીં', fix.message);
  } else if (testUser) ok('લોગિન કર્મચારી સાથે જોડાયેલું છે', `user: ${testUser.role}`);
  else {
    const u = await api('POST', '/users', { token: admin, body: { name: `${employee.firstName} ${employee.lastName}`, email: NEW_EMAIL, password: NEW_PASSWORD, role: 'employee', employee: empId } });
    u.success ? ok('લોગિન બન્યું (fallback)', NEW_EMAIL) : bad('લોગિન બનાવી શકાયું નહીં', u.message);
  }

  /* 4 ── Employee login */
  step(4, 'કર્મચારી તરીકે લોગિન');
  const empToken = await login(NEW_EMAIL, NEW_PASSWORD, 'કર્મચારી');

  /* 5 ── Attendance */
  step(5, 'હાજરી — પંચ ઇન / પંચ આઉટ');
  const punchIn = await api('POST', '/attendance/punch-in', { token: empToken, body: { workFromHome: false, remarks: 'E2E test punch-in' } });
  if (punchIn.success) ok('પંચ ઇન', punchIn.message);
  else if (/already|checked in|પહેલ/i.test(`${punchIn.message} ${punchIn.error || ''}`)) skipped(`આજે પહેલેથી પંચ ઇન — ${punchIn.message}`);
  else bad('પંચ ઇન નિષ્ફળ', punchIn.message || punchIn);

  const punchOut = await api('POST', '/attendance/punch-out', { token: empToken, body: { remarks: 'E2E test punch-out' } });
  if (punchOut.success) ok('પંચ આઉટ', punchOut.message);
  else if (/not checked in|already|પહેલ/i.test(`${punchOut.message} ${punchOut.error || ''}`)) skipped(`પંચ આઉટ સ્થિતિ: ${punchOut.message}`);
  else bad('પંચ આઉટ નિષ્ફળ', punchOut.message || punchOut);

  const today = await api('GET', '/attendance/me/today', { token: empToken });
  const rec = today.data?.record;
  (today.data?.date && rec)
    ? ok('આજની હાજરી રેકોર્ડ મળ્યો', `${today.data.date} · સ્થિતિ: ${rec.status ?? '—'} · પંચ ઇન: ${String(rec.checkIn || '—').slice(11, 16)} · પંચ આઉટ: ${String(rec.checkOut || '—').slice(11, 16)} · કલાક: ${rec.workedHours ?? T0(rec.checkIn, rec.checkOut)}`)
    : bad('આજની હાજરી મળી નથી', today.message);

  /* 6 ── Leave request */
  step(6, 'રજા અરજી કરો');
  const lt = leaveTypes.find((t) => /casual|paid|earned/i.test(t.name)) || leaveTypes[0];
  const existingReq = await api('GET', `/leave/requests?employee=${empId}&limit=50`, { token: admin });
  const busy = new Set();
  (existingReq.data || []).forEach((r) => {
    if (!['pending', 'manager_approved', 'hr_approved', 'approved'].includes(r.status)) return;
    const a = new Date(r.startDate); const b = new Date(r.endDate);
    for (let t = a.getTime(); t <= b.getTime(); t += 86400000) busy.add(new Date(t).toISOString().slice(0, 10));
  });
  let leaveId = null; let start = null; let end = null; let reqDoc = null;
  for (let offset = 12; offset < 90 && !leaveId; offset += 2) {
    start = d(offset); end = d(offset + 1);
    if (busy.has(start) || busy.has(end)) continue;
    const leaveReq = await api('POST', '/leave/requests', {
      token: empToken,
      body: { leaveType: lt?._id, startDate: start, endDate: end, reason: 'કૌટુંબિક કારણોસર રજા જોઈએ છે (E2E સ્વયં-ચકાસણી)' },
    });
    if (leaveReq.success || leaveReq.status === 201) {
      reqDoc = leaveReq.data?.request || leaveReq.data;
      leaveId = reqDoc?._id || null;
      ok('રજા અરજી બની', `${lt?.name} · ${start} → ${end} · સ્થિતિ: ${reqDoc?.status} · બાકી બેલેન્સ: ${leaveReq.data?.balance?.available ?? '—'}`);
      const chain = (reqDoc?.approvals || []).map((a) => `L${a.level}:${a.approverRole || a.role || '?'}`);
      if (chain.length) info(`મંજૂરી ચેન: ${chain.join(' → ')}`);
    } else if (/insufficient|balance/i.test(leaveReq.message || '')) {
      skipped(`બેલેન્સ ખતમ — ${leaveReq.message}`);
      break;
    } else if (!/overlap/i.test(leaveReq.message || '')) {
      bad('રજા અરજી નિષ્ફળ', leaveReq.message || leaveReq);
      break;
    }
  }
  if (!leaveId && !fail) info('કોઈ મુક્ત વિન્ડો મળી નથી — જૂની અરજી વપરાશે');

  /* 7-8 ── Multi-level approval (reporting manager → HR) */
  step(7, 'રજા મંજૂરી — સ્તર 1: મેનેજર, સ્તર 2: HR');
  if (!leaveId) {
    skipped('અરજી ID નથી — મંજૂરી પગલાં છોડ્યાં');
  } else {
    const first = await api('GET', `/leave/requests/${leaveId}`, { token: admin });
    let status = first.data?.status;
    if (status === 'approved') skipped('રજા પહેલેથી સંપૂર્ણ મંજૂર');
    let mgrToken = null; let hrToken = null; let level = 0;
    while (['pending', 'manager_approved', 'hr_approved'].includes(status) && level < 4) {
      level += 1;
      if (!mgrToken) mgrToken = await login('vikram.shah@acmetech.example.com', 'Password@123', 'ડિપાર્ટમેન્ટ મેનેજર');
      let r = await api('POST', `/leave/requests/${leaveId}/approve`, { token: mgrToken, body: { comment: `E2E — સ્તર ${level} મંજૂરી` } });
      let by = 'ડિપાર્ટમેન્ટ મેનેજર';
      if (!r.success && /HR approval required|not authorised|forbidden/i.test(String(r.message || ''))) {
        if (!hrToken) hrToken = await login('kavita.nair@acmetech.example.com', 'Password@123', 'HR એડમિન');
        r = await api('POST', `/leave/requests/${leaveId}/approve`, { token: hrToken, body: { comment: `E2E — સ્તર ${level} મંજૂરી (HR)` } });
        by = 'HR એડમિન';
      }
      if (r.success) { ok(`સ્તર ${level} મંજૂર — ${by}`, `હવે: ${r.data?.status}`); status = r.data?.status || status; }
      else { bad(`સ્તર ${level} મંજૂરી નિષ્ફળ (${by})`, r.message || r); break; }
    }
    const final = await api('GET', `/leave/requests/${leaveId}`, { token: admin });
    const chain = (final.data?.approvals || []).map((a) => `L${a.level}:${a.status}${a.approverName ? ` (${a.approverName})` : ''}`);
    (final.data?.status === 'approved')
      ? ok('રજા આખરે મંજૂર', `${String(final.data.startDate).slice(0, 10)} → ${String(final.data.endDate).slice(0, 10)} · ${final.data.totalDays ?? ''} દિવસ${chain.length ? ` · ચેન: ${chain.join(' → ')}` : ''}`)
      : bad(`રજા મંજૂર થઈ નથી (સ્થિતિ: ${final.data?.status})`);
  }

  /* 9 ── Leave balance */
  step(9, 'રજા બેલેન્સ ચકાસો');
  const bal = await api('GET', '/leave/balances/me', { token: empToken });
  const rows = bal.data?.balances || (Array.isArray(bal.data) ? bal.data : []);
  const row = rows.find((b) => String(b.leaveType?._id || b.leaveType) === String(lt?._id)) || rows[0];
  row ? ok('બેલેન્સ રેકોર્ડ મળ્યો', `${row.leaveType?.name || lt?.name}: કુલ ${row.allocated ?? row.total ?? '—'} · વપરાયું ${row.used ?? '—'} · બાકી ${row.remaining ?? row.balance ?? '—'}`)
    : bad('બેલેન્સ મળ્યું નથી', bal.message);

  /* 10 ── Salary structure */
  step(10, 'ટેસ્ટ કર્મચારીનું પગાર સ્ટ્રક્ચર');
  const existingStruct = await api('GET', `/payroll/structures/current/${empId}`, { token: admin });
  if (existingStruct.success) skipped(`સ્ટ્રક્ચર પહેલેથી હાજર — માસિક ગ્રોસ ₹${existingStruct.data?.structure?.grossMonthly}`);
  else {
    const struct = await api('POST', '/payroll/structures', {
      token: admin,
      body: { employee: empId, effectiveFrom: d(0), ctcAnnual: 720000, basic: 30000, hra: 12000, specialAllowance: 8000, conveyance: 1600, medicalAllowance: 1250, lta: 5000 },
    });
    struct.success ? ok('સ્ટ્રક્ચર બન્યું', `માસિક ગ્રોસ ≈ ₹${struct.data?.grossMonthly ?? struct.data?.structure?.grossMonthly ?? '—'}`) : bad('સ્ટ્રક્ચર નિષ્ફળ', struct.message || struct);
  }

  /* 11 ── Payroll run lifecycle */
  step(11, `પગાર રન ${PERIOD} — generate → approve → process → lock → paid`);
  let runId = null; let runReused = false;
  const gen = await api('POST', '/payroll/runs/generate', { token: admin, body: { month: MONTH, year: YEAR, notes: 'E2E ટેસ્ટ રન' } });
  if (gen.status === 201 && gen.data?.run?._id) {
    runId = gen.data.run._id;
    ok('રન બન્યો', `${gen.data.generated} પે-સ્લિપ · net ₹${Number(gen.data.run.totalNet).toLocaleString('en-IN')}${gen.data.skipped?.length ? ` · ${gen.data.skipped.length} છોડ્યા` : ''}`);
    for (const action of [['approve', { note: 'E2E approval' }], ['process', {}], ['lock', { note: 'E2E lock' }], ['mark-paid', { paymentReference: 'E2E-NEFT-0001', paymentMode: 'bank_transfer', paidOn: d(0) }]]) {
      const r = await api('POST', `/payroll/runs/${runId}/${action[0]}`, { token: admin, body: action[1] });
      r.success ? ok(`રન ક્રિયા: ${action[0]}`, r.data?.status) : bad(`રન ક્રિયા નિષ્ફળ: ${action[0]}`, r.message || r);
    }
  } else if (gen.status === 409 || /already exists/i.test(gen.message || '')) {
    runReused = true;
    const runs = await api('GET', `/payroll/runs?year=${YEAR}&month=${MONTH}&limit=10`, { token: admin });
    const existingRun = (runs.data || []).find((r) => !r.department) || (runs.data || [])[0];
    runId = existingRun?._id || null;
    skipped(`સમયગાળા ${PERIOD} નો રન પહેલેથી હાજર (સ્થિતિ: ${existingRun?.status}) — જીવનચક્ર પગલાં છોડ્યાં`);
    info('નવા પે-સ્લિપ સાથે પૂરો ટેસ્ટ કરવા: PAYROLL_MONTH=11 npm run test:e2e');
  } else bad('પગાર રન બન્યો નથી', gen.message || gen);

  /* 12 ── Payslip + PDF */
  step(12, 'પે-સ્લિપ અને PDF ડાઉનલોડ');
  const slips = await api('GET', `/payroll/payslips?period=${PERIOD}&employee=${empId}&limit=5`, { token: admin });
  const slip = (slips.data || [])[0];
  if (slip) {
    ok('ટેસ્ટ કર્મચારીની પે-સ્લિપ મળી', `${slip.period} · ગ્રોસ ₹${slip.grossEarnings} · કપાત ₹${slip.totalDeductions} · net ₹${slip.netPay}`);
    const pdfRes = await api('GET', `/payroll/payslips/${slip._id}/pdf`, { token: admin, raw: true });
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    const isPdf = buf.slice(0, 5).toString() === '%PDF-';
    if (pdfRes.status === 200 && isPdf) {
      const outPath = path.resolve(__dirname, '../../sample-payslip.pdf');
      fs.writeFileSync(outPath, buf);
      ok('PDF ડાઉનલોડ થયું', `${(buf.length / 1024).toFixed(1)} KB → ems/sample-payslip.pdf`);
    } else bad('PDF બન્યું નથી', `status ${pdfRes.status}, bytes ${buf.length}`);
  } else if (runReused) skipped(`સમયગાળા ${PERIOD} માં આ કર્મચારીની પે-સ્લિપ નથી (રન પહેલેથી હતો) — PAYROLL_MONTH=11 સાથે ચલાવો`);
  else bad(`પે-સ્લિપ મળી નથી (રન: ${runId ? 'બન્યો હતો' : 'બન્યો નથી'})`, slips.message);

  /* 13 ── Employee sees own payslip */
  step(13, 'કર્મચારી પોતાની પે-સ્લિપ જુએ (સેલ્ફ-સર્વિસ)');
  const mine = await api('GET', '/payroll/payslips?limit=5', { token: empToken });
  (mine.data || []).length ? ok('કર્મચારીને પોતાની પે-સ્લિપ દેખાય છે', `${(mine.data || []).length} પે-સ્લિપ (સ્કોપ સાચું લાગુ)`) : (runReused ? skipped('સેલ્ફ-સર્વિસ યાદી ખાલી (આ સમયગાળામાં પે-સ્લિપ નથી)') : bad('કર્મચારીને પોતાની પે-સ્લિપ દેખાતી નથી'));

  /* 14 ── Security: employee cannot approve */
  step(14, 'સુરક્ષા — કર્મચારી મંજૂરી કરી શકે નહીં');
  const forbidden = await api('POST', `/leave/requests/${leaveId}/approve`, { token: empToken, body: {} });
  forbidden.status === 403 ? ok('403 મળ્યું — permission સર્વર-સાઇડ બ્લોક થઈ', forbidden.message) : bad(`અનપેક્ષિત: HTTP ${forbidden.status}`, forbidden.message);

  /* 15 ── Audit trail */
  step(15, 'ઓડિટ લોગમાં નોંધાયું?');
  const audit = await api('GET', '/audit?limit=120', { token: admin });
  const rowsA = audit.data || [];
  const hasPayroll = rowsA.some((a) => /payroll\.(generate|process|lock|mark_paid)/.test(a.action));
  const hasLeave = rowsA.some((a) => /leave\.(approve|create)/.test(a.action));
  const hasEmp = rowsA.some((a) => /employee\.create/.test(a.action));
  hasEmp ? ok('કર્મચારી-નિર્માણ ઓડિટમાં') : info('કર્મચારી પહેલેથી હતો — employee.create એન્ટ્રી નથી (નવી દોડમાં દેખાશે)');
  hasLeave ? ok('રજાની ક્રિયાઓ ઓડિટમાં') : bad('રજાની ઓડિટ એન્ટ્રી મળી નથી');
  hasPayroll ? ok('પગારની ક્રિયાઓ ઓડિટમાં') : bad('પગારની ઓડિટ એન્ટ્રી મળી નથી');

  /* Summary */
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  પરિણામ:  ✅ ${pass} પાસ   ⏭️ ${skip} છોડ્યાં   ❌ ${fail} નિષ્ફળ`);
  if (failures.length) { console.log('  નિષ્ફળ પગલાં:'); failures.forEach((f) => console.log('   •', f)); }
  console.log('══════════════════════════════════════════════════════════');
  console.log(`\n  ટેસ્ટ કર્મચારી: ${NEW_EMAIL} / ${NEW_PASSWORD}`);
  console.log('  UI માં લોગિન કરીને બધું જાતે જોઈ/ચકાસી શકાય.\n');
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('\n💥 ટેસ્ટ અટકી ગયો:', err.message);
  process.exit(2);
});
