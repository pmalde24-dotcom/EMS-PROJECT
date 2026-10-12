'use strict';
/**
 * EMS seed script
 * ──────────────────────────────────────────────────────────────────
 * Creates the first Super Admin, the RBAC matrix, company settings and
 * (optionally) a realistic demo company: departments, designations,
 * ~40 employees with logins, salary structures, 45 days of attendance,
 * leave balances/requests, projects, tasks, timesheets, recruitment
 * pipeline, assets, training, performance reviews and announcements.
 *
 * Usage:  npm run seed            (skips if data already exists)
 *         npm run seed -- --force (wipes collections first)
 */
const env = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const M = require('../models');
const { nextCode } = require('../utils/sequence');

// Must match CompanySettings.employeeIdPattern so seeded ids continue the shared sequence.
const EMPLOYEE_ID_PATTERN = 'ACM{YYYY}{SEQ:4}';

const FORCE = process.argv.includes('--force');
const TODAY = new Date();
const YEAR = TODAY.getFullYear();

/* Deterministic pseudo-random so runs are reproducible */
let seedValue = 20261011;
const rnd = () => { seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff; return seedValue / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const daysAgo = (n) => new Date(TODAY.getTime() - n * 86400000);
const dateOnly = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const r2 = (n) => Math.round(n * 100) / 100;

const FIRST_M = ['Aarav', 'Vivaan', 'Aditya', 'Rohan', 'Karan', 'Rahul', 'Arjun', 'Nikhil', 'Manish', 'Yash', 'Dhruv', 'Harsh', 'Kunal', 'Siddharth', 'Parth', 'Jay'];
const FIRST_F = ['Priya', 'Ananya', 'Diya', 'Riya', 'Neha', 'Sneha', 'Pooja', 'Kavya', 'Meera', 'Nisha', 'Shruti', 'Ishita', 'Tanvi', 'Aditi'];
const LAST = ['Sharma', 'Patel', 'Shah', 'Mehta', 'Desai', 'Joshi', 'Trivedi', 'Rana', 'Chauhan', 'Vyas', 'Bhatt', 'Nair', 'Iyer', 'Reddy', 'Gupta', 'Agarwal'];
const CITIES = ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Mumbai', 'Pune', 'Bengaluru'];
const SKILLS = ['JavaScript', 'React', 'Node.js', 'Python', 'Java', 'SQL', 'MongoDB', 'AWS', 'Docker', 'Kubernetes', 'Figma', 'Excel', 'Power BI', 'Salesforce', 'SEO', 'Communication', 'Leadership', 'Project Management', 'Tally', 'Recruiting'];

const DEPARTMENTS = [
  { name: 'Engineering', code: 'ENG', description: 'Product engineering, platform and infrastructure', budget: 24000000, location: 'Ahmedabad HQ' },
  { name: 'Sales', code: 'SAL', description: 'Enterprise and SMB revenue teams', budget: 12000000, location: 'Ahmedabad HQ' },
  { name: 'Human Resources', code: 'HR', description: 'Talent acquisition, HR operations and culture', budget: 4500000, location: 'Ahmedabad HQ' },
  { name: 'Finance', code: 'FIN', description: 'Accounting, payroll, compliance and FP&A', budget: 5000000, location: 'Ahmedabad HQ' },
  { name: 'Marketing', code: 'MKT', description: 'Brand, demand generation and content', budget: 6000000, location: 'Remote' },
  { name: 'Operations', code: 'OPS', description: 'Customer success, support and facilities', budget: 7500000, location: 'Ahmedabad HQ' },
];

const DESIGNATIONS = {
  ENG: [
    { title: 'Software Engineer', jobLevel: 'mid', grade: 'M2' },
    { title: 'Senior Software Engineer', jobLevel: 'senior', grade: 'M3' },
    { title: 'Engineering Manager', jobLevel: 'manager', grade: 'M4' },
    { title: 'QA Engineer', jobLevel: 'mid', grade: 'M2' },
    { title: 'DevOps Engineer', jobLevel: 'senior', grade: 'M3' },
    { title: 'Software Engineering Intern', jobLevel: 'intern', grade: 'I1' },
  ],
  SAL: [
    { title: 'Sales Executive', jobLevel: 'junior', grade: 'S1' },
    { title: 'Senior Sales Executive', jobLevel: 'mid', grade: 'S2' },
    { title: 'Sales Manager', jobLevel: 'manager', grade: 'S4' },
    { title: 'Account Manager', jobLevel: 'senior', grade: 'S3' },
  ],
  HR: [
    { title: 'HR Executive', jobLevel: 'junior', grade: 'H1' },
    { title: 'HR Manager', jobLevel: 'manager', grade: 'H3' },
    { title: 'Technical Recruiter', jobLevel: 'mid', grade: 'H2' },
  ],
  FIN: [
    { title: 'Accounts Executive', jobLevel: 'junior', grade: 'F1' },
    { title: 'Finance Manager', jobLevel: 'manager', grade: 'F4' },
    { title: 'Payroll Specialist', jobLevel: 'mid', grade: 'F2' },
  ],
  MKT: [
    { title: 'Marketing Executive', jobLevel: 'junior', grade: 'K1' },
    { title: 'Content Writer', jobLevel: 'mid', grade: 'K2' },
    { title: 'Marketing Manager', jobLevel: 'manager', grade: 'K4' },
  ],
  OPS: [
    { title: 'Operations Executive', jobLevel: 'junior', grade: 'O1' },
    { title: 'Customer Success Manager', jobLevel: 'senior', grade: 'O3' },
    { title: 'Operations Manager', jobLevel: 'manager', grade: 'O4' },
    { title: 'IT Support Engineer', jobLevel: 'mid', grade: 'O2' },
  ],
};

const LEAVE_TYPES = [
  { name: 'Casual Leave', code: 'CL', annualQuota: 12, paid: true, approvalLevels: 2, color: '#6366f1', carryForward: false, allowHalfDay: true },
  { name: 'Sick Leave', code: 'SL', annualQuota: 8, paid: true, approvalLevels: 2, color: '#f59e0b', requiresDocumentAfterDays: 3, allowHalfDay: true },
  { name: 'Earned Leave', code: 'EL', annualQuota: 15, paid: true, approvalLevels: 2, color: '#10b981', carryForward: true, maxCarryForward: 10, encashable: true },
  { name: 'Annual Leave', code: 'AL', annualQuota: 12, paid: true, approvalLevels: 2, color: '#0ea5e9', carryForward: true, maxCarryForward: 5 },
  { name: 'Loss of Pay', code: 'LOP', annualQuota: 0, paid: false, approvalLevels: 1, color: '#ef4444', requiresDocument: false },
  { name: 'Maternity Leave', code: 'ML', annualQuota: 182, paid: true, approvalLevels: 2, color: '#ec4899', genderRestriction: 'female', maxConsecutiveDays: 182 },
  { name: 'Paternity Leave', code: 'PL', annualQuota: 10, paid: true, approvalLevels: 2, color: '#8b5cf6', genderRestriction: 'male', maxConsecutiveDays: 10 },
  { name: 'Work From Home', code: 'WFH', annualQuota: 24, paid: true, approvalLevels: 1, color: '#14b8a6', allowHalfDay: true, carryForward: false },
];

const HOLIDAYS_2026 = [
  ['New Year\'s Day', '01-01', 'public'],
  ['Republic Day', '01-26', 'public'],
  ['Holi', '03-04', 'public'],
  ['Good Friday', '04-03', 'optional'],
  ['Eid ul-Fitr', '04-10', 'public'],
  ['Gujarat Day', '05-01', 'regional'],
  ['Independence Day', '08-15', 'public'],
  ['Janmashtami', '09-04', 'public'],
  ['Gandhi Jayanti', '10-02', 'public'],
  ['Dussehra', '10-20', 'public'],
  ['Diwali', '11-08', 'public'],
  ['Gujarati New Year', '11-10', 'regional'],
  ['Christmas', '12-25', 'public'],
];
const HOLIDAYS_2027 = [['New Year\'s Day', '2027-01-01', 'public'], ['Republic Day', '2027-01-26', 'public']];

async function wipe() {
  const collections = Object.values(M).filter((m) => m && m.collection);
  for (const model of new Set(collections)) {
    try { await model.collection.deleteMany({}); } catch { /* ignore */ }
  }
  console.log('🧹 Existing collections cleared (--force)');
}

/**
 * Runs the seed. Called by the CLI below, and automatically by the server when
 * it starts in in-memory demo mode with an empty database.
 * @param {{ force?: boolean, skipConnect?: boolean }} options
 */
async function runSeed({ force = FORCE, skipConnect = false } = {}) {
  const FORCE_LOCAL = force;
  if (!skipConnect) await connectDatabase();

  const existing = await M.Employee.countDocuments();
  if (existing && !FORCE_LOCAL) {
    console.log(`ℹ️  ${existing} employees already exist — skipping seed. Use "npm run seed -- --force" to reset.`);
    if (!skipConnect) await disconnectDatabase();
    return { skipped: true, employees: existing };
  }
  if (existing) await wipe();

  console.log('⏳ Seeding EMS…');
  const password = 'Password@123';

  /* ── 1. Company settings ─────────────────────────────────────────── */
  const settings = await M.CompanySettings.findOneAndUpdate(
    { singleton: 'company' },
    { $setOnInsert: { singleton: 'company' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  settings.name = 'Acme Technologies Pvt. Ltd.';
  settings.legalName = 'Acme Technologies Private Limited';
  settings.website = 'https://acmetech.example.com';
  settings.email = 'hr@acmetech.example.com';
  settings.phone = '+91 79 4890 1200';
  settings.address = { line1: 'Titanium One, Prahladnagar', line2: 'SG Highway', city: 'Ahmedabad', state: 'Gujarat', country: 'India', pincode: '380015' };
  settings.taxId = '24AABCA1234B1Z5';
  settings.timezone = 'Asia/Kolkata';
  settings.currency = 'INR';
  settings.currencySymbol = '₹';
  settings.workingDays = [1, 2, 3, 4, 5];
  settings.workingHours = { start: '09:30', end: '18:30' };
  settings.financialYearStart = '04-01';
  settings.employeeIdPattern = EMPLOYEE_ID_PATTERN;
  await settings.save();
  await M.Role.seedDefaults();
  console.log('   ✓ company settings + RBAC matrix');

  /* ── 2. Departments & designations ───────────────────────────────── */
  const departments = {};
  for (const d of DEPARTMENTS) {
    departments[d.code] = await M.Department.create({
      name: d.name, code: d.code, description: d.description, location: d.location,
      budget: { annual: d.budget, spent: Math.round(d.budget * (0.3 + rnd() * 0.4)) }, costCenter: `${d.code}-CC-${int(100, 999)}`,
    });
  }
  const designations = {};
  for (const [code, list] of Object.entries(DESIGNATIONS)) {
    for (const t of list) {
      designations[t.title] = await M.Designation.create({
        ...t, department: departments[code]._id,
        salaryBand: { min: { intern: 15000, junior: 30000, mid: 55000, senior: 95000, manager: 140000, lead: 120000, director: 250000, vp: 350000, c_level: 500000 }[t.jobLevel] * 12, max: { intern: 25000, junior: 45000, mid: 85000, senior: 150000, manager: 220000, lead: 180000, director: 350000, vp: 480000, c_level: 700000 }[t.jobLevel] * 12 },
        description: `Responsible for delivering ${t.title.toLowerCase()} outcomes for the ${departments[code].name} function.`,
        responsibilities: ['Own deliverables for your function', 'Collaborate cross-functionally', 'Maintain documentation and quality standards', 'Report progress to your manager'],
      });
    }
  }
  console.log(`   ✓ ${Object.keys(departments).length} departments, ${Object.keys(designations).length} designations`);

  /* ── 3. Shifts & holidays ────────────────────────────────────────── */
  const shiftGeneral = await M.Shift.create({ name: 'General Shift', code: 'GEN', startTime: '09:30', endTime: '18:30', breakMinutes: 60, graceMinutes: 15, weeklyOffs: [0, 6], description: 'Standard 9:30 AM – 6:30 PM' });
  const shiftEarly = await M.Shift.create({ name: 'Early Shift', code: 'EAR', startTime: '07:00', endTime: '16:00', breakMinutes: 45, graceMinutes: 10, weeklyOffs: [0, 6] });
  const shiftSupport = await M.Shift.create({ name: 'Support Shift (Rotational)', code: 'SUP', startTime: '12:00', endTime: '21:00', breakMinutes: 60, graceMinutes: 15, weeklyOffs: [0, 3], rotational: true, isNightShift: false });

  for (const [name, mmdd, type] of HOLIDAYS_2026) {
    await M.Holiday.create({ name, date: new Date(`${YEAR}-${mmdd}T00:00:00.000Z`), year: YEAR, type, description: `${type} holiday`, region: type === 'regional' ? 'Gujarat' : 'National' });
  }
  for (const [name, dateStr, type] of HOLIDAYS_2027) {
    await M.Holiday.create({ name, date: new Date(`${dateStr}T00:00:00.000Z`), year: 2027, type, region: 'National' });
  }
  console.log('   ✓ shifts + holidays');

  /* ── 4. Leave types ──────────────────────────────────────────────── */
  const leaveTypes = {};
  for (const lt of LEAVE_TYPES) leaveTypes[lt.code] = await M.LeaveType.create({ ...lt, accrualType: lt.code === 'CL' ? 'monthly' : 'yearly' });
  console.log(`   ✓ ${Object.keys(leaveTypes).length} leave types`);

  /* ── 5. Password hashing once for speed ──────────────────────────── */
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(password, 10);
  const adminHash = await bcrypt.hash(env.SEED.password, 10);

  /* ── 6. Org roster ───────────────────────────────────────────────── */
  const roster = [
    { first: 'Sanjay', last: 'Mehta', role: 'super_admin', title: 'Engineering Manager', dept: 'ENG', level: 4, salary: 260000, mgr: null, email: env.SEED.email },
    { first: 'Kavita', last: 'Nair', role: 'hr_admin', title: 'HR Manager', dept: 'HR', level: 4, salary: 175000, mgr: null, email: 'kavita.nair@acmetech.example.com' },
    { first: 'Rakesh', last: 'Trivedi', role: 'hr_manager', title: 'Technical Recruiter', dept: 'HR', level: 2, salary: 85000, mgr: 'Kavita' },
    { first: 'Vikram', last: 'Shah', role: 'department_manager', title: 'Engineering Manager', dept: 'ENG', level: 4, salary: 230000, mgr: 'Sanjay' },
    { first: 'Meera', last: 'Desai', role: 'department_manager', title: 'Sales Manager', dept: 'SAL', level: 4, salary: 195000, mgr: null },
    { first: 'Arjun', last: 'Patel', role: 'department_manager', title: 'Finance Manager', dept: 'FIN', level: 4, salary: 210000, mgr: null },
    { first: 'Pooja', last: 'Joshi', role: 'team_leader', title: 'Senior Software Engineer', dept: 'ENG', level: 3, salary: 145000, mgr: 'Vikram' },
    { first: 'Nikhil', last: 'Rana', role: 'team_leader', title: 'Senior Sales Executive', dept: 'SAL', level: 3, salary: 95000, mgr: 'Meera' },
    { first: 'Ananya', last: 'Sharma', role: 'employee', title: 'Software Engineer', dept: 'ENG', level: 2, salary: 75000, mgr: 'Pooja' },
    { first: 'Rohan', last: 'Vyas', role: 'employee', title: 'Software Engineer', dept: 'ENG', level: 2, salary: 72000, mgr: 'Pooja' },
    { first: 'Diya', last: 'Patel', role: 'employee', title: 'QA Engineer', dept: 'ENG', level: 2, salary: 62000, mgr: 'Vikram' },
    { first: 'Karan', last: 'Bhatt', role: 'employee', title: 'DevOps Engineer', dept: 'ENG', level: 3, salary: 118000, mgr: 'Vikram' },
    { first: 'Sneha', last: 'Iyer', role: 'employee', title: 'Software Engineer', dept: 'ENG', level: 2, salary: 78000, mgr: 'Vikram' },
    { first: 'Harsh', last: 'Chauhan', role: 'employee', title: 'Software Engineering Intern', dept: 'ENG', level: 1, salary: 20000, mgr: 'Pooja', status: 'probation' },
    { first: 'Riya', last: 'Mehta', role: 'employee', title: 'Sales Executive', dept: 'SAL', level: 1, salary: 42000, mgr: 'Nikhil' },
    { first: 'Yash', last: 'Gupta', role: 'employee', title: 'Sales Executive', dept: 'SAL', level: 1, salary: 38000, mgr: 'Nikhil' },
    { first: 'Tanvi', last: 'Agarwal', role: 'employee', title: 'Account Manager', dept: 'SAL', level: 3, salary: 88000, mgr: 'Meera' },
    { first: 'Manish', last: 'Reddy', role: 'employee', title: 'Sales Executive', dept: 'SAL', level: 2, salary: 52000, mgr: 'Nikhil' },
    { first: 'Aditi', last: 'Trivedi', role: 'employee', title: 'HR Executive', dept: 'HR', level: 1, salary: 38000, mgr: 'Kavita' },
    { first: 'Parth', last: 'Shah', role: 'employee', title: 'Payroll Specialist', dept: 'FIN', level: 2, salary: 68000, mgr: 'Arjun' },
    { first: 'Ishita', last: 'Desai', role: 'employee', title: 'Accounts Executive', dept: 'FIN', level: 1, salary: 40000, mgr: 'Arjun' },
    { first: 'Jay', last: 'Nair', role: 'employee', title: 'Marketing Executive', dept: 'MKT', level: 1, salary: 36000, mgr: null },
    { first: 'Shruti', last: 'Joshi', role: 'employee', title: 'Content Writer', dept: 'MKT', level: 2, salary: 48000, mgr: null },
    { first: 'Kunal', last: 'Rana', role: 'employee', title: 'Operations Executive', dept: 'OPS', level: 1, salary: 34000, mgr: null },
    { first: 'Nisha', last: 'Vyas', role: 'employee', title: 'Customer Success Manager', dept: 'OPS', level: 3, salary: 92000, mgr: null },
    { first: 'Siddharth', last: 'Patel', role: 'employee', title: 'IT Support Engineer', dept: 'OPS', level: 2, salary: 55000, mgr: null },
    { first: 'Priya', last: 'Sharma', role: 'employee', title: 'Senior Software Engineer', dept: 'ENG', level: 3, salary: 132000, mgr: 'Vikram' },
    { first: 'Rahul', last: 'Mehta', role: 'employee', title: 'Software Engineer', dept: 'ENG', level: 2, salary: 68000, mgr: 'Pooja' },
  ];
  // Fill up to ~40 employees
  const extraCount = 12;
  for (let i = 0; i < extraCount; i++) {
    const female = rnd() > 0.5;
    const deptCode = pick(Object.keys(DESIGNATIONS));
    const title = pick(DESIGNATIONS[deptCode].filter((t) => t.jobLevel !== 'manager')).title;
    roster.push({
      first: female ? pick(FIRST_F) : pick(FIRST_M), last: pick(LAST), role: 'employee',
      title, dept: deptCode, level: int(1, 3), salary: int(32, 95) * 1000, mgr: null,
    });
  }

  const employees = [];
  const byFirst = {};
  const usedEmails = new Set(roster.filter((r) => r.email).map((r) => r.email.toLowerCase()));
  for (const r of roster) {
    const reportingManager = r.mgr ? byFirst[r.mgr] : null;
    const department = departments[r.dept];
    const designation = designations[r.title];
    const joiningDaysAgo = r.status === 'probation' ? int(20, 80) : int(120, 1500);
    const joiningDate = daysAgo(joiningDaysAgo);
    const gender = FIRST_F.includes(r.first) ? 'female' : 'male';
    let email = `${r.first.toLowerCase()}.${r.last.toLowerCase()}@acmetech.example.com`;
    let suffix = 2;
    while (usedEmails.has(email)) { email = `${r.first.toLowerCase()}.${r.last.toLowerCase()}${suffix}@acmetech.example.com`; suffix++; }
    usedEmails.add(email);
    const employee = await M.Employee.create({
      employeeId: await nextCode(EMPLOYEE_ID_PATTERN, { prefix: 'ACM' }),
      firstName: r.first, lastName: r.last,
      email,
      workEmail: email,
      phone: `+91 98${int(100, 999)} ${int(10000, 99999)}`,
      dateOfBirth: new Date(Date.UTC(YEAR - int(24, 46), int(0, 11), int(1, 28))),
      gender,
      maritalStatus: rnd() > 0.6 ? 'married' : 'single',
      bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'A-', 'O-']),
      address: { line1: `${int(1, 99)}, ${pick(['Shivalik', 'Satellite', 'Bopal', 'Prahladnagar', 'Maninagar'])} Residency`, city: pick(CITIES), state: 'Gujarat', country: 'India', pincode: `3800${int(10, 99)}` },
      emergencyContact: { name: `${pick(FIRST_F)} ${r.last}`, relationship: pick(['Spouse', 'Father', 'Mother', 'Sibling']), phone: `+91 99${int(100, 999)} ${int(10000, 99999)}` },
      joiningDate,
      employmentType: r.level === 1 ? 'full_time' : pick(['full_time', 'full_time', 'full_time', 'contract']),
      employmentStatus: r.status || (joiningDaysAgo < 90 ? 'probation' : 'active'),
      employeeCategory: r.status === 'probation' || joiningDaysAgo < 90 ? 'probationer' : pick(['permanent', 'permanent', 'permanent', 'contractual']),
      department: department._id, designation: designation._id,
      reportingManager: reportingManager?._id || null,
      teamLeader: null,
      workLocation: department.location || 'Ahmedabad HQ',
      shift: pick([shiftGeneral._id, shiftGeneral._id, shiftGeneral._id, shiftEarly._id, shiftSupport._id]),
      probationEndDate: new Date(joiningDate.getTime() + 90 * 86400000),
      confirmationDate: joiningDaysAgo > 90 ? new Date(joiningDate.getTime() + 90 * 86400000) : undefined,
      noticePeriodDays: designation.jobLevel === 'manager' ? 60 : 30,
      skills: Array.from({ length: int(3, 6) }, () => ({ name: pick(SKILLS), level: pick(['beginner', 'intermediate', 'advanced', 'expert']), years: int(1, 12) })),
      qualifications: [{ degree: pick(['B.E. Computer Engineering', 'B.Tech IT', 'MBA', 'B.Com', 'M.Sc Statistics', 'BBA']), institution: pick(['Nirma University', 'DAIICT', 'L.D. College of Engineering', 'Gujarat University', 'IIM Ahmedabad', 'M.S. University']), year: YEAR - int(4, 12), grade: pick(['8.4 CGPA', 'First Class', '7.9 CGPA', 'Distinction']) }],
      experience: [{ company: pick(['Infosys', 'TCS', 'Zoho', 'Cognizant', 'Wipro', 'Startup Labs']), title: pick(['Software Engineer', 'Sales Executive', 'Analyst', 'Associate']), from: new Date(Date.UTC(YEAR - int(5, 9), 5, 1)), to: new Date(Date.UTC(YEAR - int(1, 4), 5, 1)), current: false, description: 'Delivered key projects and collaborated with cross-functional teams.' }],
      bank: {
        accountHolderName: `${r.first} ${r.last}`, accountNumber: `${int(10000000, 99999999)}${int(1000, 9999)}`,
        maskedAccountNumber: `XXXXXX${int(1000, 9999)}`, ifsc: `${pick(['HDFC', 'ICIC', 'SBIN', 'AXIS'])}0${int(100000, 999999)}`,
        bankName: pick(['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank']), branch: pick(['Prahladnagar', 'Satellite', 'SG Highway']), accountType: 'salary', verified: true,
      },
      tags: [r.role, designation.jobLevel],
      createdBy: null,
      history: [{ action: 'seeded', note: 'Demo record created by seed script' }],
    });
    // keep the first (explicit roster) employee for name-based references
    if (!byFirst[r.first]) byFirst[r.first] = employee;
    employees.push(employee);
  }
  // link a couple of team leaders
  await M.Employee.updateOne({ _id: byFirst['Ananya']._id }, { teamLeader: byFirst['Pooja']._id });
  await M.Employee.updateOne({ _id: byFirst['Rohan']._id }, { teamLeader: byFirst['Pooja']._id });
  await M.Employee.updateOne({ _id: byFirst['Riya']._id }, { teamLeader: byFirst['Nikhil']._id });
  await M.Department.updateOne({ _id: departments.ENG._id }, { head: byFirst['Sanjay']._id });
  await M.Department.updateOne({ _id: departments.HR._id }, { head: byFirst['Kavita']._id });
  await M.Department.updateOne({ _id: departments.SAL._id }, { head: byFirst['Meera']._id });
  await M.Department.updateOne({ _id: departments.FIN._id }, { head: byFirst['Arjun']._id });
  await M.Department.updateOne({ _id: departments.MKT._id }, { head: byFirst['Shruti']._id });
  await M.Department.updateOne({ _id: departments.OPS._id }, { head: byFirst['Nisha']._id });
  console.log(`   ✓ ${employees.length} employees`);

  /* ── 7. Users (one login per employee) ───────────────────────────── */
  const roleUsers = {};
  for (let i = 0; i < roster.length; i++) {
    const r = roster[i];
    const employee = employees[i];
    const user = await M.User.create({
      name: `${r.first} ${r.last}`,
      email: r.email || employee.email,
      password: r.role === 'super_admin' ? env.SEED.password : password,
      role: r.role,
      employee: employee._id,
      isEmailVerified: true,
      lastLoginAt: daysAgo(int(0, 5)),
      loginCount: int(3, 60),
      loginActivity: [{ at: daysAgo(int(0, 3)), ip: '127.0.0.1', success: true, userAgent: 'seed' }],
    });
    employee.user = user._id;
    await employee.save();
    if (!roleUsers[r.first]) roleUsers[r.first] = user;
    if (r.role === 'super_admin') await M.User.updateOne({ _id: user._id }, { password: adminHash });
  }
  console.log(`   ✓ ${roster.length} user logins`);

  /* ── 8. Salary structures ────────────────────────────────────────── */
  const structures = [];
  for (let i = 0; i < roster.length; i++) {
    const r = roster[i];
    const employee = employees[i];
    const gross = r.salary;
    const basic = Math.round(gross * 0.45);
    const hra = Math.round(basic * 0.4);
    const conveyance = 1600;
    const medical = 1250;
    const special = Math.max(0, gross - basic - hra - conveyance - medical);
    const structure = await M.SalaryStructure.create({
      employee: employee._id, effectiveFrom: employee.joiningDate, ctcAnnual: Math.round((gross * 12) * 1.13),
      basic, hra, specialAllowance: special, conveyance, medicalAllowance: medical,
      otherAllowances: [{ name: 'Internet Reimbursement', amount: 500, type: 'earning' }],
      revision: 'initial', status: 'active', approvedBy: roleUsers['Kavita']._id,
      createdBy: roleUsers['Kavita']._id,
    });
    structures.push(structure);
    await M.SalaryRevision.create({
      employee: employee._id, previousCtc: 0, newCtc: structure.ctcAnnual, previousGross: 0, newGross: structure.grossMonthly,
      incrementPercent: 0, effectiveFrom: employee.joiningDate, revisionType: 'joining', status: 'applied', createdBy: roleUsers['Kavita']._id,
    });
  }
  // One promotion/increment example
  const promoEmp = byFirst['Rohan'];
  const oldStructure = structures[roster.findIndex((r) => r.first === 'Rohan')];
  oldStructure.status = 'superseded';
  oldStructure.effectiveTo = daysAgo(60);
  await oldStructure.save();
  const newBasic = Math.round(oldStructure.basic * 1.18);
  const promoted = await M.SalaryStructure.create({
    employee: promoEmp._id, effectiveFrom: daysAgo(60), ctcAnnual: Math.round(oldStructure.ctcAnnual * 1.18),
    basic: newBasic, hra: Math.round(newBasic * 0.4), conveyance: 1600, medicalAllowance: 1250,
    specialAllowance: Math.max(0, Math.round(oldStructure.grossMonthly * 1.18) - newBasic - Math.round(newBasic * 0.4) - 2850),
    revision: 'annual', revisionReason: 'Annual appraisal FY25-26', status: 'active', approvedBy: roleUsers['Sanjay']._id, createdBy: roleUsers['Kavita']._id,
  });
  await M.SalaryRevision.create({
    employee: promoEmp._id, previousCtc: oldStructure.ctcAnnual, newCtc: promoted.ctcAnnual, previousGross: oldStructure.grossMonthly,
    newGross: promoted.grossMonthly, incrementPercent: r2(((promoted.grossMonthly - oldStructure.grossMonthly) / oldStructure.grossMonthly) * 100),
    effectiveFrom: daysAgo(60), revisionType: 'annual', reason: 'Annual appraisal FY25-26', status: 'applied', approvedBy: roleUsers['Sanjay']._id, createdBy: roleUsers['Kavita']._id,
  });
  console.log(`   ✓ ${structures.length + 1} salary structures`);

  /* ── 9. Leave balances ───────────────────────────────────────────── */
  const balances = [];
  for (const employee of employees) {
    for (const lt of Object.values(leaveTypes)) {
      const used = lt.code === 'LOP' ? 0 : int(0, Math.floor(lt.annualQuota * 0.4));
      balances.push({
        employee: employee._id, leaveType: lt._id, year: YEAR, allocated: lt.annualQuota,
        used, pending: rnd() > 0.85 ? 1 : 0, carriedForward: lt.carryForward ? int(0, lt.maxCarryForward) : 0,
      });
    }
  }
  await M.LeaveBalance.insertMany(balances);
  console.log(`   ✓ ${balances.length} leave balance records`);

  /* ── 10. Attendance for the last 45 days ─────────────────────────── */
  const attendance = [];
  const holidayKeys = new Set((await M.Holiday.find({ year: YEAR }).lean()).map((h) => +dateOnly(new Date(h.date))));
  for (const employee of employees) {
    if (!employee.isActive) continue;
    for (let d = 44; d >= 0; d--) {
      const day = dateOnly(daysAgo(d));
      const dow = day.getUTCDay();
      if (dow === 0 || dow === 6) continue; // weekly off
      if (holidayKeys.has(+day)) continue;
      const shift = [shiftGeneral, shiftEarly, shiftSupport].find((s) => String(s._id) === String(employee.shift)) || shiftGeneral;
      const roll = rnd();
      let status = 'present';
      if (roll > 0.97) status = 'absent';
      else if (roll > 0.94) status = 'on_leave';
      else if (roll > 0.88) status = 'work_from_home';
      else if (roll > 0.82) status = 'half_day';

      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);
      const lateMinutes = status === 'present' && rnd() > 0.75 ? int(16, 55) : 0;
      const checkIn = new Date(day.getTime() + (sh * 60 + sm + lateMinutes + 15) * 60000 - 0); // local-ish offset approximated for demo
      checkIn.setUTCMinutes(checkIn.getUTCMinutes() + 330 - 15); // +5:30 IST (stored in UTC)
      const workedHours = status === 'half_day' ? int(3, 4) : int(8, 10);
      const checkOut = new Date(checkIn.getTime() + (workedHours * 60 + (shift.breakMinutes || 60)) * 60000);
      void eh; void em;

      const makeRecord = (st) => ({
        employee: employee._id, date: day, shift: shift._id,
        status: st,
        checkIn: ['absent', 'on_leave'].includes(st) ? undefined : checkIn,
        checkOut: ['absent', 'on_leave'].includes(st) ? undefined : checkOut,
        breakMinutes: ['absent', 'on_leave'].includes(st) ? 0 : (shift.breakMinutes || 60),
        workedMinutes: ['absent', 'on_leave'].includes(st) ? 0 : (status === 'half_day' ? int(180, 240) : int(470, 600)),
        overtimeMinutes: st === 'present' && rnd() > 0.9 ? int(30, 120) : 0,
        lateMinutes, isLate: lateMinutes > 15,
        isEarlyExit: false, isOvertime: false,
        workFromHome: st === 'work_from_home',
        source: 'biometric',
        punches: ['absent', 'on_leave'].includes(st) ? [] : [{ at: checkIn, type: 'in', source: 'biometric' }, { at: checkOut, type: 'out', source: 'biometric' }],
        remarks: st === 'on_leave' ? 'Approved leave' : undefined,
      });
      const record = makeRecord(status);
      record.isOvertime = record.overtimeMinutes > 0;
      record.auditTrail = [{ action: 'seeded', note: 'Demo attendance generated' }];
      attendance.push(record);
    }
  }
  await M.Attendance.insertMany(attendance, { ordered: false }).catch(() => {});
  console.log(`   ✓ ${attendance.length} attendance records (last 45 days)`);

  /* ── 11. Leave requests ──────────────────────────────────────────── */
  const reasons = ['Family function at home town', 'Fever and body ache — doctor advised rest', 'Personal work', 'Child admission process', 'Travel to native place', 'Medical checkup', 'Attending a wedding'];
  const leaveRequests = [];
  for (let i = 0; i < 40; i++) {
    const employee = pick(employees);
    const lt = pick([leaveTypes.CL, leaveTypes.SL, leaveTypes.EL, leaveTypes.AL, leaveTypes.WFH]);
    const start = daysAgo(int(-20, 60));
    const span = int(1, 4);
    const end = new Date(start.getTime() + span * 86400000);
    const totalDays = span;
    const statusRoll = rnd();
    const status = statusRoll > 0.72 ? 'pending' : statusRoll > 0.62 ? 'rejected' : statusRoll > 0.5 ? 'manager_approved' : 'approved';
    const approvals = [
      { level: 1, role: 'manager', approver: roleUsers['Vikram']._id, status: status === 'pending' ? 'pending' : (status === 'rejected' ? 'rejected' : 'approved'), decidedAt: status === 'pending' ? undefined : daysAgo(int(1, 10)), comment: status === 'rejected' ? 'Critical delivery week — please reschedule' : 'Approved' },
      { level: 2, role: 'hr', approver: roleUsers['Kavita']._id, status: ['approved'].includes(status) ? 'approved' : (status === 'rejected' ? 'skipped' : 'pending'), decidedAt: status === 'approved' ? daysAgo(int(1, 5)) : undefined, comment: status === 'approved' ? 'Approved by HR' : undefined },
    ];
    leaveRequests.push({
      employee: employee._id, leaveType: lt._id, startDate: dateOnly(start), endDate: dateOnly(end),
      totalDays, isHalfDay: false, reason: pick(reasons), status, year: start.getFullYear(),
      currentLevel: status === 'pending' ? 1 : status === 'manager_approved' ? 2 : (status === 'approved' ? 2 : 1),
      approvals, appliedAt: new Date(start.getTime() - int(2, 12) * 86400000),
      contactDuringLeave: `+91 98${int(100000, 999999)}`, handoverTo: pick(employees)._id,
      daysBreakdown: Array.from({ length: span + 1 }).map((_, k) => ({ date: new Date(start.getTime() + k * 86400000), dayValue: 1, isHoliday: false, isWeeklyOff: false })),
      auditTrail: [{ action: 'applied', note: 'Seeded demo request' }],
    });
  }
  // 3 upcoming pending requests for the manager's approval inbox
  for (let i = 0; i < 3; i++) {
    const employee = byFirst[['Ananya', 'Rohan', 'Riya'][i]];
    leaveRequests.push({
      employee: employee._id, leaveType: leaveTypes.CL._id,
      startDate: dateOnly(daysAgo(-int(3, 20))), endDate: dateOnly(daysAgo(-int(21, 24))),
      totalDays: 2, reason: pick(reasons), status: 'pending', year: YEAR, currentLevel: 1,
      approvals: [{ level: 1, role: 'manager', status: 'pending' }, { level: 2, role: 'hr', status: 'pending' }],
      appliedAt: daysAgo(int(1, 4)), auditTrail: [{ action: 'applied', note: 'Awaiting manager approval' }],
    });
  }
  await M.LeaveRequest.insertMany(leaveRequests);
  console.log(`   ✓ ${leaveRequests.length} leave requests`);

  /* ── 12. Projects, tasks, timesheets ─────────────────────────────── */
  const projects = [];
  const projectSpecs = [
    { name: 'Acme Platform Revamp', code: 'PRJ-001', client: 'Internal Product', status: 'active', priority: 'high', billable: false },
    { name: 'Nova Bank Mobile App', code: 'PRJ-002', client: 'Nova Bank Ltd.', status: 'active', priority: 'urgent', billable: true },
    { name: 'Retail Analytics Suite', code: 'PRJ-003', client: 'Metro Retail', status: 'active', priority: 'medium', billable: true },
    { name: 'HR Automation Rollout', code: 'PRJ-004', client: 'Internal Ops', status: 'planning', priority: 'medium', billable: false },
    { name: 'Website Redesign 2026', code: 'PRJ-005', client: 'Marketing', status: 'completed', priority: 'low', billable: false },
  ];
  for (const p of projectSpecs) {
    const team = employees.filter((e) => rnd() > 0.72).slice(0, 5).map((e) => ({ employee: e._id, role: rnd() > 0.7 ? 'Tech Lead' : 'Team Member', allocatedPercent: pick([25, 50, 75, 100]) }));
    const project = await M.Project.create({
      ...p, department: departments.ENG._id, manager: byFirst['Vikram']._id,
      description: `${p.name} — delivery of the agreed scope for ${p.client}.`,
      startDate: daysAgo(int(60, 220)), endDate: new Date(TODAY.getTime() + int(20, 160) * 86400000),
      budget: { amount: int(8, 60) * 100000, spent: int(2, 30) * 100000 },
      team: [{ employee: byFirst['Vikram']._id, role: 'Project Manager', allocatedPercent: 50 }, ...team],
      createdBy: roleUsers['Sanjay']._id, tags: ['delivery', p.client.toLowerCase()],
    });
    projects.push(project);
  }

  const taskTitles = [
    'Design database schema', 'Build REST API endpoints', 'Implement authentication flow', 'Create dashboard UI', 'Write unit tests',
    'Set up CI/CD pipeline', 'Integrate payment gateway', 'Optimise slow queries', 'Add pagination to list APIs', 'Implement role-based access',
    'Prepare UAT test cases', 'Fix reported defects', 'Design onboarding screens', 'Create API documentation', 'Set up monitoring alerts',
    'Migrate legacy data', 'Conduct performance audit', 'Configure backup strategy', 'Build reporting module', 'Implement notification service',
  ];
  const tasks = [];
  for (let i = 0; i < 70; i++) {
    const project = pick(projects);
    const status = pick(['todo', 'todo', 'in_progress', 'in_progress', 'in_review', 'completed', 'completed', 'blocked']);
    const dueDate = daysAgo(int(status === 'completed' ? 2 : -25, status === 'completed' ? 40 : 5));
    const assignees = [pick(employees.filter((e) => e.department.toString() === departments.ENG._id.toString() || rnd() > 0.5)), pick(employees)];
    tasks.push({
      title: `${pick(taskTitles)}${i % 7 === 0 ? ' — phase 2' : ''}`,
      description: 'Deliver the described scope, update the task with progress notes and attach evidence where relevant.',
      project: project._id, assignees: [...new Set(assignees.map((a) => a._id))],
      assignedBy: byAddr(byFirst['Vikram']._id), department: departments.ENG._id,
      status, priority: pick(['low', 'medium', 'medium', 'high', 'urgent']),
      startDate: daysAgo(int(30, 80)), dueDate, completedAt: status === 'completed' ? daysAgo(int(1, 20)) : undefined,
      estimatedHours: pick([4, 8, 12, 16, 24, 40]), loggedHours: int(0, 30), progressPercent: status === 'completed' ? 100 : int(0, 80),
      billable: project.billable, tags: ['sprint', pick(['feature', 'bug', 'tech-debt', 'research'])],
      subtasks: Array.from({ length: int(1, 3) }).map((_, k) => ({ title: `Sub-task ${k + 1}`, completed: status === 'completed', order: k })),
      activity: [{ action: 'created', note: 'Seeded demo task' }],
      createdBy: roleUsers['Vikram']._id,
    });
  }
  await M.Task.insertMany(tasks);
  function byAddr(v) { return v; }

  // Timesheets for the last 4 weeks
  const weekStartOf = (d) => { const x = dateOnly(d); const day = x.getUTCDay(); x.setUTCDate(x.getUTCDate() - ((day + 6) % 7)); return x; };
  const timesheets = [];
  for (const employee of employees.slice(0, 20)) {
    for (let w = 3; w >= 0; w--) {
      const weekStart = weekStartOf(daysAgo(w * 7));
      const entries = [];
      for (let d = 0; d < 5; d++) {
        const date = new Date(weekStart.getTime() + d * 86400000);
        const count = int(1, 2);
        for (let c = 0; c < count; c++) {
          const project = pick(projects);
          const task = pick(tasks.filter((t) => String(t.project) === String(project._id))) || pick(tasks);
          entries.push({ date, project: project._id, task: task._id, hours: pick([4, 6, 7.5, 8]), description: pick(['Feature development', 'Code review and fixes', 'Client discussion and planning', 'Testing and QA support', 'Documentation']), billable: project.billable, overtime: rnd() > 0.9 });
        }
      }
      const status = w === 0 ? 'draft' : pick(['approved', 'submitted', 'approved']);
      timesheets.push({
        employee: employee._id, weekStart, weekEnd: new Date(weekStart.getTime() + 6 * 86400000),
        isoWeek: `${weekStart.getUTCFullYear()}-W${Math.ceil(weekStart.getUTCDate() / 7)}`, year: weekStart.getUTCFullYear(),
        entries, status, submittedAt: status !== 'draft' ? new Date(weekStart.getTime() + 6 * 86400000) : undefined,
        approver: status === 'approved' ? byFirst['Vikram']._id : undefined, decidedAt: status === 'approved' ? daysAgo(int(1, 5)) : undefined,
        approverComment: status === 'approved' ? 'Looks good' : undefined,
        auditTrail: [{ action: 'seeded', note: 'Demo timesheet' }],
      });
    }
  }
  await M.Timesheet.insertMany(timesheets);
  console.log(`   ✓ ${projects.length} projects, ${tasks.length} tasks, ${timesheets.length} timesheets`);

  /* ── 13. Recruitment ─────────────────────────────────────────────── */
  const jobSpecs = [
    { title: 'Senior React Developer', dept: 'ENG', designation: 'Senior Software Engineer', openings: 2, salary: [1200000, 1800000], skills: ['React', 'JavaScript', 'TypeScript', 'Node.js'] },
    { title: 'Sales Executive (Ahmedabad)', dept: 'SAL', designation: 'Sales Executive', openings: 3, salary: [400000, 650000], skills: ['Salesforce', 'Communication', 'Negotiation'] },
    { title: 'DevOps Engineer', dept: 'ENG', designation: 'DevOps Engineer', openings: 1, salary: [1100000, 1600000], skills: ['AWS', 'Docker', 'Kubernetes', 'CI/CD'] },
    { title: 'Finance Executive', dept: 'FIN', designation: 'Accounts Executive', openings: 1, salary: [380000, 520000], skills: ['Excel', 'Tally', 'Accounting'] },
    { title: 'Marketing Content Writer', dept: 'MKT', designation: 'Content Writer', openings: 1, salary: [420000, 680000], skills: ['SEO', 'Content Strategy'] },
  ];
  const jobs = [];
  for (const j of jobSpecs) {
    const job = await M.JobOpening.create({
      jobCode: `JOB${String(jobs.length + 101)}`, title: j.title, department: departments[j.dept]._id,
      designation: designations[j.designation]._id,
      description: `We are hiring a ${j.title} to join our ${departments[j.dept].name} team. You will own delivery, collaborate with cross-functional teams and contribute to our roadmap.`,
      responsibilities: ['Own end-to-end delivery of assigned workstreams', 'Collaborate with product and design', 'Maintain high quality standards', 'Mentor junior team members'],
      requiredSkills: j.skills, preferredSkills: ['Team player', 'Ownership'],
      experienceMin: j.title.includes('Senior') ? 5 : 2, experienceMax: j.title.includes('Senior') ? 10 : 5,
      qualifications: ['Bachelor\'s degree or equivalent experience'],
      employmentType: 'full_time', workMode: pick(['onsite', 'hybrid']), location: 'Ahmedabad',
      openings: j.openings, salaryRange: { min: j.salary[0], max: j.salary[1], currency: 'INR' },
      applicationDeadline: new Date(TODAY.getTime() + int(15, 60) * 86400000), priority: pick(['medium', 'high']),
      status: 'open', hiringManager: byFirst['Vikram']._id, recruiter: roleUsers['Rakesh']._id,
      interviewRounds: [{ name: 'Screening', order: 1, type: 'screening' }, { name: 'Technical', order: 2, type: 'technical' }, { name: 'Managerial', order: 3, type: 'managerial' }, { name: 'HR', order: 4, type: 'hr' }],
      publishedAt: daysAgo(int(10, 60)), createdBy: roleUsers['Rakesh']._id,
    });
    jobs.push(job);
  }
  const stages = ['applied', 'screening', 'shortlisted', 'interview_scheduled', 'selected', 'offer_sent', 'hired', 'rejected'];
  const applications = [];
  for (let i = 0; i < 55; i++) {
    const job = pick(jobs);
    const gender = rnd() > 0.5;
    const first = gender ? pick(FIRST_F) : pick(FIRST_M);
    const last = pick(LAST);
    const stage = stages[Math.min(stages.length - 1, Math.floor(Math.pow(rnd(), 1.6) * stages.length))];
    const appNo = `APP${YEAR}${String(1000 + i)}`;
    const appliedAt = daysAgo(int(1, 45));
    const history = stages.slice(0, stages.indexOf(stage) + 1).map((s, k) => ({ stage: s, at: new Date(appliedAt.getTime() + k * 86400000), note: `Moved to ${s}` }));
    applications.push({
      applicationNo: appNo, jobOpening: job._id,
      candidate: {
        firstName: first, lastName: last, email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
        phone: `+91 97${int(100, 999)} ${int(10000, 99999)}`, dateOfBirth: new Date(Date.UTC(YEAR - int(22, 40), int(0, 11), int(1, 28))),
        gender, currentCompany: pick(['Infosys', 'TCS', 'Zoho', 'Fresh Graduate', 'Wipro', 'Freelance']),
        currentDesignation: pick(['Software Engineer', 'Senior Engineer', 'Sales Executive', 'Analyst', 'Associate']),
        totalExperience: int(0, 9), currentCtc: int(4, 18) * 100000, expectedCtc: int(6, 26) * 100000,
        noticePeriodDays: pick([0, 15, 30, 60, 90]), currentLocation: pick(CITIES), preferredLocation: 'Ahmedabad',
        linkedIn: `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}`,
      },
      source: pick(['careers_page', 'referral', 'linkedin', 'job_portal', 'agency']),
      skills: Array.from({ length: int(3, 6) }, () => pick(SKILLS)),
      qualifications: [{ degree: pick(['B.Tech', 'B.E.', 'MBA', 'B.Com', 'MCA']), institution: pick(['Nirma University', 'DAIICT', 'GTU', 'Gujarat University']), year: YEAR - int(2, 10) }],
      experience: [{ company: pick(['Infosys', 'TCS', 'Zoho']), title: 'Software Engineer', from: new Date(Date.UTC(YEAR - 4, 0, 1)), to: new Date(Date.UTC(YEAR - 1, 0, 1)), description: 'Built and shipped product features.' }],
      stage, stageHistory: history, appliedAt,
      screening: ['applied'].includes(stage) ? undefined : { score: int(50, 95), notes: 'Relevant experience and skills', screenedBy: roleUsers['Rakesh']._id, screenedAt: appliedAt, qualified: stage !== 'rejected' },
      rating: rnd() > 0.4 ? int(3, 5) : undefined,
      rejectionReason: stage === 'rejected' ? pick(['Skills mismatch', 'Expected CTC too high', 'Failed technical round', 'Position filled']) : undefined,
      assignedTo: roleUsers['Rakesh']._id,
      interviews: ['interview_scheduled', 'selected', 'offer_sent', 'hired', 'rejected'].includes(stage) ? [{
        round: 1, name: 'Technical Round 1', type: 'technical', scheduledAt: new Date(appliedAt.getTime() + 5 * 86400000),
        durationMinutes: 60, mode: 'video', meetingLink: 'https://meet.example.com/abc-defg-hij',
        interviewers: [byFirst['Vikram']._id], status: stage === 'interview_scheduled' ? 'scheduled' : 'completed',
        feedback: ['selected', 'offer_sent', 'hired'].includes(stage) ? [{ interviewer: byFirst['Vikram']._id, ratings: { technical: int(3, 5), communication: int(3, 5), problemSolving: int(3, 5), cultureFit: int(3, 5) }, overallRating: int(3, 5), strengths: 'Strong fundamentals', concerns: 'None major', recommendation: 'hire', comments: 'Recommended to proceed', submittedAt: new Date(appliedAt.getTime() + 6 * 86400000) }] : [],
        result: ['selected', 'offer_sent', 'hired'].includes(stage) ? 'pass' : (stage === 'rejected' ? 'fail' : null),
      }] : [],
      offer: ['offer_sent', 'hired'].includes(stage) ? { status: stage === 'hired' ? 'accepted' : 'sent', ctc: int(7, 20) * 100000, joiningDate: new Date(TODAY.getTime() + int(10, 60) * 86400000), sentAt: daysAgo(int(1, 10)), expiryDate: new Date(TODAY.getTime() + int(5, 15) * 86400000) } : { status: 'not_sent' },
    });
  }
  await M.JobApplication.insertMany(applications);
  console.log(`   ✓ ${jobs.length} job openings, ${applications.length} applications`);

  /* ── 14. Assets + assignments ────────────────────────────────────── */
  const assetSpecs = [
    ...Array.from({ length: 24 }).map((_, i) => ({ name: `Dell Latitude 5450 #${i + 1}`, category: 'laptop', brand: 'Dell', price: 78000 })),
    ...Array.from({ length: 6 }).map((_, i) => ({ name: `HP ProDesk 400 #${i + 1}`, category: 'desktop', brand: 'HP', price: 52000 })),
    ...Array.from({ length: 12 }).map((_, i) => ({ name: `Dell 24" Monitor #${i + 1}`, category: 'monitor', brand: 'Dell', price: 14500 })),
    ...Array.from({ length: 8 }).map((_, i) => ({ name: `Samsung Galaxy A54 #${i + 1}`, category: 'mobile', brand: 'Samsung', price: 28000 })),
    ...Array.from({ length: 30 }).map((_, i) => ({ name: `Access Card #${100 + i}`, category: 'access_card', brand: 'HID', price: 800 })),
    ...Array.from({ length: 20 }).map((_, i) => ({ name: `Logitech Keyboard+Mouse #${i + 1}`, category: 'keyboard', brand: 'Logitech', price: 2400 })),
    ...Array.from({ length: 10 }).map((_, i) => ({ name: `Jabra Headset #${i + 1}`, category: 'headset', brand: 'Jabra', price: 6500 })),
  ];
  const assets = [];
  for (let i = 0; i < assetSpecs.length; i++) {
    const a = assetSpecs[i];
    assets.push({
      assetId: await nextCode('AST{YYYY}{SEQ:4}', { prefix: 'AST', seqKey: 'asset' }), name: a.name, category: a.category, brand: a.brand,
      model: `${a.brand} ${int(1000, 9999)}`, serialNumber: `SN${int(100000, 999999)}${i}`,
      specifications: a.category === 'laptop' ? 'Intel i7 / 16GB RAM / 512GB SSD' : undefined,
      purchaseDate: daysAgo(int(90, 900)), purchasePrice: a.price, vendor: pick(['Dell India', 'HP Store', 'Amazon Business', 'Croma']),
      invoiceNumber: `INV-${int(10000, 99999)}`, warrantyExpiry: new Date(TODAY.getTime() + int(-30, 700) * 86400000),
      condition: pick(['new', 'good', 'good', 'good', 'fair']), status: 'available', location: 'Ahmedabad HQ',
      department: departments.OPS._id, accessories: a.category === 'laptop' ? ['Charger', 'Bag'] : undefined,
      createdBy: roleUsers['Kavita']._id,
    });
  }
  const createdAssets = await M.Asset.insertMany(assets);

  const assignments = [];
  const assetPool = [...createdAssets];
  for (const employee of employees.slice(0, 26)) {
    const count = int(1, 3);
    for (let c = 0; c < count; c++) {
      const asset = assetPool.shift();
      if (!asset) break;
      asset.status = 'assigned'; asset.currentHolder = employee._id; asset.assignedAt = daysAgo(int(10, 400));
      await asset.save();
      assignments.push({
        asset: asset._id, employee: employee._id, assignedAt: asset.assignedAt, assignedBy: roleUsers['Siddharth'] ? roleUsers['Kavita']._id : roleUsers['Kavita']._id,
        conditionAtAssignment: 'good', status: 'assigned',
        acknowledgement: { signed: rnd() > 0.3, signedAt: asset.assignedAt, ip: '127.0.0.1' },
      });
    }
  }
  await M.AssetAssignment.insertMany(assignments);
  // a maintenance record + a returned asset
  await M.AssetMaintenance.create({ asset: createdAssets[2]._id, type: 'repair', issue: 'Screen flickering — panel replacement required', vendor: 'Dell Service Centre', sentDate: daysAgo(7), status: 'in_progress', reportedBy: roleUsers['Kavita']._id });
  console.log(`   ✓ ${createdAssets.length} assets, ${assignments.length} assignments`);

  /* ── 15. Training ────────────────────────────────────────────────── */
  const programSpecs = [
    { title: 'Secure Coding Practices', category: 'technical', type: 'internal', hours: 6, skills: ['Security', 'JavaScript'] },
    { title: 'React Advanced Patterns', category: 'technical', type: 'workshop', hours: 8, skills: ['React', 'JavaScript'] },
    { title: 'Effective Communication', category: 'soft_skills', type: 'external', hours: 4, skills: ['Communication'] },
    { title: 'POSH & Code of Conduct (Mandatory)', category: 'compliance', type: 'online', hours: 2, skills: [], mandatory: true },
    { title: 'Leadership Foundations for New Managers', category: 'leadership', type: 'workshop', hours: 12, skills: ['Leadership', 'Project Management'] },
  ];
  const programs = [];
  for (const p of programSpecs) {
    const program = await M.TrainingProgram.create({
      ...p, code: `TRN${int(100, 999)}`, description: `${p.title} — a ${p.hours}-hour programme designed to level up the team.`,
      type: p.type, startDate: daysAgo(int(10, 60)), endDate: new Date(TODAY.getTime() + int(5, 45) * 86400000),
      trainer: { name: pick(['Dr. Anil Kumar', 'Sneha Rao', 'Internal L&D Team', 'XLRI Faculty']), email: 'trainer@example.com', isInternal: p.type === 'internal' },
      venue: p.type === 'online' ? undefined : 'Training Room 2, 4th Floor', meetingLink: p.type === 'online' ? 'https://meet.example.com/training' : undefined,
      skillsCovered: p.skills, certificateProvided: true, assessmentRequired: p.category !== 'soft_skills', passingScore: 60,
      status: 'ongoing', createdBy: roleUsers['Kavita']._id, feedbackForm: [{ question: 'How would you rate the content?', type: 'rating' }, { question: 'Suggestions for improvement', type: 'text' }],
    });
    programs.push(program);
  }
  const trainingAssignments = [];
  for (const program of programs) {
    const attendees = employees.filter(() => rnd() > (program.mandatory ? 0.25 : 0.7)).slice(0, program.mandatory ? 40 : int(6, 14));
    for (const employee of attendees) {
      const status = pick(['completed', 'completed', 'in_progress', 'assigned']);
      trainingAssignments.push({
        program: program._id, employee: employee._id, assignedBy: roleUsers['Kavita']._id, assignedAt: daysAgo(int(5, 50)),
        dueDate: new Date(TODAY.getTime() + int(-5, 40) * 86400000), status,
        progressPercent: status === 'completed' ? 100 : int(10, 80),
        attendancePercent: status === 'completed' ? 100 : int(40, 90),
        score: status === 'completed' ? int(62, 96) : undefined, result: status === 'completed' ? 'pass' : 'pending',
        certificate: status === 'completed' && program.certificateProvided ? { issued: true, issuedAt: daysAgo(int(1, 20)), certificateNo: `CERT-${program.code}-${int(1000, 9999)}` } : { issued: false },
        feedback: status === 'completed' && rnd() > 0.4 ? { overallRating: int(3, 5), contentRating: int(3, 5), trainerRating: int(3, 5), comments: 'Very useful session', wouldRecommend: true, submittedAt: daysAgo(int(1, 15)) } : undefined,
        skillsAcquired: status === 'completed' ? program.skillsCovered.slice(0, 1) : [],
        completedAt: status === 'completed' ? daysAgo(int(1, 25)) : undefined,
      });
    }
  }
  await M.TrainingAssignment.insertMany(trainingAssignments);
  console.log(`   ✓ ${programs.length} training programs, ${trainingAssignments.length} enrollments`);

  /* ── 16. Performance ────────────────────────────────────────────── */
  const competencies = ['Job Knowledge', 'Quality of Work', 'Productivity', 'Communication', 'Teamwork', 'Ownership', 'Initiative', 'Customer Focus'];
  const template = await M.PerformanceTemplate.create({
    name: 'Annual Review FY26', cycleType: 'annual', description: 'Standard annual performance review for all employees',
    competencies: competencies.map((c) => ({ name: c, description: `Assessment of ${c.toLowerCase()}`, weight: 1 })),
    ratingScale: { min: 1, max: 5, labels: ['Needs Improvement', 'Below Expectations', 'Meets Expectations', 'Exceeds Expectations', 'Outstanding'] },
    includeSelfAssessment: true, includeManagerAssessment: true, includeHRReview: true, isDefault: true, createdBy: roleUsers['Kavita']._id,
  });
  const cycle = `FY${String(YEAR).slice(2)}-H1`;
  const reviews = [];
  for (const employee of employees.slice(0, 22)) {
    const status = pick(['released', 'completed', 'hr_pending', 'manager_pending', 'self_pending']);
    const finalRating = ['released', 'completed'].includes(status) ? int(3, 5) : undefined;
    reviews.push({
      employee: employee._id, cycle, cycleType: 'annual', template: template._id,
      periodStart: new Date(Date.UTC(YEAR, 0, 1)), periodEnd: new Date(Date.UTC(YEAR, 5, 30)),
      reviewer: employee.reportingManager, hrReviewer: byFirst['Kavita']._id,
      ratingScale: { min: 1, max: 5, labels: ['Needs Improvement', 'Below Expectations', 'Meets Expectations', 'Exceeds Expectations', 'Outstanding'] },
      selfAssessment: status === 'self_pending' ? { submitted: false } : {
        submitted: true, submittedAt: daysAgo(int(30, 60)),
        ratings: competencies.map((c) => ({ competency: c, name: c, rating: int(3, 5) })),
        comments: 'Delivered the planned roadmap and supported the team during peak load.', achievements: 'Shipped 3 major features, reduced API latency by 30%.',
        challenges: 'Balancing feature work with support requests.', overallSelfRating: int(3, 5),
      },
      managerAssessment: ['manager_pending', 'self_pending'].includes(status) ? { submitted: false } : {
        submitted: true, submittedAt: daysAgo(int(10, 28)), ratings: competencies.map((c) => ({ competency: c, name: c, rating: int(3, 5) })),
        comments: 'Consistent performer with strong ownership.', strengths: 'Technical depth, dependable delivery', improvements: 'Delegate more, document decisions',
        overallRating: finalRating || int(3, 5), promotionRecommended: rnd() > 0.75, incrementRecommended: pick([0, 5, 8, 10, 12]),
      },
      hrAssessment: ['released', 'completed'].includes(status) ? { submitted: true, submittedAt: daysAgo(int(2, 10)), comments: 'Calibrated with departmental ratings', finalRating, approved: true, calibratedRating: finalRating } : { submitted: false },
      finalRating, status, releasedAt: status === 'released' ? daysAgo(int(1, 8)) : undefined,
      promotionEligible: finalRating >= 4, hikePercent: finalRating ? (finalRating - 2) * 4 : undefined,
      auditTrail: [{ action: 'seeded', note: 'Demo review' }],
    });
  }
  await M.PerformanceReview.insertMany(reviews);

  const goals = [];
  for (const employee of employees.slice(0, 18)) {
    const count = int(2, 3);
    for (let i = 0; i < count; i++) {
      const target = pick([100, 120, 5, 10, 25]);
      const current = Math.round(target * (rnd() * 0.9));
      goals.push({
        employee: employee._id, title: pick(['Improve API response time by 25%', 'Deliver mobile app v2.0', 'Close 20 enterprise deals', 'Reduce support tickets by 15%', 'Achieve AWS certification', 'Launch new onboarding flow']),
        description: 'Tracked quarterly with measurable key results.', type: pick(['okr', 'kpi', 'individual', 'development']),
        category: pick(['business', 'technical', 'customer', 'learning']), period: cycle,
        startDate: new Date(Date.UTC(YEAR, 0, 1)), dueDate: new Date(Date.UTC(YEAR, 5, 30)),
        keyResults: [{ title: 'Key result 1', target, current: Math.min(current, target), unit: pick(['%', 'count', 'days']), status: current >= target ? 'achieved' : 'on_track' }],
        status: current >= target ? 'achieved' : 'in_progress', priority: pick(['medium', 'high']), createdBy: roleUsers['Kavita']._id,
        auditTrail: [{ action: 'seeded', note: 'Demo goal' }],
      });
    }
  }
  await M.Goal.insertMany(goals);
  // A PIP example
  await M.PerformancePlan.create({
    employee: byFirst['Yash']._id, type: 'improvement_plan', title: 'Performance Improvement Plan — Sales Metrics',
    reason: 'Below-target achievement for two consecutive quarters (68% of quota).',
    objectives: [{ title: 'Achieve 90% of monthly quota', successCriteria: 'Tracked weekly in CRM', status: 'pending' }, { title: 'Complete consultative selling training', status: 'pending' }],
    startDate: daysAgo(20), endDate: new Date(TODAY.getTime() + 40 * 86400000), reviewDates: [daysAgo(-10), daysAgo(-25)],
    mentor: byFirst['Nikhil']._id, hrOwner: byFirst['Kavita']._id, status: 'active',
  });
  console.log(`   ✓ ${reviews.length} performance reviews, ${goals.length} goals`);

  /* ── 17. Reimbursements ──────────────────────────────────────────── */
  const claims = [];
  for (let i = 0; i < 28; i++) {
    const employee = pick(employees);
    const category = pick(['travel', 'food', 'accommodation', 'internet', 'mobile', 'medical', 'training', 'client_entertainment']);
    const amount = pick([450, 800, 1200, 2500, 3500, 5200, 7800, 12500]);
    const status = pick(['pending', 'pending', 'approved', 'approved', 'paid', 'rejected']);
    claims.push({
      claimNo: `RMB${YEAR}${String(1000 + i)}`, employee: employee._id, category,
      title: `${category.replace('_', ' ')} expense claim`, description: 'Business expense incurred for client engagement / work requirement.',
      amount, expenseDate: daysAgo(int(3, 70)),
      status, currentLevel: status === 'pending' ? 1 : 2,
      approvals: [
        { level: 1, role: 'manager', approver: roleUsers['Vikram']._id, status: status === 'pending' ? 'pending' : (status === 'rejected' ? 'rejected' : 'approved'), decidedAt: status !== 'pending' ? daysAgo(int(1, 20)) : undefined, comment: status === 'rejected' ? 'Receipt not attached properly' : 'Approved' },
        { level: 2, role: 'finance', status: ['approved', 'paid'].includes(status) ? 'approved' : 'pending', decidedAt: ['approved', 'paid'].includes(status) ? daysAgo(int(1, 10)) : undefined, comment: status === 'paid' ? 'Processed in payroll' : undefined },
      ],
      approvedAmount: ['approved', 'paid'].includes(status) ? amount : undefined,
      rejectionReason: status === 'rejected' ? 'Receipt not attached properly' : undefined,
      paidAt: status === 'paid' ? daysAgo(int(1, 8)) : undefined,
      receipts: [{ fileName: 'receipt.pdf', url: '/uploads/receipts/sample-receipt.pdf', fileType: 'application/pdf', size: 128000 }],
      auditTrail: [{ action: 'seeded', note: 'Demo claim' }],
    });
  }
  await M.Reimbursement.insertMany(claims);
  console.log(`   ✓ ${claims.length} reimbursement claims`);

  /* ── 18. Onboarding & offboarding ────────────────────────────────── */
  const onboardTemplate = await M.OnboardingTemplate.create({
    name: 'Standard Onboarding (Engineering)', description: 'Default 30-day onboarding checklist',
    department: departments.ENG._id, isDefault: true, createdBy: roleUsers['Kavita']._id,
    tasks: [
      { title: 'Collect signed offer & appointment letter', category: 'documentation', ownerRole: 'hr', dueAfterDays: 1, order: 1 },
      { title: 'Verify identity & education documents', category: 'documentation', ownerRole: 'hr', dueAfterDays: 3, order: 2 },
      { title: 'Issue laptop, access card and email account', category: 'it_setup', ownerRole: 'it', dueAfterDays: 1, order: 3 },
      { title: 'Grant repository, VPN and tool access', category: 'it_setup', ownerRole: 'it', dueAfterDays: 2, order: 4 },
      { title: 'Company orientation session', category: 'introduction', ownerRole: 'hr', dueAfterDays: 2, order: 5 },
      { title: 'Team introduction & buddy assignment', category: 'introduction', ownerRole: 'manager', dueAfterDays: 3, order: 6 },
      { title: 'Codebase walkthrough & dev environment setup', category: 'training', ownerRole: 'manager', dueAfterDays: 7, order: 7 },
      { title: 'Complete POSH & code of conduct training', category: 'compliance', ownerRole: 'employee', dueAfterDays: 14, order: 8 },
      { title: '30-day check-in with reporting manager', category: 'hr_formalities', ownerRole: 'manager', dueAfterDays: 30, order: 9 },
    ],
    documentsRequired: [
      { title: 'Aadhaar / Government photo ID', category: 'identity', mandatory: true },
      { title: 'PAN Card', category: 'identity', mandatory: true },
      { title: 'Education certificates', category: 'education', mandatory: true },
      { title: 'Previous experience & relieving letters', category: 'experience', mandatory: false },
      { title: 'Bank account details / cancelled cheque', category: 'identity', mandatory: true },
    ],
  });

  const newJoiners = [byFirst['Harsh'], byFirst['Rahul']];
  for (const emp of newJoiners) {
    const start = emp.joiningDate;
    await M.Onboarding.create({
      employee: emp._id, template: onboardTemplate._id, status: 'in_progress', startDate: start,
      targetCompletionDate: new Date(start.getTime() + 30 * 86400000),
      tasks: onboardTemplate.tasks.map((t, i) => ({ ...t, dueDate: new Date(start.getTime() + (t.dueAfterDays || 1) * 86400000), status: rnd() > 0.5 ? 'completed' : (rnd() > 0.5 ? 'in_progress' : 'pending'), completedAt: undefined, order: t.order ?? i })),
      documents: onboardTemplate.documentsRequired.map((d) => ({ title: d.title, category: d.category, status: pick(['verified', 'submitted', 'pending']) })),
      agreements: [
        { title: 'Offer Letter', type: 'offer_letter', acknowledged: true, acknowledgedAt: start },
        { title: 'Appointment Letter', type: 'appointment_letter', acknowledged: rnd() > 0.5, acknowledgedAt: rnd() > 0.5 ? start : undefined },
        { title: 'NDA & Code of Conduct', type: 'nda', acknowledged: rnd() > 0.4 },
      ],
      orientation: [
        { title: 'Company introduction & culture', scheduledAt: start, durationMinutes: 60, presenter: 'HR', completed: true },
        { title: 'Team introduction', scheduledAt: new Date(start.getTime() + 86400000), durationMinutes: 30, presenter: 'Reporting Manager', completed: true },
        { title: 'Tools & systems walkthrough', scheduledAt: new Date(start.getTime() + 2 * 86400000), durationMinutes: 45, presenter: 'Buddy' },
      ],
      buddy: byFirst['Ananya']._id, hrOwner: roleUsers['Kavita']._id, managerOwner: emp.reportingManager,
      auditTrail: [{ action: 'seeded', note: 'Demo onboarding journey' }],
    });
  }

  // One complete offboarding example (ex-employee) + one in progress
  const exitedEmployee = await M.Employee.create({
    employeeId: await nextCode(EMPLOYEE_ID_PATTERN, { prefix: 'ACM' }), firstName: 'Deepak', lastName: 'Solanki',
    email: 'deepak.solanki@acmetech.example.com', phone: '+91 98250 44556',
    dateOfBirth: new Date(Date.UTC(YEAR - 33, 4, 14)), gender: 'male',
    joiningDate: daysAgo(900), employmentType: 'full_time', employmentStatus: 'resigned', employeeCategory: 'permanent',
    department: departments.SAL._id, designation: designations['Sales Executive']._id, reportingManager: byFirst['Meera']._id,
    workLocation: 'Ahmedabad HQ', resignationDate: daysAgo(45), lastWorkingDay: daysAgo(5), exitReason: 'better_opportunity',
    isActive: false, bank: { accountHolderName: 'Deepak Solanki', maskedAccountNumber: 'XXXXXX7788', bankName: 'HDFC Bank', accountType: 'salary' },
    history: [{ action: 'offboarded', note: 'Exited with notice period served' }],
  });
  await M.Offboarding.create({
    employee: exitedEmployee._id, resignationDate: daysAgo(45), lastWorkingDay: daysAgo(5),
    noticePeriodDays: 30, noticeServedDays: 40, noticeShortfallDays: 0, reason: 'better_opportunity',
    reasonDetails: 'Accepted an offer with a larger sales leadership scope.',
    status: 'completed',
    approvals: [{ level: 1, role: 'manager', approver: roleUsers['Meera']._id, status: 'approved', decidedAt: daysAgo(40), comment: 'Approved — team will handle handover' }, { level: 2, role: 'hr', approver: roleUsers['Kavita']._id, status: 'approved', decidedAt: daysAgo(38), comment: 'Approved' }],
    exitInterview: { mode: 'video', conductedAt: daysAgo(10), conductedBy: roleUsers['Kavita']._id, ratings: { workEnvironment: 4, management: 3, compensation: 3, growth: 3, workLifeBalance: 4 }, feedback: 'Good learning culture and supportive peers. Compensation could be more competitive.', suggestions: 'Strengthen the inside-sales enablement programme.', wouldRecommend: true, rehireEligible: true },
    tasks: [
      { title: 'Knowledge transfer document completed', category: 'handover', ownerRole: 'employee', status: 'completed', completedAt: daysAgo(12) },
      { title: 'Pending tasks reassigned to team', category: 'handover', ownerRole: 'manager', status: 'completed', completedAt: daysAgo(12) },
      { title: 'Return laptop / desktop', category: 'asset_return', ownerRole: 'employee', status: 'completed', completedAt: daysAgo(6) },
      { title: 'Return access card & ID', category: 'asset_return', ownerRole: 'employee', status: 'completed', completedAt: daysAgo(6) },
      { title: 'Email account & system access revoked', category: 'access_revocation', ownerRole: 'it', status: 'completed', completedAt: daysAgo(5) },
      { title: 'Exit interview conducted', category: 'hr', ownerRole: 'hr', status: 'completed', completedAt: daysAgo(10) },
      { title: 'Final settlement calculated & approved', category: 'finance', ownerRole: 'finance', status: 'completed', completedAt: daysAgo(4) },
      { title: 'Relieving & experience letters issued', category: 'documentation', ownerRole: 'hr', status: 'completed', completedAt: daysAgo(4) },
    ],
    accessRevoked: { email: true, system: true, building: true, vpn: true, revokedAt: daysAgo(5), revokedBy: roleUsers['Kavita']._id },
    reconciliation: { leaveBalanceDays: 6.5, leaveEncashmentAmount: 24500, bonusPayable: 0, recoveries: 0, noticePeriodRecovery: 0, totalSettlement: 118450 },
    finalSettlement: {
      status: 'paid', lines: [
        { name: 'Salary for 25 days (last month)', type: 'earning', amount: 46500 },
        { name: 'Leave encashment (6.5 days)', type: 'earning', amount: 24500 },
        { name: 'Sales incentive payout', type: 'earning', amount: 24000 },
        { name: 'Gratuity (partially eligible)', type: 'earning', amount: 23450 },
        { name: 'Notice period recovery (0 days)', type: 'deduction', amount: 0 },
      ],
      netAmount: 118450, calculatedBy: roleUsers['Kavita']._id, calculatedAt: daysAgo(6),
      approvedBy: roleUsers['Sanjay']._id, approvedAt: daysAgo(5), paidOn: daysAgo(3), paymentReference: 'NEFT-8891234',
    },
    documents: [{ title: 'Experience Certificate', type: 'experience_letter', generatedAt: daysAgo(4) }, { title: 'Relieving Letter', type: 'relieving_letter', generatedAt: daysAgo(4) }],
    auditTrail: [{ action: 'seeded', note: 'Completed exit with settlement' }],
  });

  // An in-progress resignation for the dashboard
  await M.Offboarding.create({
    employee: byFirst['Manish']._id, resignationDate: daysAgo(12), lastWorkingDay: new Date(TODAY.getTime() + 18 * 86400000),
    noticePeriodDays: 30, noticeServedDays: 12, noticeShortfallDays: 18, reason: 'higher_studies',
    reasonDetails: 'Planning to pursue a full-time MBA.',
    status: 'in_progress',
    approvals: [{ level: 1, role: 'manager', approver: roleUsers['Meera']._id, status: 'approved', decidedAt: daysAgo(10), comment: 'Approved' }, { level: 2, role: 'hr', approver: roleUsers['Kavita']._id, status: 'approved', decidedAt: daysAgo(9), comment: 'Approved' }],
    tasks: [
      { title: 'Knowledge transfer document completed', category: 'handover', ownerRole: 'employee', status: 'in_progress' },
      { title: 'Pending tasks reassigned to team', category: 'handover', ownerRole: 'manager', status: 'pending' },
      { title: 'Return laptop / desktop', category: 'asset_return', ownerRole: 'employee', status: 'pending' },
      { title: 'Email account & system access revoked', category: 'access_revocation', ownerRole: 'it', status: 'pending' },
      { title: 'Exit interview conducted', category: 'hr', ownerRole: 'hr', status: 'pending' },
      { title: 'Final settlement calculated & approved', category: 'finance', ownerRole: 'finance', status: 'pending' },
    ],
    exitInterview: { mode: 'form' },
    auditTrail: [{ action: 'seeded', note: 'Resignation in notice period' }],
  });
  await M.Employee.updateOne({ _id: byFirst['Manish']._id }, { employmentStatus: 'notice_period' });

  console.log('   ✓ onboarding journeys + offboarding records');

  /* ── 19. Announcements & notifications ───────────────────────────── */
  const announcementSpecs = [
    { title: 'Diwali Holiday Schedule & Office Closure', category: 'holiday', priority: 'high', body: 'The office will remain closed from 8th to 12th November for Diwali. Support teams will operate on a rotational on-call basis — please coordinate with your manager if you are scheduled.', pinned: true },
    { title: 'Annual Performance Review Cycle — Action Required', category: 'hr', priority: 'high', body: 'The FY26 H1 review cycle is now open. Please complete your self-assessment within 7 days; managers must submit assessments by month end.', requireAcknowledgement: true },
    { title: 'New Health Insurance Benefits Effective This Month', category: 'policy', priority: 'normal', body: 'We have upgraded the group health cover to ₹5 lakh per family with zero-copay OPD at partner hospitals. Family members can be added via the HR portal before the 25th.' },
    { title: 'Quarterly Town Hall — Save the Date', category: 'event', priority: 'normal', body: 'Join us for the quarterly town hall in the main auditorium at 4 PM on Friday. Business updates, awards and open Q&A with leadership.' },
    { title: 'Payroll Cut-off Reminder: Submit Expense Claims', category: 'payroll', priority: 'normal', body: 'To be reimbursed in this month\'s payroll, please submit all expense claims with valid receipts before the 22nd.' },
    { title: 'Welcome our New Joiners', category: 'celebration', priority: 'low', body: 'Please welcome our newest teammates who joined this month across Engineering, Sales and Operations. Do say hello!' },
  ];
  for (const a of announcementSpecs) {
    await M.Announcement.create({
      ...a, summary: a.body.slice(0, 140), audience: { type: 'all' },
      publishAt: daysAgo(int(1, 20)), expiresAt: new Date(TODAY.getTime() + int(10, 60) * 86400000),
      status: 'published', sendEmail: false, createdBy: roleUsers['Kavita']._id,
      readBy: employees.slice(0, int(5, 20)).map((e) => ({ employee: e._id, at: daysAgo(int(1, 10)) })),
      views: int(20, 90),
    });
  }

  const notificationTemplates = [
    { title: 'Leave request awaiting your approval', body: 'Ananya Sharma applied for 2 day(s) Casual Leave. Please review and approve.', type: 'leave', link: '/leave/approvals' },
    { title: 'New task assigned', body: 'You have been assigned "Optimise slow queries" — due in 3 days.', type: 'task', link: '/tasks' },
    { title: 'Payslip available', body: 'Your payslip for last month is ready to download.', type: 'payroll', link: '/payroll/my-payslips' },
    { title: 'Training assigned', body: 'You have been enrolled in "Secure Coding Practices".', type: 'training', link: '/training/my-trainings' },
    { title: 'Document expiring soon', body: 'Your passport copy expires in 30 days. Please upload a renewed copy.', type: 'document', link: '/profile' },
    { title: 'Welcome to EMS', body: 'Your employee portal is ready. Explore your dashboard, attendance and leave.', type: 'system', link: '/dashboard' },
  ];
  const notificationDocs = [];
  for (const user of Object.values(roleUsers)) {
    notificationTemplates.forEach((t, k) => {
      notificationDocs.push({ user: user._id, ...t, isRead: k > 2 && rnd() > 0.5, readAt: k > 2 && rnd() > 0.5 ? daysAgo(int(1, 5)) : undefined, createdAt: daysAgo(int(0, 8)) });
    });
  }
  await M.Notification.insertMany(notificationDocs);
  console.log(`   ✓ ${announcementSpecs.length} announcements, ${notificationDocs.length} notifications`);

  /* ── 20. Audit + payroll (previous month, processed) ─────────────── */
  const prevMonthDate = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
  const prevMonth = prevMonthDate.getMonth() + 1;
  const prevYear = prevMonthDate.getFullYear();
  const run = await M.PayrollRun.create({
    month: prevMonth, year: prevYear, period: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
    status: 'processed', generatedBy: roleUsers['Kavita']._id, generatedAt: daysAgo(20),
    approvedBy: roleUsers['Sanjay']._id, approvedAt: daysAgo(18), processedBy: roleUsers['Kavita']._id, processedAt: daysAgo(17),
    auditTrail: [{ action: 'seeded', note: 'Demo payroll run' }],
  });
  const payslips = [];
  let totalGross = 0, totalDed = 0, totalNet = 0;
  const policy = settings.payrollSettings;
  for (let i = 0; i < employees.length; i++) {
    const employee = employees[i];
    const structure = structures[i];
    const basic = structure.basic;
    const proration = 22 / 22;
    const earnings = [
      { name: 'Basic Salary', amount: r2(basic * proration) },
      { name: 'House Rent Allowance', amount: r2(structure.hra) },
      { name: 'Conveyance Allowance', amount: structure.conveyance },
      { name: 'Medical Allowance', amount: structure.medicalAllowance },
      { name: 'Special Allowance', amount: r2(structure.specialAllowance) },
    ];
    const gross = r2(earnings.reduce((s, e) => s + e.amount, 0));
    const pf = r2(basic * (policy.pfEmployeePercent / 100));
    const esi = gross <= policy.esiWageLimit ? r2(gross * (policy.esiEmployeePercent / 100)) : 0;
    const pt = gross <= 12000 ? 0 : gross <= 20000 ? 150 : 200;
    const tds = r2(pick([0, 0, 1200, 2500, 4800, 7200, 9500]));
    const deductions = [
      { name: `Provident Fund (${policy.pfEmployeePercent}%)`, amount: pf },
      ...(esi ? [{ name: `ESI (${policy.esiEmployeePercent}%)`, amount: esi }] : []),
      { name: 'Professional Tax', amount: pt },
      ...(tds ? [{ name: 'Income Tax (TDS)', amount: tds }] : []),
    ];
    const totalDeductions = r2(deductions.reduce((s, d) => s + d.amount, 0));
    const net = r2(gross - totalDeductions);
    totalGross += gross; totalDed += totalDeductions; totalNet += net;
    payslips.push({
      payrollRun: run._id, employee: employee._id, period: run.period, month: prevMonth, year: prevYear,
      workingDays: 22, paidDays: 22, lopDays: 0, earnings, deductions, grossEarnings: gross,
      totalDeductions, netPay: net,
      employerContributions: [{ name: 'Employer PF', amount: r2(basic * (policy.pfEmployerPercent / 100)) }],
      ctcMonthly: r2(gross + basic * 0.12),
      bankLast4: (employee.bank?.maskedAccountNumber || '0000').slice(-4),
      paymentStatus: 'paid', paidOn: daysAgo(15), paymentMode: 'bank_transfer', paymentReference: `NEFT-${int(100000, 999999)}`,
    });
  }
  await M.Payslip.insertMany(payslips);
  run.totalEmployees = employees.length; run.totalGross = r2(totalGross); run.totalDeductions = r2(totalDed); run.totalNet = r2(totalNet);
  run.totalEmployerCost = r2(totalNet + totalDed);
  await run.save();

  const auditSeed = [
    ['settings.update', 'settings', 'critical', 'Company settings updated (timezone, workingDays)'],
    ['payroll.generate', 'payroll', 'critical', `Generated payroll for ${run.period}: ${employees.length} payslips`],
    ['payroll.process', 'payroll', 'critical', `Processed payroll ${run.period} and released payslips`],
    ['employee.create', 'employees', 'info', 'Employee Harsh Chauhan (intern) onboarded'],
    ['leave.approve', 'leave', 'warning', 'Approved Casusal Leave for Ananya Sharma'],
    ['role.permissions_update', 'roles', 'critical', 'Updated permissions for role Department Manager'],
    ['recruitment.offer_sent', 'recruitment', 'critical', 'Offer sent to a candidate for Senior React Developer'],
    ['attendance.adjust', 'attendance', 'critical', 'Adjusted attendance for Rohan Vyas (biometric failure)'],
  ];
  await M.AuditLog.insertMany(auditSeed.map(([action, module, severity, description], i) => ({
    actor: roleUsers['Kavita']._id, actorRole: 'hr_admin', actorName: 'Kavita Nair',
    action, module, severity, description, ip: '127.0.0.1', userAgent: 'seed-script', at: daysAgo(i + 1),
  })));
  console.log(`   ✓ payroll run ${run.period} with ${payslips.length} payslips + audit history`);

  /* ── Done ────────────────────────────────────────────────────────── */
  console.log('\n' + '─'.repeat(64));
  console.log('🎉 Seed complete! Sign in with any of these accounts:\n');
  console.log(`   Super Admin  : ${env.SEED.email}  /  ${env.SEED.password}`);
  console.log(`   HR Admin     : kavita.nair@acmetech.example.com  /  ${password}`);
  console.log(`   HR Manager   : rakesh.trivedi@acmetech.example.com  /  ${password}`);
  console.log(`   Dept Manager : vikram.shah@acmetech.example.com  /  ${password}`);
  console.log(`   Team Leader  : pooja.joshi@acmetech.example.com  /  ${password}`);
  console.log(`   Employee     : ananya.sharma@acmetech.example.com  /  ${password}`);
  console.log('─'.repeat(64) + '\n');

  if (!skipConnect) await disconnectDatabase();
  return { seeded: true, employees: employees.length, departments: Object.keys(departments).length };
}

module.exports = { runSeed };

/* CLI entry point */
if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('❌ Seed failed:', err);
      await disconnectDatabase().catch(() => {});
      process.exit(1);
    });
}
