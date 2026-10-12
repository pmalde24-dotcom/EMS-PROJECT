'use strict';
/**
 * UI surface smoke — hits every GET endpoint the React client actually calls
 * (client/src/api/endpoints.js), with the same params the pages pass and real IDs
 * resolved from the API. Catches "page loads but the widget 400s" regressions.
 *
 *   npm run test:surface           (API on :4000)
 *   API_URL=http://host:4000/api npm run test:surface
 */
const BASE = process.env.API_URL || 'http://127.0.0.1:4000/api';
const ADMIN = ['superadmin@company.com', 'SuperAdmin@123'];
const EMPLOYEE = ['chirag.patel.e2e@acmetech.example.com', 'Password@123'];

const pass = []; const fails = []; const skips = [];

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { /* csv/other */ }
  return { status: res.status, json };
}
const login = async ([email, password]) => {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (!r.json?.data?.accessToken) throw new Error(`login failed for ${email}: ${r.status} ${r.json?.message}`);
  return r.json.data.accessToken;
};

(async () => {
  const admin = await login(ADMIN);
  const emp = await login(EMPLOYEE);
  const pick = async (path, key = 'data') => {
    const r = await api('GET', path, { token: admin });
    const d = r.json?.[key];
    return Array.isArray(d) ? d[0] : d;
  };

  /* ── resolve real ids ─────────────────────────────────────────── */
  const [emp1, dept1, proj1, task1, job1, app1, onb1, off1, rev1, trn1, reimb1, timesheet1, user1, run1, slip1, asset1, leave1] = await Promise.all([
    pick('/employees?limit=1'), pick('/departments?limit=1'), pick('/projects?limit=1'), pick('/tasks?limit=1'),
    pick('/recruitment/jobs?limit=1'), pick('/recruitment/applications?limit=1'), pick('/onboarding?limit=1'),
    pick('/offboarding?limit=1'), pick('/performance/reviews?limit=1'), pick('/training/programs?limit=1'),
    pick('/reimbursements?limit=1'), pick('/timesheets?limit=1'), pick('/users?limit=1'),
    pick('/payroll/runs?limit=1'), pick('/payroll/payslips?limit=1'), pick('/assets?limit=1'), pick('/leave/requests?limit=1'),
  ]);
  const ids = {
    employee: emp1?._id, department: dept1?._id, project: proj1?._id, task: task1?._id, job: job1?._id,
    application: app1?._id, onboarding: onb1?._id, offboarding: off1?._id, review: rev1?._id, program: trn1?._id,
    reimbursement: reimb1?._id, timesheet: timesheet1?._id, user: user1?._id, run: run1?._id, payslip: slip1?._id, asset: asset1?._id, leave: leave1?._id,
  };
  const Y = new Date().getFullYear(); const M = new Date().getMonth() + 1;
  const missing = Object.entries(ids).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) console.log(`⚠️  ID મળ્યા નથી (સંબંધિત ચેક છોડાશે): ${missing.join(', ')}`);

  const checks = [
    /* auth / profile / shell */
    ['GET', '/auth/me', admin], ['GET', '/auth/setup-status', null], ['GET', '/auth/activity', admin], ['GET', '/my-permissions', admin],
    /* dashboards */
    ['GET', '/dashboard/admin', admin], ['GET', '/dashboard/hr', admin], ['GET', '/dashboard/manager', admin], ['GET', '/dashboard/employee', admin],
    ['GET', '/dashboard/widgets/celebrations', admin], ['GET', '/dashboard/widgets/quick-stats', admin],
    ['GET', '/dashboard/employee', emp], ['GET', '/dashboard/manager', emp],
    /* employees */
    ['GET', `/employees?q=chirag&limit=5`, admin], ['GET', '/employees/directory', admin], ['GET', '/employees/stats/summary', admin],
    ['GET', '/employees/celebrations/upcoming', admin],
    ['GET', `/employees/${ids.employee}/overview`, admin, 'employee'], ['GET', `/employees/${ids.employee}/reportees`, admin, 'employee'],
    /* org */
    ['GET', '/departments', admin], ['GET', `/departments/${ids.department}/overview`, admin, 'department'],
    ['GET', `/departments/${ids.department}/employees`, admin, 'department'], ['GET', '/designations', admin],
    ['GET', '/shifts', admin], ['GET', '/holidays', admin], ['GET', `/holidays/calendar/${Y}`, admin],
    /* attendance */
    ['GET', '/attendance?limit=5', admin], ['GET', `/attendance/me/calendar?year=${Y}&month=${M}`, emp], ['GET', '/attendance/me/today', emp],
    ['GET', `/attendance/summary?year=${Y}&month=${M}`, admin], ['GET', `/attendance/summary/${ids.employee}?year=${Y}&month=${M}`, admin, 'employee'],
    ['GET', '/attendance/corrections/pending', admin],
    ['GET', `/attendance/reports/trend?year=${Y}&month=${M}`, admin], ['GET', `/attendance/reports/department?year=${Y}&month=${M}`, admin],
    /* leave */
    ['GET', '/leave/requests', admin], ['GET', '/leave/requests/pending-approvals', admin], ['GET', `/leave/requests/${ids.leave}`, admin, 'leave'],
    ['GET', `/leave/calendar?year=${Y}&month=${M}`, admin], ['GET', `/leave/reports/summary?year=${Y}`, admin],
    ['GET', '/leave/types', admin], ['GET', '/leave/balances', admin], ['GET', '/leave/balances/me', emp], ['GET', `/leave/balances/me?year=${Y}`, emp],
    /* payroll */
    ['GET', '/payroll/runs', admin], ['GET', `/payroll/runs/${ids.run}`, admin, 'run'], ['GET', '/payroll/structures', admin],
    ['GET', `/payroll/structures/current/${ids.employee}`, admin, 'employee'], ['GET', '/payroll/payslips', admin],
    ['GET', `/payroll/payslips/${ids.payslip}`, admin, 'payslip'], ['GET', '/payroll/revisions', admin],
    ['GET', `/payroll/reports/summary?year=${Y}&month=${M}`, admin], ['GET', `/payroll/reports/salary-register?year=${Y}&month=${M}`, admin],
    ['GET', '/payroll/payslips', emp],
    /* reimbursements */
    ['GET', '/reimbursements', admin], ['GET', '/reimbursements/pending-approvals', admin], ['GET', `/reimbursements/${ids.reimbursement}`, admin, 'reimbursement'],
    ['GET', `/reimbursements/summary/stats?year=${Y}`, admin],
    /* recruitment */
    ['GET', '/recruitment/jobs', admin], ['GET', `/recruitment/jobs/${ids.job}`, admin, 'job'], ['GET', '/recruitment/applications', admin],
    ['GET', `/recruitment/applications/${ids.application}`, admin, 'application'], ['GET', '/recruitment/pipeline', admin],
    ['GET', `/recruitment/reports/summary?year=${Y}`, admin],
    /* onboarding / offboarding */
    ['GET', '/onboarding', admin], ['GET', `/onboarding/${ids.onboarding}`, admin, 'onboarding'], ['GET', '/onboarding/templates', admin],
    ['GET', '/offboarding', admin], ['GET', `/offboarding/${ids.offboarding}`, admin, 'offboarding'],
    ['GET', `/offboarding/${ids.offboarding}/reconciliation`, admin, 'offboarding'],
    /* projects / tasks / timesheets */
    ['GET', '/projects', admin], ['GET', `/projects/${ids.project}/progress`, admin, 'project'],
    ['GET', '/tasks', admin], ['GET', '/tasks/board/kanban', admin], ['GET', '/tasks/me/summary', emp], ['GET', '/tasks/reports/overdue', admin],
    ['GET', `/tasks/${ids.task}`, admin, 'task'], ['GET', '/timesheets', admin], ['GET', '/timesheets/pending/approvals', admin],
    ['GET', '/timesheets/me/current', emp], ['GET', `/timesheets/${ids.timesheet}`, admin, 'timesheet'],
    ['GET', `/timesheets/reports/summary?year=${Y}`, admin], ['GET', `/reports/timesheets?year=${Y}`, admin],
    /* performance */
    ['GET', '/performance/reviews', admin], ['GET', `/performance/reviews/${ids.review}`, admin, 'review'], ['GET', '/performance/templates', admin],
    ['GET', '/performance/goals', admin], ['GET', '/performance/plans', admin], ['GET', `/performance/reports/summary?year=${Y}`, admin],
    /* training */
    ['GET', '/training/programs', admin], ['GET', `/training/programs/${ids.program}`, admin, 'program'],
    ['GET', `/training/reports/summary?year=${Y}`, admin], ['GET', '/training/reports/skill-matrix', admin],
    /* assets */
    ['GET', '/assets', admin], ['GET', '/assets/stats/summary', admin], ['GET', '/assets/my-assets', emp],
    ['GET', '/assets/reports/allocation', admin], ['GET', `/assets/${ids.asset}`, admin, 'asset'],
    /* announcements / notifications */
    ['GET', '/announcements', admin], ['GET', '/announcements/feed/me', emp], ['GET', '/notifications', admin],
    ['GET', '/notifications/unread-count', admin],
    /* users / rbac / audit / settings */
    ['GET', '/users', admin], ['GET', `/users/${ids.user}`, admin, 'user'], ['GET', '/users/roles', admin],
    ['GET', '/users/permissions/catalog', admin], ['GET', '/rbac/catalog', admin],
    ['GET', '/audit', admin], ['GET', '/audit/stats', admin], ['GET', `/audit/record/Employee/${ids.employee}`, admin, 'employee'],
    ['GET', '/settings', admin], ['GET', '/settings/public', null], ['GET', '/settings/roles', admin], ['GET', '/settings/reference-data', admin],
    ['GET', '/settings/system', admin],
    /* reports */
    ...['headcount', 'attrition', 'attendance', 'leave', 'payroll', 'recruitment', 'projects', 'training', 'assets', 'reimbursements', 'performance', 'departments', 'timesheets', 'onboarding-status']
      .map((r) => ['GET', `/reports/${r}?year=${Y}`, admin]),
    ['GET', `/reports/attendance?year=${Y}&month=${M}`, admin],
  ];

  console.log(`\n🔎 UI સરફેસ સ્મોક — ${checks.length} એન્ડપોઇન્ટ | year=${Y}\n`);
  for (const [method, path, token, idKey] of checks) {
    if (idKey && !ids[idKey]) { skips.push(`${method} ${path}`); continue; }
    const r = await api(method, path, { token });
    if (r.status === 200) { pass.push(path); continue; }
    fails.push(`${r.status}  ${method} ${path}  ${r.json?.message ? `→ ${String(r.json.message).slice(0, 120)}` : ''}`);
  }

  console.log(`✅ ${pass.length} OK   ⏭️ ${skips.length} છોડ્યા   ❌ ${fails.length} નિષ્ફળ`);
  if (fails.length) { console.log('\n❌ નિષ્ફળ એન્ડપોઇન્ટ:'); fails.forEach((f) => console.log('  •', f)); }
  if (skips.length) { console.log('\n⏭️  ID વગર છોડેલા:'); skips.forEach((s) => console.log('  •', s)); }
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('💥 સ્મોક અટક્યો:', e.message); process.exit(2); });
