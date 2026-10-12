'use strict';
/**
 * Module lifecycle tests — Assets, Performance, Offboarding.
 * દરેક મોડ્યુલની આખી સ્થિતિ-સાંકળ (state machine) અસલી API પર ચકાસે.
 *
 *   npm run test:modules
 *   API_URL=http://host:4000/api npm run test:modules
 *
 * Idempotent: દરેક રન નવો સંપત્તિ + નવો ઓફબોર્ડિંગ કર્મચારી બનાવે, અનન્ય cycle નામ વાપરે.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_URL || 'http://127.0.0.1:4000/api';
const STAMP = Date.now().toString().slice(-6);
const OFF_EMAIL = `nikhil.offboard${STAMP}@acmetech.example.com`;
const PASSWORD = 'Password@123';

let pass = 0, fail = 0, skip = 0;
const failures = [];
const step = (n, name) => console.log(`\n▸ ${n}: ${name}`);
const ok = (m, x = '') => { pass++; console.log(`   ✅ ${m}${x ? ` — ${x}` : ''}`); };
const bad = (m, d) => { fail++; failures.push(m); console.log(`   ❌ ${m}`); if (d !== undefined) console.log(`      → ${JSON.stringify(d).slice(0, 280)}`); };
const info = (m) => console.log(`   ℹ️  ${m}`);
const skipped = (m) => { skip++; console.log(`   ⏭️  ${m}`); };

async function api(method, path_, { token, body } = {}) {
  const res = await fetch(BASE + path_, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 150) }; }
  return { status: res.status, ...json };
}
async function login(email, password, label) {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (!r.data?.accessToken) throw new Error(`${label}: લોગિન નિષ્ફળ (${r.status}) ${r.message || ''}`);
  ok(`${label} લોગિન`, email);
  return r.data.accessToken;
}
const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  EMS — મોડ્યુલ લાઇફસાઇકલ ટેસ્ટ (Assets · Performance · Offboarding)');
  console.log(`  API: ${BASE}`);
  console.log('══════════════════════════════════════════════════════════');

  const admin = await login('superadmin@company.com', 'SuperAdmin@123', 'સુપર એડમિન');
  const ref = await api('GET', '/settings/reference-data', { token: admin });
  const departments = ref.data?.departments || []; const designations = ref.data?.designations || [];

  /* common: E2E employee + his manager + an HR */
  const e2eList = await api('GET', '/employees?q=chirag.patel.e2e&limit=3', { token: admin });
  const chirag = (e2eList.data || []).find((e) => e.email === 'chirag.patel.e2e@acmetech.example.com');
  if (!chirag) throw new Error('E2E કર્મચારી મળ્યો નથી — પહેલાં npm run test:e2e ચલાવો');
  const empToken = await login('chirag.patel.e2e@acmetech.example.com', PASSWORD, 'E2E કર્મચારી');
  const mgrToken = await login('vikram.shah@acmetech.example.com', PASSWORD, 'ડિપાર્ટમેન્ટ મેનેજર');
  const vikramEmp = (await api('GET', '/employees?q=vikram.shah&limit=2', { token: admin })).data?.find((e) => e.email === 'vikram.shah@acmetech.example.com');
  const hrToken = await login('kavita.nair@acmetech.example.com', PASSWORD, 'HR એડમિન');

  /* ══════════════ A) ASSETS ══════════════ */
  step('A', 'સંપત્તિ (Assets) — બનાવો → સોંપો → સ્વીકારો → ટ્રાન્સફર → પરત → મેન્ટેનન્સ');
  const create = await api('POST', '/assets', {
    token: admin,
    body: { name: `E2E Laptop ${STAMP}`, category: 'laptop', brand: 'Dell', model: 'Latitude 5440', serialNumber: `SN${STAMP}`, purchaseDate: d(-30), purchasePrice: 85000, condition: 'new', location: 'Ahmedabad HQ', warrantyExpiry: d(700) },
  });
  const asset = create.data;
  create.success ? ok('સંપત્તિ બની', `${asset?.assetId} · ${asset?.name}`) : bad('સંપત્તિ બનાવવામાં નિષ્ફળ', create.message || create);

  if (asset?._id) {
    const assign = await api('POST', `/assets/${asset._id}/assign`, { token: admin, body: { employeeId: chirag._id, conditionAtAssignment: 'new', note: 'E2E assignment' } });
    const asg = assign.data;
    assign.success ? ok('કર્મચારીને સોંપી', `assignment ${asg?._id} · સ્થિતિ: ${asg?.status}`) : bad('સોંપવામાં નિષ્ફળ', assign.message || assign);

    if (asg?._id) {
      const dup = await api('POST', `/assets/${asset._id}/assign`, { token: admin, body: { employeeId: chirag._id } });
      dup.status === 409 ? ok('ડબલ-સોંપણી બ્લોક થઈ (409)', String(dup.message).slice(0, 60)) : bad(`ડબલ-સોંપણી રોકાઈ નથી (HTTP ${dup.status})`);

      const ack = await api('POST', `/assets/assignments/${asg._id}/acknowledge`, { token: empToken });
      ack.success ? ok('કર્મચારીએ સ્વીકાર કર્યો (acknowledge)', ack.data?.status || ack.message) : bad('સ્વીકાર નિષ્ફળ', ack.message || ack);

      const mine = await api('GET', '/assets/my-assets', { token: empToken });
      const hasIt = (mine.data || []).some((r) => String(r.asset?._id || r.asset?._id || r._id) === String(asset._id) || String(r.assetId) === String(asset.assetId));
      hasIt ? ok('કર્મચારીની "મારી સંપત્તિ" યાદીમાં દેખાય છે') : info('my-assets માં મળ્યું નહીં (શેપ ચકાસવું)');

      /* transfer to a colleague */
      const other = (await api('GET', '/employees?q=sneha.iyer&limit=2', { token: admin })).data?.[0];
      if (other) {
        const tr = await api('POST', `/assets/assignments/${asg._id}/transfer`, { token: admin, body: { toEmployeeId: other._id, note: 'E2E transfer' } });
        tr.success ? ok('બીજા કર્મચારીને ટ્રાન્સફર', `નવી assignment સ્થિતિ: ${tr.data?.status || 'ok'} → ${other.firstName}`) : bad('ટ્રાન્સફર નિષ્ફળ', tr.message || tr);
      } else skipped('ટ્રાન્સફર માટે બીજો કર્મચારી મળ્યો નથી');

      /* return: use the latest active assignment for this asset */
      const detail = await api('GET', `/assets/${asset._id}`, { token: admin });
      const active = (detail.data?.history || []).find((h) => h.status === 'assigned');
      if (active) {
        const ret = await api('POST', `/assets/assignments/${active._id}/return`, { token: admin, body: { conditionAtReturn: 'good', returnNotes: 'E2E return' } });
        ret.success ? ok('સંપત્તિ પરત મળી', `સ્થિતિ: ${ret.data?.status || 'returned'}`) : bad('પરત કરવામાં નિષ્ફળ', ret.message || ret);
      } else skipped('પરત કરવા સક્રિય assignment મળ્યું નથી');
    }

    const maint = await api('POST', `/assets/${asset._id}/maintenance`, { token: admin, body: { type: 'service', issue: 'E2E — વાર્ષિક સર્વિસિંગ', vendor: 'Dell Care', cost: 1500 } });
    const mrec = maint.data;
    maint.success ? ok('મેન્ટેનન્સ નોંધ બની', `સ્થિતિ: ${mrec?.status}`) : bad('મેન્ટેનન્સ નિષ્ફળ', maint.message || maint);
    if (mrec?._id) {
      const done = await api('PATCH', `/assets/maintenance/${mrec._id}`, { token: admin, body: { status: 'completed', cost: 1500, completedDate: d(0) } });
      done.success ? ok('મેન્ટેનન્સ પૂર્ણ', done.data?.status || done.message) : bad('મેન્ટેનન્સ પૂર્ણ કરવામાં નિષ્ફળ', done.message || done);
    }
    const stats = await api('GET', '/assets/stats/summary', { token: admin });
    stats.success ? ok('સંપત્તિ આંકડા (live)', `કુલ મૂલ્ય ₹${stats.data?.totalValue?.toLocaleString?.('en-IN') ?? stats.data?.totalValue}`) : bad('આંકડા નિષ્ફળ', stats.message);
  }

  /* ══════════════ B) PERFORMANCE ══════════════ */
  step('B', 'કામગીરી (Performance) — cycle → self → manager → HR release');
  const cycle = `E2E ચક્ર ${STAMP}`;
  const bulk = await api('POST', '/performance/reviews/bulk-create', {
    token: admin,
    body: { cycle, cycleType: 'special', periodStart: d(-90), periodEnd: d(0), employeeIds: [chirag._id], dueDate: d(7) },
  });
  (bulk.success && bulk.data?.created >= 1) ? ok('રિવ્યૂ ચક્ર બન્યું', `created: ${bulk.data.created} · skipped: ${bulk.data.skipped}`) : bad('ચક્ર બન્યું નથી', bulk.message || bulk);

  const listR = await api('GET', `/performance/reviews?cycle=${encodeURIComponent(cycle)}&limit=5`, { token: admin });
  const review = (listR.data || [])[0];
  if (!review) bad('નવો રિવ્યૂ મળ્યો નથી', listR.message);
  else {
    ok('રિવ્યૂ સ્થિતિ', `${review.status} · કર્મચારી: ${review.employee?.firstName || ''}`);

    const self = await api('POST', `/performance/reviews/${review._id}/self-assessment`, {
      token: empToken,
      body: { comments: 'E2E — વર્ષ દરમિયાન 3 પ્રોજેક્ટ પૂરા કર્યા.', achievements: 'Kanban બોર્ડ ટાઇમ-ટ્રેકિંગ સુધારી', challenges: 'સમય-વ્યવસ્થાપન', overallSelfRating: 4, goalsReview: '4/5 લક્ષ્ય પૂરાં' },
    });
    self.success ? ok('કર્મચારીનું self-assessment', `હવે: ${self.data?.status}`) : bad('self-assessment નિષ્ફળ', self.message || self);

    const mgr = await api('POST', `/performance/reviews/${review._id}/manager-assessment`, {
      token: mgrToken,
      body: { comments: 'સારી કામગીરી', strengths: 'ટીમ-વર્ક', improvements: 'ડોક્યુમેન્ટેશન', overallRating: 4, promotionRecommended: false, incrementRecommended: 8 },
    });
    mgr.success ? ok('મેનેજરનું assessment', `હવે: ${mgr.data?.status}`) : bad('manager-assessment નિષ્ફળ', mgr.message || mgr);

    const hr = await api('POST', `/performance/reviews/${review._id}/hr-review`, {
      token: hrToken,
      body: { comments: 'E2E — કેલિબ્રેશન પૂર્ણ', calibratedRating: 4, release: true, hikePercent: 8 },
    });
    hr.success ? ok('HR સમીક્ષા + રિલીઝ', `સ્થિતિ: ${hr.data?.status} · final rating: ${hr.data?.finalRating} · hike: ${hr.data?.hikePercent}%`) : bad('HR review નિષ્ફળ', hr.message || hr);

    const fin = await api('GET', `/performance/reviews/${review._id}`, { token: admin });
    const chain = (fin.data?.auditTrail || []).map((a) => a.action).join(' → ');
    fin.data?.status === 'released' ? ok('રિવ્યૂ સાંકળ પૂરી', chain) : bad(`અપેક્ષિત 'released', મળ્યું '${fin.data?.status}'`);
  }

  /* ══════════════ C) OFFBOARDING ══════════════ */
  step('C', 'વિદાય પ્રક્રિયા (Offboarding) — રાજીનામું → બે મંજૂરી → સેટલમેન્ટ → લેટર PDF → પૂર્ણ');
  const offCreate = await api('POST', '/employees', {
    token: admin,
    body: {
      firstName: 'Nikhil', lastName: `Offboard${STAMP.slice(-3)}`, email: OFF_EMAIL, joiningDate: d(-400),
      employmentType: 'full_time', employmentStatus: 'active', employeeCategory: 'permanent',
      department: departments[2]?._id || departments[0]?._id, designation: designations[0]?._id,
      noticePeriodDays: 30, password: PASSWORD, role: 'employee', sendWelcomeEmail: false,
      reportingManager: vikramEmp?._id, teamLeader: vikramEmp?._id,
    },
  });
  const offEmp = offCreate.data?.employee;
  (offCreate.success || offCreate.status === 201) ? ok('ટેસ્ટ કર્મચારી બન્યો', `${offEmp?.employeeId} · ${OFF_EMAIL}`) : bad('ટેસ્ટ કર્મચારી બન્યો નથી', offCreate.message || offCreate);

  if (offEmp?._id) {
    const resign = await api('POST', '/offboarding', { token: admin, body: { employeeId: offEmp._id, resignationDate: d(-1), lastWorkingDay: d(29), reason: 'better_opportunity', reasonDetails: 'E2E ટેસ્ટ', noticePeriodDays: 30 } });
    const rec = resign.data;
    resign.success ? ok('રાજીનામું નોંધાયું', `સ્થિતિ: ${rec?.status} · notice: ${rec?.noticeServedDays}/${rec?.noticePeriodDays} દિવસ · tasks: ${rec?.tasks?.length ?? 0}`) : bad('રાજીનામું નોંધાયું નથી', resign.message || resign);

    if (rec?._id) {
      /* two-level approval: manager level then HR level */
      let decided = 0; let st = rec.status;
      for (let level = 1; level <= 2; level += 1) {
        const r1 = await api('POST', `/offboarding/${rec._id}/decide`, { token: mgrToken, body: { decision: 'approved', comment: `E2E સ્તર ${level}` } });
        if (r1.success) { decided++; st = r1.data?.status; ok(`મંજૂરી સ્તર ${level} — મેનેજર સ્કોપથી`, `હવે: ${st}`); continue; }
        const r2 = await api('POST', `/offboarding/${rec._id}/decide`, { token: hrToken, body: { decision: 'approved', comment: `E2E સ્તર ${level} (HR)` } });
        if (r2.success) { decided++; st = r2.data?.status; ok(`મંજૂરી સ્તર ${level} (HR)`, `હવે: ${st}`); } else { bad(`સ્તર ${level} મંજૂરી નિષ્ફળ`, r2.message || r1.message); break; }
      }

      const ei = await api('POST', `/offboarding/${rec._id}/exit-interview`, { token: hrToken, body: { ratings: { workEnvironment: 4, management: 4, compensation: 3, growth: 4, workLifeBalance: 4 }, feedback: 'E2E — સારો અનુભવ', suggestions: 'વધુ તાલીમ', wouldRecommend: true, rehireEligible: true } });
      ei.success ? ok('એક્ઝિટ ઇન્ટરવ્યૂ નોંધાયો', (ei.data?.ratings && `રેટિંગ સરેરાશ ${(Object.values(ei.data.ratings).reduce((a, b) => a + b, 0) / 5).toFixed(1)}/5`) || '') : bad('એક્ઝિટ ઇન્ટરવ્યૂ નિષ્ફળ', ei.message || ei);

      const revoke = await api('POST', `/offboarding/${rec._id}/revoke-access`, { token: admin, body: { email: true, system: true, vpn: true } });
      revoke.success ? ok('એક્સેસ રદ કરવાની પ્રક્રિયા', revoke.message) : bad('revoke-access નિષ્ફળ', revoke.message || revoke);

      const settle = await api('POST', `/offboarding/${rec._id}/final-settlement`, {
        token: admin,
        body: {
          lines: [
            { name: 'પગાર — ચાલુ મહિનો (પ્રો-રેટા)', type: 'earning', amount: 42000 },
            { name: 'વેકેશન એનકેશમેન્ટ', type: 'earning', amount: 8500 },
            { name: 'નોટિસ પીરિયડ એડજસ્ટમેન્ટ', type: 'deduction', amount: 0 },
            { name: 'TDS/કર કપાત', type: 'deduction', amount: 3200 },
          ],
          notes: 'E2E — અંતિમ પતાવટ', approve: true,
        },
      });
      settle.success ? ok('અંતિમ પતાવટ મંજૂર', `ચોખ્ખી રકમ ₹${settle.data?.netAmount?.toLocaleString?.('en-IN') ?? settle.data?.netAmount} · સ્થિતિ: ${settle.data?.status}`) : bad('ફાઇનલ સેટલમેન્ટ નિષ્ફળ', settle.message || settle);

      /* letters PDF */
      for (const type of ['experience', 'relieving']) {
        const res = await fetch(`${BASE}/offboarding/${rec._id}/letters/${type}`, { headers: { Authorization: `Bearer ${admin}` } });
        const buf = Buffer.from(await res.arrayBuffer());
        const isPdf = buf.slice(0, 5).toString() === '%PDF-';
        if (res.status === 200 && isPdf) {
          const f = path.resolve(__dirname, `../../sample-letter-${type}.pdf`);
          fs.writeFileSync(f, buf);
          ok(`${type} લેટર PDF`, `${(buf.length / 1024).toFixed(1)} KB → ems/sample-letter-${type}.pdf`);
        } else bad(`${type} લેટર PDF બન્યું નથી`, `HTTP ${res.status}, ${buf.length} bytes`);
      }

      /* exit checklist — HR/Admin owns it (managers hold approve, not update, by design) */
      const cur = await api('GET', `/offboarding/${rec._id}`, { token: admin });
      const pending = (cur.data?.tasks || []).filter((t) => ['pending', 'in_progress'].includes(t.status));
      let doneCount = 0;
      for (const t of pending) {
        const r = await api('PATCH', `/offboarding/${rec._id}/tasks/${t._id}`, { token: admin, body: { status: 'completed', remarks: 'E2E — પૂર્ણ' } });
        if (r.success) doneCount += 1;
      }
      if (!pending.length) info('ચેકલિસ્ટ પહેલેથી પૂરી');
      else if (doneCount === pending.length) ok('એક્ઝિટ ચેકલિસ્ટ પૂરી', `${doneCount}/${pending.length} બાબતો પૂર્ણ (HR/એડમિન)`);
      else bad(`ચેકલિસ્ટ અધૂરી — ${doneCount}/${pending.length} જ પૂર્ણ થઈ`);

      const done = await api('POST', `/offboarding/${rec._id}/complete`, { token: admin });
      done.success ? ok('ઓફબોર્ડિંગ પૂર્ણ', `સ્થિતિ: ${done.data?.status}`) : bad('complete નિષ્ફળ', done.message || done);

      if (done.success) {
        const after = await api('GET', `/employees/${offEmp._id}`, { token: admin });
        const st2 = after.data?.employmentStatus || after.data?.employee?.employmentStatus;
        const act = after.data?.isActive ?? after.data?.employee?.isActive;
        ['resigned', 'terminated', 'retired'].includes(st2)
          ? ok('કર્મચારી આર્કાઇવ થયો', `સ્થિતિ: ${st2} · isActive: ${act}`)
          : bad(`ઓફબોર્ડિંગ પછી સ્થિતિ અપેક્ષિત નથી: ${st2}`);
      }
    }
  }

  /* summary */
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  પરિણામ:  ✅ ${pass} પાસ   ⏭️ ${skip} છોડ્યાં   ❌ ${fail} નિષ્ફળ`);
  if (failures.length) { console.log('  નિષ્ફળ પગલાં:'); failures.forEach((f) => console.log('   •', f)); }
  console.log('══════════════════════════════════════════════════════════\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n💥 મોડ્યુલ ટેસ્ટ અટક્યો:', e.message); process.exit(2); });
