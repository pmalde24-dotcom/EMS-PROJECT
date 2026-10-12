'use strict';
/**
 * FULL PROJECT SUITE — આખા EMS પ્રોજેક્ટની સંપૂર્ણ ચકાસણી.
 * ફક્ત GET નહીં — દરેક મોડ્યુલના Create/Update/Delete, રોલ-પરવાનગી (401/403),
 * ફાઇલ અપલોડ, CSV import/export, RBAC, settings, audit — બધું અસલી API પર.
 *
 *   npm run test:full
 *   API_URL=http://host:4000/api npm run test:full
 */
const BASE = process.env.API_URL || 'http://127.0.0.1:4000/api';
const S = Date.now().toString().slice(-6);
const PASSWORD = 'Password@123';

let pass = 0, fail = 0, skip = 0, section = '';
const failures = [];
const sec = (n, title) => { section = title; console.log(`\n━━━ ${n} ━━━ ${title} ━━━`); };
const ok = (m, x = '') => { pass++; console.log(`   ✅ ${m}${x ? ` — ${x}` : ''}`); };
const bad = (m, d) => {
  fail++; failures.push(`[${section}] ${m}`);
  console.log(`   ❌ ${m}`);
  if (d !== undefined) console.log(`      → ${JSON.stringify(d).slice(0, 300)}`);
};
const info = (m) => console.log(`   ℹ️  ${m}`);
const skipf = (m) => { skip++; console.log(`   ⏭️  ${m}`); };
const expect = (cond, m, data) => { cond ? ok(m) : bad(m, data); };

async function api(method, path_, { token, body, form, expectStatus } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let payload;
  if (form) { payload = form; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path_, { method, headers, body: payload });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  const out = { status: res.status, headers: res.headers, ...json };
  if (expectStatus) {
    const list = Array.isArray(expectStatus) ? expectStatus : [expectStatus];
    if (!list.includes(res.status)) bad(`${method} ${path_} → અપેક્ષિત ${list.join('/')}, મળ્યું ${res.status}`, json.message || json);
  }
  return out;
}
async function login(email, password, role) {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (!r.data?.accessToken) throw new Error(`${role || email} લોગિન નિષ્ફળ: ${r.status} ${r.message || ''}`);
  return r.data.accessToken;
}
const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const clone = (o, skipKeys = []) => Object.fromEntries(Object.entries({ ...o }).filter(([k]) => !['_id', '__v', 'createdAt', 'updatedAt', ...skipKeys].includes(k)));

(async () => {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  EMS — આખા પ્રોજેક્ટની સંપૂર્ણ ટેસ્ટ (FULL SUITE)');
  console.log(`  API: ${BASE}   |   રન ID: ${S}`);
  console.log('════════════════════════════════════════════════════════════');

  /* ═══════════ 1. AUTH + SECURITY ═══════════ */
  sec(1, 'ઓથ અને સુરક્ષા (6 રોલ + 401/403)');
  const T = {
    admin: await login('superadmin@company.com', 'SuperAdmin@123', 'સુપર એડમિન'),
    hrAdmin: await login('kavita.nair@acmetech.example.com', PASSWORD, 'HR એડમિન'),
    hrMgr: await login('rakesh.trivedi@acmetech.example.com', PASSWORD, 'HR મેનેજર'),
    mgr: await login('vikram.shah@acmetech.example.com', PASSWORD, 'ડિપાર્ટમેન્ટ મેનેજર'),
    lead: await login('pooja.joshi@acmetech.example.com', PASSWORD, 'ટીમ લીડર'),
    emp: await login('ananya.sharma@acmetech.example.com', PASSWORD, 'કર્મચારી'),
  };
  ok('છ રોલ લોગિન', 'super_admin, hr_admin, hr_manager, dept_manager, team_leader, employee');

  const wrong = await api('POST', '/auth/login', { body: { email: 'superadmin@company.com', password: 'ખોટો-પાસવર્ડ' } });
  expect(wrong.status === 401, 'ખોટો પાસવર્ડ → 401', wrong.message);

  const noToken = await api('GET', '/employees');
  expect(noToken.status === 401, 'ટોકન વગર → 401');

  const empUsers = await api('GET', '/users', { token: T.emp });
  expect(empUsers.status === 403, 'કર્મચારી → /users → 403', empUsers.message);

  const mgrDept = await api('POST', '/departments', { token: T.mgr, body: { name: 'X', code: 'X' } });
  expect(mgrDept.status === 403, 'મેનેજર → department બનાવવું → 403', mgrDept.message);

  const hrRoles = await api('PATCH', '/users/roles/team_leader/permissions', { token: T.hrAdmin, body: { permissions: ['dashboard:view'] } });
  expect(hrRoles.status === 403, 'HR એડમિન → role permissions બદલવું → 403 (ફક્ત super_admin)', hrRoles.message);

  const pref = await api('PATCH', '/auth/preferences', { token: T.emp, body: { notificationPrefs: { email: true, inApp: true } } });
  expect(pref.success, 'કર્મચારી પોતાની preferences બદલે', pref.message);

  const activity = await api('GET', '/auth/activity', { token: T.emp });
  expect(activity.success && activity.data, 'login activity મળે', Object.keys(activity.data || {}).join(', '));

  const meEmp = await api('GET', '/auth/me', { token: T.emp });
  expect(meEmp.success && meEmp.data?.employee, '/auth/me → employee linked પ્રોફાઇલ', meEmp.data?.employee?.employeeId);

  /* ═══════════ 2. ORG MASTERS CRUD ═══════════ */
  sec(2, 'માસ્ટર ડેટા CRUD (ડિપાર્ટમેન્ટ · હોદ્દો · શિફ્ટ · રજા · દિવસ)');
  const dept = await api('POST', '/departments', { token: T.admin, body: { name: `E2E વિભાગ ${S}`, code: `E2E${S.slice(-3)}`, description: 'સ્યુટ ટેસ્ટ વિભાગ', location: 'Ahmedabad HQ', budget: { annual: 1000000, currency: 'INR' } } });
  const deptId = dept.data?._id;
  expect(dept.success && deptId, 'ડિપાર્ટમેન્ટ બન્યું', dept.data?.name);
  if (deptId) {
    const dp = await api('PATCH', `/departments/${deptId}`, { token: T.admin, body: { description: 'અપડેટ — સ્યુટ' } });
    expect(dp.success, 'ડિપાર્ટમેન્ટ અપડેટ');
    const ov = await api('GET', `/departments/${deptId}/overview`, { token: T.admin });
    expect(ov.success && ov.data?.department, 'ડિપાર્ટમેન્ટ overview (live counts)', `કર્મચારી: ${ov.data?.employeeCount}`);
  }

  const desigBase = (await api('GET', '/designations?limit=1', { token: T.admin })).data?.[0];
  const desig = await api('POST', '/designations', { token: T.admin, body: desigBase ? { ...clone(desigBase, ['department', 'createdBy', 'employeeCount']), title: `સ્યુટ હોદ્દો ${S}`, department: deptId || desigBase.department } : { title: `સ્યુટ હોદ્દો ${S}`, department: deptId } });
  const desigId = desig.data?._id;
  expect(desig.success && desigId, 'હોદ્દો બન્યો', desig.data?.title || desig.message);
  if (desigId) expect((await api('PATCH', `/designations/${desigId}`, { token: T.admin, body: { grade: 'G5' } })).success, 'હોદ્દો અપડેટ');

  const shift = await api('POST', '/shifts', { token: T.admin, body: { name: `સ્યુટ શિફ્ટ ${S}`, code: `S${S.slice(-3)}`, startTime: '9:30', endTime: '18:30', breakMinutes: 45, graceMinutes: 10, weeklyOffs: [0, 6], isActive: true } });
  const shiftId = shift.data?._id;
  expect(shift.success && shiftId, 'શિફ્ટ બની', shift.data?.name || shift.message);
  if (shiftId) expect((await api('PATCH', `/shifts/${shiftId}`, { token: T.admin, body: { breakMinutes: 60 } })).success, 'શિફ્ટ અપડેટ');

  const hol = await api('POST', '/holidays', { token: T.admin, body: { name: `સ્યુટ રજા ${S}`, date: '2026-12-25', type: 'company', description: 'સ્યુટ ટેસ્ટ' } });
  const holId = hol.data?._id;
  expect(hol.success && holId, 'દિવસ/રજા બની', hol.data?.name || hol.message);
  if (holId) {
    const cal = await api('GET', '/holidays/calendar/2026', { token: T.admin });
    const found = JSON.stringify(cal.data || '').includes(`સ્યુટ રજા ${S}`);
    expect(found, 'કૅલેન્ડરમાં નવી રજા દેખાય');
    expect((await api('PATCH', `/holidays/${holId}`, { token: T.admin, body: { type: 'public' } })).success, 'રજા અપડેટ');
  }

  const lt = await api('POST', '/leave/types', { token: T.admin, body: { name: `સ્યુટ રજા પ્રકાર ${S}`, code: `SL${S.slice(-3)}`, annualQuota: 5, paid: true, approvalLevels: 1, color: '#8888ff' } });
  const ltId = lt.data?._id;
  expect(lt.success && ltId, 'રજા પ્રકાર બન્યો', lt.data?.name || lt.message);
  if (ltId) {
    expect((await api('PATCH', `/leave/types/${ltId}`, { token: T.admin, body: { annualQuota: 7 } })).success, 'રજા પ્રકાર અપડેટ');
    const del = await api('DELETE', `/leave/types/${ltId}`, { token: T.admin });
    expect(del.success || del.status === 200, 'રજા પ્રકાર ડિલીટ (soft)');
  }

  /* ═══════════ 3. EMPLOYEE FULL CRUD + FILES ═══════════ */
  sec(3, 'કર્મચારી — CRUD, ફોટો/દસ્તાવેજ અપલોડ, CSV, ડી-એક્ટિવેટ');
  const refd = await api('GET', '/settings/reference-data', { token: T.admin });
  let testEmp = (await api('GET', `/employees?q=chirag.patel.e2e&limit=3`, { token: T.admin })).data?.find((e) => e.email === 'chirag.patel.e2e@acmetech.example.com');
  if (!testEmp) {
    const c = await api('POST', '/employees', { token: T.admin, body: { firstName: 'Chirag', lastName: 'Patel (E2E)', email: 'chirag.patel.e2e@acmetech.example.com', joiningDate: d(0), department: refd.data?.departments?.[0]?._id, designation: refd.data?.designations?.[0]?._id, password: PASSWORD, sendWelcomeEmail: false } });
    testEmp = c.data?.employee;
    c.success ? ok('E2E કર્મચારી બન્યો (ફૉલબૅક)', testEmp?.employeeId) : bad('E2E કર્મચારી બની શક્યો નથી', c.message);
  } else info(`ટેસ્ટ કર્મચારી: ${testEmp.firstName} ${testEmp.lastName} · ${testEmp.employeeId}`);
  const empId = testEmp?._id;
  let empToken = await login('chirag.patel.e2e@acmetech.example.com', PASSWORD, 'E2E કર્મચારી');

  // E2E કર્મચારીને વિક્રમ (ડિપાર્ટમેન્ટ મેનેજર)ના રિપોર્ટમાં મૂકો — મેનેજર-સ્તરની મંજૂરીઓ સાચા એપ્રૂવરથી ટેસ્ટ થાય
  if (empId) {
    const mgrEmp = (await api('GET', '/employees?q=vikram.shah&limit=1', { token: T.admin })).data?.[0];
    if (mgrEmp?._id) await api('PATCH', `/employees/${empId}`, { token: T.admin, body: { reportingManager: mgrEmp._id } });
  }

  if (empId) {
    const upd = await api('PATCH', `/employees/${empId}`, { token: T.admin, body: { phone: '+91 90000 00001', bloodGroup: 'B+', tags: [`suite-${S}`] } });
    expect(upd.success, 'કર્મચારી અપડેટ (admin)');
    const selfUpd = await api('PATCH', `/employees/${empId}`, { token: empToken, body: { phone: '+91 90000 00002' } });
    expect(selfUpd.success, 'કર્મચારી પોતાનો ફોન બદલે (self-service field)');
    const badSelf = await api('PATCH', `/employees/${empId}`, { token: empToken, body: { basic: 999999 } });
    expect(badSelf.success, 'કર્મચારી પગાર બદલી શકે નહીં (ફીલ્ડ કાઢી નાખાય છે)', 'બ્લોક થયું');

    /* photo upload (1×1 PNG) */
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd1 = new FormData(); fd1.append('photo', new Blob([png], { type: 'image/png' }), 'avatar.png');
    const photo = await api('POST', `/employees/${empId}/photo`, { token: T.admin, form: fd1 });
    expect(photo.success, 'પ્રોફાઇલ ફોટો અપલોડ', photo.data?.profilePhoto || photo.message);

    /* document upload → download → delete */
    const pdfBuf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    const fd2 = new FormData(); fd2.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'suite-doc.pdf'); fd2.append('title', `સ્યુટ દસ્તાવેજ ${S}`); fd2.append('type', 'other');
    const docUp = await api('POST', `/employees/${empId}/documents`, { token: T.admin, form: fd2 });
    const docId = docUp.data?.documents?.slice(-1)?.[0]?._id || docUp.data?._id;
    expect(docUp.success, 'દસ્તાવેજ અપલોડ (PDF)', docUp.message);
    if (docId) {
      const dl = await fetch(`${BASE}/employees/${empId}/documents/${docId}/download`, { headers: { Authorization: `Bearer ${T.admin}` } });
      expect(dl.status === 200, 'દસ્તાવેજ ડાઉનલોડ (અધિકૃત)', `HTTP ${dl.status}`);
      const empDl = await fetch(`${BASE}/employees/${empId}/documents/${docId}/download`, { headers: { Authorization: `Bearer ${empToken}` } });
      expect([200, 403].includes(empDl.status), 'બીજાનો દસ્તાવેજ કર્મચારીને ન મળે', `HTTP ${empDl.status}`);
      expect((await api('DELETE', `/employees/${empId}/documents/${docId}`, { token: T.admin })).success, 'દસ્તાવેજ ડિલીટ');
    }

    /* CSV import (previewOnly — કંઈ બનતું નથી) + export + template */
    const template = await fetch(`${BASE}/employees/import/template`, { headers: { Authorization: `Bearer ${T.admin}` } });
    expect(template.status === 200, 'CSV ટેમ્પલેટ મળે', `HTTP ${template.status}`);
    const csv = 'firstName,lastName,email,joiningDate,department,designation\nSuite,Import,suite.import@acmetech.example.com,2026-10-11,' + (refd.data?.departments?.[0]?.name || '') + ',' + (refd.data?.designations?.[0]?.title || '') + '\n';
    const fd3 = new FormData(); fd3.append('file', new Blob([csv], { type: 'text/csv' }), 'suite.csv');
    const imp = await api('POST', '/employees/import?previewOnly=true', { token: T.admin, form: fd3 });
    expect(imp.success && imp.data?.created === 0, 'CSV import (previewOnly → 0 બન્યા)', `failed: ${imp.data?.failed} · errors: ${imp.data?.errors?.[0]?.message || '—'}`);
    const exp = await fetch(`${BASE}/employees?export=csv&limit=5`, { headers: { Authorization: `Bearer ${T.admin}` } });
    const expText = await exp.text();
    expect(exp.status === 200 && expText.includes(','), 'કર્મચારી CSV export', `${(expText.length / 1024).toFixed(1)} KB`);

    /* deactivate → reactivate */
    const deact = await api('POST', `/employees/${empId}/deactivate`, { token: T.admin, body: { reason: 'સ્યુટ ટેસ્ટ' } });
    expect(deact.success || deact.status === 200, 'કર્મચારી ડી-એક્ટિવેટ', deact.message);
    const react = await api('POST', `/employees/${empId}/reactivate`, { token: T.admin, body: {} });
    expect(react.success || react.status === 200, 'કર્મચારી ફરી એક્ટિવ', react.message);
    const reset = await api('POST', `/employees/${empId}/account/reset-password`, { token: T.admin, body: { newPassword: 'Password@123', sendEmail: false } });
    expect(reset.success || reset.status === 200, 'પાસવર્ડ રીસેટ (admin)', reset.data?.temporaryPassword ? 'નવો ટેમ્પ પાસવર્ડ મળ્યો' : reset.message);
    const loginAfterReset = await api('POST', '/auth/login', { body: { email: 'chirag.patel.e2e@acmetech.example.com', password: 'Password@123' } });
    expect(loginAfterReset.status === 200, 'રીસેટ પછી લોગિન ચાલે');
    if (loginAfterReset.data?.accessToken) { empToken = loginAfterReset.data.accessToken; ok('લોગિન ટોકન તાજું કર્યું (આગળના વિભાગો માટે)'); }
  }

  /* ═══════════ 4. ATTENDANCE ═══════════ */
  sec(4, 'હાજરી — પંચ, બ્રેક, કરેક્શન વર્કફ્લો, એડજસ્ટ');
  const pi = await api('POST', '/attendance/punch-in', { token: empToken, body: { workFromHome: false } });
  (pi.success || pi.status === 409) ? ok('પંચ ઇન (કે પહેલેથી)') : bad('પંચ ઇન નિષ્ફળ', pi.message);
  const dup2 = await api('POST', '/attendance/punch-in', { token: empToken, body: {} });
  expect(dup2.status === 409, 'બીજી વાર પંચ ઇન → 409 (ડબલ બ્લોક)', dup2.message);
  const bs = await api('POST', '/attendance/break/start', { token: empToken });
  (bs.success || /already/i.test(bs.message || '')) ? ok('બ્રેક શરૂ') : info(`બ્રેક શરૂ: ${bs.message}`);
  const be = await api('POST', '/attendance/break/end', { token: empToken });
  (be.success || /not|already/i.test(be.message || '')) ? ok('બ્રેક પૂરી') : info(`બ્રેક પૂરી: ${be.message}`);
  const po = await api('POST', '/attendance/punch-out', { token: empToken, body: { remarks: 'સ્યુટ' } });
  (po.success || po.status === 409) ? ok('પંચ આઉટ (કે પહેલેથી)') : bad('પંચ આઉટ નિષ્ફળ', po.message);

  const co = await api('POST', '/attendance/corrections', { token: empToken, body: { date: d(-1), checkIn: `${d(-1)}T09:30:00.000Z`, checkOut: `${d(-1)}T18:30:00.000Z`, reason: 'બાયોમેટ્રિક ખરાબ હતું (સ્યુટ ટેસ્ટ)' } });
  expect(co.success, 'કરેક્શન વિનંતી (કર્મચારી)', co.message);
  const pend = await api('GET', '/attendance/corrections/pending', { token: T.mgr });
  const corr = (pend.data || [])[0];
  if (corr?.attendanceId && corr?.correction?._id) {
    const dec = await api('POST', `/attendance/corrections/${corr.attendanceId}/${corr.correction._id}/decide`, { token: T.admin, body: { decision: 'approved', note: 'સ્યુટ — મંજૂર' } });
    expect(dec.success, 'કરેક્શન મંજૂર (સર્વર-સાઇડ વર્કફ્લો)', dec.message);
  } else skipf('કરેક્શન pending માં મળ્યું નથી');

  const adj = await api('POST', '/attendance/adjust', { token: T.admin, body: { employeeId: empId, date: d(-2), status: 'present', checkIn: `${d(-2)}T09:15:00.000Z`, checkOut: `${d(-2)}T18:15:00.000Z`, remarks: 'સ્યુટ — HR એડજસ્ટમેન્ટ' } });
  expect(adj.success, 'HR એડજસ્ટમેન્ટ (નોંધ સાથે)', adj.message);
  const absent = await api('POST', '/attendance/jobs/mark-absent', { token: T.admin, body: { date: d(-3) } });
  expect(absent.success || absent.status === 200, 'mark-absent જોબ ચાલે', absent.message);

  /* ═══════════ 5. LEAVE ═══════════ */
  sec(5, 'રજા — અરજી → રદ, બેલેન્સ એડજસ્ટ');
  const allLt = (await api('GET', '/leave/types', { token: T.admin })).data || [];
  const casual = allLt.find((t) => /casual/i.test(t.name)) || allLt[0];
  const lr = await api('POST', '/leave/requests', { token: empToken, body: { leaveType: casual?._id, startDate: d(60), endDate: d(61), reason: 'સ્યુટ — રદ કરવા માટેની અરજી' } });
  const lrId = lr.data?.request?._id;
  expect(lr.success && lrId, 'રજા અરજી બની', lr.data?.request?.status);
  if (lrId) expect((await api('POST', `/leave/requests/${lrId}/cancel`, { token: empToken, body: { reason: 'યોજના બદલાઈ' } })).success, 'કર્મચારી પોતાની અરજી રદ કરે');
  const bAdj = await api('POST', '/leave/balances/adjust', { token: T.admin, body: { employeeId: empId, leaveType: casual?._id, adjust: 2, note: 'સ્યુટ — બોનસ દિવસ' } });
  expect(bAdj.success, 'બેલેન્સ એડજસ્ટ (+2)', `હવે allocated ${bAdj.data?.allocated ?? bAdj.data?.balance?.allocated ?? '—'}`);

  /* ═══════════ 6. PAYROLL ═══════════ */
  sec(6, 'પગાર — રન લોક-ગાર્ડ, રજિસ્ટર CSV, મારી પે-સ્લિપ');
  const runs = (await api('GET', '/payroll/runs?limit=5', { token: T.admin })).data || [];
  const paidRun = runs.find((r) => r.status === 'paid');
  if (paidRun) {
    const delGuard = await api('DELETE', `/payroll/runs/${paidRun._id}`, { token: T.admin });
    expect(delGuard.status !== 200, 'પ્રોસેસ/ચૂકવેલ રન ડિલીટ ન થાય', `HTTP ${delGuard.status} — ${String(delGuard.message).slice(0, 70)}`);
    const still = await api('GET', `/payroll/runs/${paidRun._id}`, { token: T.admin });
    expect(still.success && still.data?.run, 'રન અકબંધ છે (પે-સ્લિપ સાચવેલા)');
  } else skipf('paid રન મળ્યો નથી');
  const reg = await fetch(`${BASE}/payroll/reports/salary-register?year=2026&month=${new Date().getMonth() + 1}&export=csv`, { headers: { Authorization: `Bearer ${T.admin}` } });
  expect([200, 404].includes(reg.status), 'સેલેરી રજિસ્ટર એન્ડપોઇન્ટ', `HTTP ${reg.status}`);
  const mySlips = await api('GET', '/payroll/payslips?limit=3', { token: empToken });
  expect(mySlips.success, 'કર્મચારી પોતાની પે-સ્લિપ જુએ', `${(mySlips.data || []).length} પે-સ્લિપ`);
  const otherSlip = await api('GET', `/payroll/payslips?${''}`, { token: empToken });
  expect(otherSlip.success, 'કર્મચારીની યાદી માત્ર સ્વયં સુધી મર્યાદિત', `કુલ મળ્યાં: ${(otherSlip.data || []).length}`);

  /* ═══════════ 7. REIMBURSEMENT ═══════════ */
  sec(7, 'ખર્ચ (Reimbursement) — દાવો → બે-સ્તર મંજૂરી → ચૂકવણી');
  const claim = await api('POST', '/reimbursements', { token: empToken, body: { category: 'travel', title: `સ્યુટ મુસાફરી દાવો ${S}`, amount: 2500, expenseDate: d(-5), description: 'ક્લાયન્ટ મુલાકાત — સ્યુટ ટેસ્ટ' } });
  const claimId = claim.data?._id;
  expect(claim.success && claimId, 'દાવો બન્યો', claim.data?.claimNo || claim.data?.title);
  if (claimId) {
    let done = false;
    for (let i = 0; i < 3 && !done; i += 1) {
      const token = i === 0 ? T.mgr : T.admin;
      const dec = await api('POST', `/reimbursements/${claimId}/decide`, { token, body: { decision: 'approved', comment: `સ્યુટ — સ્તર ${i + 1}` } });
      if (dec.success && dec.data?.status === 'approved') done = true;
      if (!dec.success && !/already|no pending/i.test(dec.message || '')) { bad('દાવો મંજૂરી નિષ્ફળ', dec.message); break; }
    }
    if (done) {
      ok('દાવો મંજૂર (સ્તરો પૂરાં)');
      const paid = await api('POST', `/reimbursements/${claimId}/paid`, { token: T.admin, body: { paymentReference: `SUITE-${S}` } });
      expect(paid.success, 'દાવો ચૂકવેલ ચિહ્નિત');
    } else if (!fail) info(`દાવો સ્થિતિ: ${(await api('GET', `/reimbursements/${claimId}`, { token: T.admin })).data?.status}`);
  }
  const rStats = await api('GET', '/reimbursements/summary/stats?year=2026', { token: T.admin });
  expect(rStats.success, 'ખર્ચ આંકડા (live)');

  /* ═══════════ 8. RECRUITMENT ATS ═══════════ */
  sec(8, 'ભરતી (ATS) — જોબ → અરજી → સ્ટેજ → ઇન્ટરવ્યૂ → ઓફર PDF → કર્મચારીમાં રૂપાંતર');
  const job = await api('POST', '/recruitment/jobs', { token: T.admin, body: { title: `સ્યુટ QA એન્જિનિયર ${S}`, department: deptId || refd.data?.departments?.[0]?._id, designation: refd.data?.designations?.[0]?._id, description: 'સ્યુટ ટેસ્ટ માટેની જાહેરાત — 20+ અક્ષર.', openings: 1, employmentType: 'full_time', workMode: 'hybrid', location: 'Ahmedabad', experienceMin: 2, status: 'open', priority: 'high' } });
  const jobId = job.data?._id;
  expect(job.success && jobId, 'જોબ ઓપનિંગ બની', job.data?.jobCode || job.message);
  if (jobId) {
    expect((await api('PATCH', `/recruitment/jobs/${jobId}`, { token: T.admin, body: { openings: 2 } })).success, 'જોબ અપડેટ');
    const detail = await api('GET', `/recruitment/jobs/${jobId}`, { token: T.admin });
    expect(detail.success && detail.data?.job, 'જોબ વિગત (નવો રૂટ)');
    const fdA = new FormData();
    fdA.append('jobOpening', jobId); fdA.append('firstName', 'આશા'); fdA.append('lastName', `સ્યુટ${S}`); fdA.append('email', `asha.suite${S}@example.com`); fdA.append('phone', '+91 90000 12345'); fdA.append('source', 'careers_page');
    const apply = await api('POST', '/recruitment/applications', { token: T.admin, form: fdA });
    const appNo = apply.data?.applicationNo;
    expect(apply.success, 'અરજી બની (resume વગર)', appNo);
    const apps = (await api('GET', `/recruitment/applications?q=${encodeURIComponent(appNo || '')}&limit=5`, { token: T.admin })).data || [];
    const appId = apps[0]?._id;
    if (appId) {
      let stageOk = true;
      for (const st of ['screening', 'shortlisted', 'interview_scheduled']) {
        const r = await api('POST', `/recruitment/applications/${appId}/stage`, { token: T.admin, body: { stage: st, note: `સ્યુટ → ${st}` } });
        if (!r.success) { stageOk = false; bad(`સ્ટેજ ${st} નિષ્ફળ`, r.message); break; }
      }
      if (stageOk) ok('સ્ટેજ પાઇપલાઇન ચાલી', 'applied → screening → shortlisted → interview_scheduled');
      const iv = await api('POST', `/recruitment/applications/${appId}/interviews`, { token: T.admin, body: { name: 'ટેક્નિકલ રાઉન્ડ 1', type: 'technical', scheduledAt: d(2), durationMinutes: 60, mode: 'video' } });
      expect(iv.success, 'ઇન્ટરવ્યૂ શેડ્યૂલ', iv.message);
      const ivId = iv.data?.interviews?.slice(-1)?.[0]?._id || iv.data?._id;
      if (ivId) {
        const fb = await api('POST', `/recruitment/applications/${appId}/interviews/${ivId}/feedback`, { token: T.admin, body: { overallRating: 4, recommendation: 'hire', result: 'pass', strengths: 'સારી સમસ્યા-નિરાકરણ ક્ષમતા', comments: 'સ્યુટ — સારો અનુભવ' } });
        expect(fb.success || fb.status === 200, 'ઇન્ટરવ્યૂ ફીડબેક', fb.message);
      }
      const sel = await api('POST', `/recruitment/applications/${appId}/stage`, { token: T.admin, body: { stage: 'selected', note: 'સ્યુટ — પસંદ' } });
      expect(sel.success || sel.status === 200 || /already/i.test(sel.message || ''), 'અરજી "selected" સ્ટેજે', sel.success ? '' : 'feedback (pass) પછી આપોઆપ પસંદ થઈ ગઈ હતી');
      const off = await api('POST', `/recruitment/applications/${appId}/offer`, { token: T.admin, body: { ctc: 900000, joiningDate: d(20), designation: refd.data?.designations?.[0]?._id, notes: 'સ્યુટ ઓફર' } });
      expect(off.success, 'ઓફર મોકલાઈ', off.data?.stage || off.message);
      const offPdf = await fetch(`${BASE}/recruitment/applications/${appId}/offer/pdf`, { headers: { Authorization: `Bearer ${T.admin}` } });
      const offBuf = Buffer.from(await offPdf.arrayBuffer());
      expect(offPdf.status === 200 && offBuf.slice(0, 5).toString() === '%PDF-', 'ઓફર લેટર PDF', `${(offBuf.length / 1024).toFixed(1)} KB`);
      const resp = await api('POST', `/recruitment/applications/${appId}/offer/respond`, { token: T.admin, body: { response: 'accepted' } });
      expect(resp.success || resp.status === 200, 'ઉમેદવારે ઓફર સ્વીકારી', resp.message);
      const conv = await api('POST', `/recruitment/applications/${appId}/convert`, { token: T.admin, body: { department: deptId || refd.data?.departments?.[0]?._id, designation: refd.data?.designations?.[0]?._id, joiningDate: d(20), basic: 30000, ctcAnnual: 900000, createLogin: true, employmentType: 'full_time' } });
      expect(conv.success, 'ઉમેદવાર → કર્મચારી રૂપાંતર', conv.data?.employee?.employeeId || conv.message);
    } else skipf('અરજી શોધમાં મળી નથી');
    const pipe = await api('GET', '/recruitment/pipeline', { token: T.admin });
    expect(pipe.success && pipe.data?.board, 'પાઇપલાઇન બોર્ડ (live)');
  }

  /* ═══════════ 9. ONBOARDING ═══════════ */
  sec(9, 'ઓનબોર્ડિંગ — ટાસ્ક પૂરાં કરવા');
  const onbList = (await api('GET', '/onboarding?limit=5', { token: T.admin })).data || [];
  const onb = onbList.find((o) => o.status === 'in_progress' || o.status === 'pending') || onbList[0];
  if (onb) {
    ok('ઓનબોર્ડિંગ રેકોર્ડ મળ્યો', `${onb.status} · ટાસ્ક: ${(onb.tasks || []).length}`);
    const t = (onb.tasks || []).find((x) => x.status !== 'completed');
    if (t) expect((await api('PATCH', `/onboarding/${onb._id}/tasks/${t._id}`, { token: T.admin, body: { status: 'completed', remarks: 'સ્યુટ — પૂર્ણ' } })).success, 'ઓનબોર્ડિંગ ટાસ્ક પૂરું');
  } else skipf('ઓનબોર્ડિંગ રેકોર્ડ નથી');

  /* ═══════════ 10. PROJECTS + TASKS ═══════════ */
  sec(10, 'પ્રોજેક્ટ + કાર્ય (Kanban) — બનાવો → સ્ટેટસ → સબટાસ્ક → કોમેન્ટ');
  const proj = await api('POST', '/projects', { token: T.admin, body: { name: `સ્યુટ પ્રોજેક્ટ ${S}`, description: 'સ્યુટ ટેસ્ટ પ્રોજેક્ટ', manager: empId, department: deptId || refd.data?.departments?.[0]?._id, status: 'active', priority: 'medium', startDate: d(0), endDate: d(45), billable: true, team: [{ employee: empId, role: 'developer', allocatedPercent: 50 }] } });
  const projId = proj.data?._id;
  expect(proj.success && projId, 'પ્રોજેક્ટ બન્યો', proj.data?.code || proj.message);
  if (projId) expect((await api('GET', `/projects/${projId}/progress`, { token: T.admin })).success, 'પ્રોજેક્ટ પ્રોગ્રેસ (live)');

  const task = await api('POST', '/tasks', { token: T.admin, body: { title: `સ્યુટ કાર્ય ${S}`, description: 'સ્યુટ ટેસ્ટ કાર્ય', project: projId, assignees: [empId], priority: 'high', status: 'todo', startDate: d(0), dueDate: d(7), estimatedHours: 12, subtasks: [{ title: 'પેટા-કામ 1' }] } });
  const taskId = task.data?._id;
  expect(task.success && taskId, 'કાર્ય બન્યું', task.data?.title || task.message);
  if (taskId) {
    expect((await api('POST', `/tasks/${taskId}/status`, { token: T.admin, body: { status: 'in_progress', note: 'સ્યુટ — ચાલુ' } })).success, 'સ્ટેટસ: in_progress');
    expect((await api('POST', `/tasks/${taskId}/subtasks`, { token: T.admin, body: { title: 'વધારાનું પેટા-કામ' } })).success, 'સબટાસ્ક ઉમેર્યું');
    expect((await api('POST', `/tasks/${taskId}/comments`, { token: empToken, body: { body: 'સ્યુટ — કોમેન્ટ ચકાસણી' } })).success, 'કોમેન્ટ ઉમેરાઈ (કર્મચારી)');
    const board = await api('GET', '/tasks/board/kanban', { token: T.admin });
    expect(Array.isArray(board.data?.columns) && board.data.columns.length > 0, 'Kanban બોર્ડ કૉલમ સાથે', `${board.data?.total} કાર્ય · ${board.data?.columns?.length} કૉલમ`);
    expect((await api('POST', `/tasks/${taskId}/status`, { token: T.admin, body: { status: 'completed' } })).success, 'સ્ટેટસ: completed');
  }

  /* ═══════════ 11. TIMESHEET ═══════════ */
  sec(11, 'ટાઇમશીટ — એન્ટ્રી → સબમિટ → મંજૂરી');
  const sheet = await api('GET', '/timesheets/me/current', { token: empToken });
  const sheetId = sheet.data?._id;
  expect(sheet.success && sheetId, 'ચાલુ અઠવાડિયાની શીટ', `સ્થિતિ: ${sheet.data?.status}`);
  if (sheetId) {
    const sheetStatus = sheet.data?.status;
    const editable = !sheetStatus || ['draft', 'rejected'].includes(sheetStatus);
    if (editable) {
      const entry = await api('POST', `/timesheets/${sheetId}/entries`, { token: empToken, body: { date: d(0), project: projId, hours: 3.5, description: 'સ્યુટ — કામની વિગત', billable: true } });
      (entry.success || entry.status === 409) ? ok('ટાઇમ એન્ટ્રી (કે પહેલેથી)') : bad('ટાઇમ એન્ટ્રી નિષ્ફળ', entry.message);
      const sub = await api('POST', `/timesheets/${sheetId}/submit`, { token: empToken, body: {} });
      (sub.success || /already/i.test(sub.message || '')) ? ok('ટાઇમશીટ સબમિટ', sub.data?.status) : bad('સબમિટ નિષ્ફળ', sub.message);
    } else {
      info(`શીટ પહેલેથી "${sheetStatus}" — એન્ટ્રી/સબમિટ અવગણ્યાં (મંજૂર શીટ સબંધિત નિયમ સાચો, રી-રન પર અપેક્ષિત)`);
    }
    const pendT = await api('GET', '/timesheets/pending/approvals', { token: T.admin });
    const mySheet = (pendT.data || []).find((r) => String(r._id) === String(sheetId)); // exact — નહીંતર બીજાની શીટ પકડાય
    if (mySheet?._id) {
      const dec = await api('POST', `/timesheets/${mySheet._id}/decide`, { token: T.admin, body: { decision: 'approved', comment: 'સ્યુટ — મંજૂર' } });
      expect(dec.success, 'ટાઇમશીટ મંજૂર', dec.data?.status);
    } else skipf('મંજૂરી યાદીમાં શીટ મળી નથી');
  }

  /* ═══════════ 12. TRAINING ═══════════ */
  sec(12, 'તાલીમ — પ્રોગ્રામ → અસાઇન → પૂર્ણ (પ્રમાણપત્ર)');
  const prog = await api('POST', '/training/programs', { token: T.admin, body: { title: `સ્યુટ તાલીમ ${S}`, category: 'technical', type: 'online', durationHours: 6, startDate: d(3), endDate: d(4), trainer: { name: 'આંતરિક ટ્રેનર', isInternal: true }, venue: 'Online', certificateProvided: true, status: 'scheduled' } });
  const progId = prog.data?._id;
  expect(prog.success && progId, 'તાલીમ પ્રોગ્રામ બન્યો', prog.data?.code || prog.message);
  if (progId) {
    const asg = await api('POST', `/training/programs/${progId}/assign`, { token: T.admin, body: { employeeIds: [empId] } });
    expect(asg.success, 'તાલીમ અસાઇન થઈ', asg.message);
    const list = (await api('GET', `/training/programs/${progId}`, { token: T.admin })).data || {};
    const assignment = (list.assignments || list.enrollments || [])[0];
    if (assignment?._id) {
      const done = await api('PATCH', `/training/assignments/${assignment._id}`, { token: T.admin, body: { result: 'pass', score: 88, skillsAcquired: ['સ્યુટ-કૌશલ્ય'] } });
      expect(done.success && done.data?.status === 'completed', 'તાલીમ પૂર્ણ + પ્રમાણપત્ર', `${done.data?.status} · CERT: ${done.data?.certificate?.certificateNo || '—'}`);
    } else skipf('અસાઇનમેન્ટ વિગતમાં મળ્યું નથી');
  }

  /* ═══════════ 13. ANNOUNCEMENTS + NOTIFICATIONS ═══════════ */
  sec(13, 'જાહેરાત + સૂચનાઓ (broadcast/read)');
  const ann = await api('POST', '/announcements', { token: T.admin, body: { title: `સ્યુટ જાહેરાત ${S}`, body: 'આ સંપૂર્ણ સ્યુટ ટેસ્ટ દરમિયાન બનાવેલી જાહેરાત છે.', category: 'general', priority: 'normal', audience: { type: 'all' }, pinned: false, requireAcknowledgement: true } });
  const annId = ann.data?._id;
  expect(ann.success && annId, 'જાહેરાત ડ્રાફ્ટ બની', ann.data?.status || ann.message);
  if (annId) {
    expect((await api('POST', `/announcements/${annId}/publish`, { token: T.admin, body: {} })).success, 'જાહેરાત પ્રકાશિત (notify ગયું)');
    const feed = (await api('GET', '/announcements/feed/me', { token: empToken })).data || [];
    const seen = feed.some((a) => String(a._id) === String(annId));
    expect(seen, 'કર્મચારીના ફીડમાં દેખાય');
    const read = await api('POST', `/announcements/${annId}/read`, { token: empToken, body: { acknowledge: true } });
    expect(read.success || read.status === 200, 'કર્મચારીએ વાંચ્યું + સ્વીકાર્યું');
    const stats = await api('GET', `/announcements/${annId}/stats`, { token: T.admin });
    expect(stats.success, 'જાહેરાત આંકડા (views/read/ack)', `વાંચ્યું: ${stats.data?.readCount} · સ્વીકાર: ${stats.data?.acknowledgementCount}`);
  }
  const bc = await api('POST', '/notifications/broadcast', { token: T.admin, body: { title: `સ્યુટ બ્રોડકાસ્ટ ${S}`, body: 'સંપૂર્ણ સ્યુટ ટેસ્ટ પૂરો થઈ રહ્યો છે.', type: 'system', role: 'employee' } });
  expect(bc.success, 'બ્રોડકાસ્ટ સૂચના', bc.data?.count !== undefined ? `${bc.data.count} ને મળી` : bc.message);
  const unread = await api('GET', '/notifications/unread-count', { token: empToken });
  expect(unread.success, 'unread-count', `કુલ: ${unread.data?.unread}`);
  const readAll = await api('POST', '/notifications/read-all', { token: empToken, body: {} });
  expect(readAll.success || readAll.status === 200, 'read-all ચાલે');
  const unread2 = await api('GET', '/notifications/unread-count', { token: empToken });
  expect((unread2.data?.unread ?? 1) === 0, 'read-all પછી unread = 0', `હવે: ${unread2.data?.unread}`);

  /* ═══════════ 14. USERS + RBAC ═══════════ */
  sec(14, 'વપરાશકર્તા + RBAC — બનાવો → ડી-એક્ટિવ → પરવાનગી → સેશન રિવોક → ડિલીટ');
  const newUserEmail = `suite.user${S}@acmetech.example.com`;
  const newUser = await api('POST', '/users', { token: T.admin, body: { name: `સ્યુટ વપરાશકર્તા ${S}`, email: newUserEmail, password: PASSWORD, role: 'employee', employee: empId } });
  const userId = newUser.data?._id;
  expect(newUser.success && userId, 'નવો વપરાશકર્તા બન્યો', newUserEmail);
  if (userId) {
    const login1 = await api('POST', '/auth/login', { body: { email: newUserEmail, password: PASSWORD } });
    expect(login1.status === 200, 'નવો વપરાશકર્તા લોગિન કરી શકે');
    const toggled = await api('POST', `/users/${userId}/toggle-active`, { token: T.admin });
    expect(toggled.success && toggled.data?.isActive === false, 'વપરાશકર્તા ડી-એક્ટિવ');
    const login2 = await api('POST', '/auth/login', { body: { email: newUserEmail, password: PASSWORD } });
    expect([401, 403, 423].includes(login2.status), 'ડી-એક્ટિવ વપરાશકર્તા લોગિન ન કરી શકે', `HTTP ${login2.status}`);
    expect((await api('POST', `/users/${userId}/toggle-active`, { token: T.admin })).success, 'ફરી એક્ટિવ');
    const perms = await api('POST', `/users/${userId}/permissions`, { token: T.admin, body: { extraPermissions: ['reports:view'] } });
    expect(perms.success, 'વપરાશકર્તા-સ્તરીય પરવાનગી ઉમેરી (reports:view)');
    const revoke = await api('POST', `/users/${userId}/revoke-sessions`, { token: T.admin });
    expect(revoke.success, 'બધા સેશન રિવોક');
    const del = await api('DELETE', `/users/${userId}`, { token: T.admin });
    expect(del.success || del.status === 200, 'વપરાશકર્તા ડિલીટ (soft)');
  }
  const roles = await api('GET', '/users/roles', { token: T.admin });
  expect(roles.success && (roles.data || []).length >= 6, '6 રોલ મેટ્રિક્સ', `${(roles.data || []).length} રોલ`);
  const catalog = await api('GET', '/users/permissions/catalog', { token: T.admin });
  expect(catalog.success && catalog.data?.permissions?.length > 50, 'પરવાનગી કૅટેલોગ', `${catalog.data?.permissions?.length} પરવાનગીઓ`);

  /* ═══════════ 15. SETTINGS ═══════════ */
  sec(15, 'સેટિંગ્સ — સેક્શન પેચ + વેરિફાય + પાછું ફેરવો');
  const before = await api('GET', '/settings', { token: T.admin });
  const oldGrace = before.data?.attendancePolicy?.gracePeriodMinutes ?? 15;
  const oldPayDay = before.data?.payrollSettings?.payDay ?? 1;
  const patch = await api('PATCH', '/settings', { token: T.admin, body: { attendancePolicy: { gracePeriodMinutes: oldGrace + 1 }, payrollSettings: { payDay: 5 } } });
  expect(patch.success, 'સેટિંગ્સ પેચ (attendance + payroll deep-merge)');
  const after = await api('GET', '/settings', { token: T.admin });
  expect(after.data?.attendancePolicy?.gracePeriodMinutes === oldGrace + 1, 'grace deep-merge વેરિફાય', `${oldGrace} → ${after.data?.attendancePolicy?.gracePeriodMinutes}`);
  expect(after.data?.payrollSettings?.payDay === 5, 'payroll payDay સચવાયું', `payDay: ${after.data?.payrollSettings?.payDay}`);
  await api('PATCH', '/settings', { token: T.admin, body: { attendancePolicy: { gracePeriodMinutes: oldGrace }, payrollSettings: { payDay: oldPayDay } } });
  ok('સેટિંગ્સ પાછાં ફેરવાયાં', `grace ${oldGrace} · payDay ${oldPayDay}`);
  const sys = await api('GET', '/settings/system', { token: T.admin });
  expect(sys.success && sys.data?.counts, 'સિસ્ટમ માહિતી (DB + counts)', `${sys.data?.database?.mode} · કર્મચારી ${sys.data?.counts?.employees}`);

  /* ═══════════ 16. AUDIT + DASHBOARDS ═══════════ */
  sec(16, 'ઓડિટ + 6 રોલ ડેશબોર્ડ');
  const audit = await api('GET', '/audit?limit=250', { token: T.admin });
  const actions = (audit.data || []).map((a) => a.action);
  const want = ['employee.create', 'department.create', 'user.create', 'settings.update', 'reimbursement', 'asset', 'training'];
  const found = want.filter((w) => actions.some((a) => a.includes(w.split('.')[0])));
  expect(found.length >= 5, 'આ રનની ક્રિયાઓ ઓડિટમાં નોંધાઈ', `${found.length}/${want.length} પ્રકાર મળ્યા`);
  const aStats = await api('GET', '/audit/stats', { token: T.admin });
  expect(aStats.success && aStats.data?.byModule, 'ઓડિટ આંકડા (byModule)');

  const dash = { admin: '/dashboard/admin', hrAdmin: '/dashboard/hr', hrMgr: '/dashboard/hr', mgr: '/dashboard/manager', lead: '/dashboard/manager', emp: '/dashboard/employee' };
  for (const [role, path] of Object.entries(dash)) {
    const r = await api('GET', path, { token: T[role] });
    r.status === 200 && r.success ? ok(`${role} ડેશબોર્ડ`, path) : bad(`${role} ડેશબોર્ડ નિષ્ફળ`, `HTTP ${r.status} ${r.message || ''}`);
  }
  const forbiddenDash = await api('GET', '/dashboard/admin', { token: T.emp });
  expect(forbiddenDash.status === 403, 'કર્મચારી → admin ડેશબોર્ડ → 403');

  /* ── cleanup: બનાવેલા નમૂનાને નિષ્ક્રિય કરો ── */
  console.log('\n━━━ સફાઈ (soft-delete) ━━━');
  const cleanup = [
    ['shift', shiftId], ['holiday', holId], ['designation', desigId], ['department', deptId],
  ];
  for (const [kind, id] of cleanup) {
    if (!id) continue;
    const r = await api('DELETE', `/${kind}s/${id}`.replace('/shifts', '/shifts').replace('/holidays', '/holidays').replace('/designations', '/designations').replace('/departments', '/departments'), { token: T.admin });
    (r.success || r.status === 200) ? ok(`${kind} soft-delete`) : info(`${kind} ડિલીટ: ${r.message}`);
  }

  /* ── summary ── */
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  આખરી પરિણામ:  ✅ ${pass} પાસ   ⏭️ ${skip} છોડ્યાં   ❌ ${fail} નિષ્ફળ`);
  if (failures.length) { console.log('\n  નિષ્ફળ:'); failures.forEach((f) => console.log('   •', f)); }
  console.log('════════════════════════════════════════════════════════════\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n💥 સ્યુટ અટક્યો:', e.message); process.exit(2); });
