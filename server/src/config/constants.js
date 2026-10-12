'use strict';

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  HR_ADMIN: 'hr_admin',
  HR_MANAGER: 'hr_manager',
  DEPARTMENT_MANAGER: 'department_manager',
  TEAM_LEADER: 'team_leader',
  EMPLOYEE: 'employee',
};
const ROLE_LIST = Object.values(ROLES);
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  hr_admin: 'HR Admin',
  hr_manager: 'HR Manager',
  department_manager: 'Department Manager',
  team_leader: 'Team Leader',
  employee: 'Employee',
};

/** Every permission key is `<module>:<action>`. */
const MODULES = [
  'dashboard', 'employees', 'departments', 'designations', 'users', 'roles',
  'attendance', 'shifts', 'leave', 'holidays', 'payroll', 'reimbursements',
  'recruitment', 'onboarding', 'offboarding', 'projects', 'tasks', 'timesheets',
  'performance', 'training', 'assets', 'documents', 'announcements',
  'notifications', 'reports', 'audit', 'settings',
];
const ACTIONS = ['view', 'create', 'update', 'delete', 'approve', 'export'];

const ALL_PERMISSIONS = [];
MODULES.forEach((m) => ACTIONS.forEach((a) => ALL_PERMISSIONS.push(`${m}:${a}`)));

const P = (...keys) => keys;
const READ_ALL = MODULES.map((m) => `${m}:view`);

/** Default permission set per role (extra per-user grants are stored on the user). */
const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.HR_ADMIN]: [
    ...ALL_PERMISSIONS.filter((p) => !['roles:delete', 'settings:delete', 'audit:delete'].includes(p)),
  ],
  [ROLES.HR_MANAGER]: [
    'dashboard:view', 'employees:view', 'employees:create', 'employees:update', 'departments:view',
    'designations:view', 'attendance:view', 'attendance:update', 'attendance:approve', 'shifts:view',
    'leave:view', 'leave:approve', 'leave:update', 'holidays:view', 'payroll:view', 'reimbursements:view',
    'reimbursements:approve', 'recruitment:view', 'recruitment:update', 'onboarding:view', 'onboarding:update',
    'offboarding:view', 'offboarding:update', 'projects:view', 'tasks:view', 'timesheets:view',
    'timesheets:approve', 'performance:view', 'performance:update', 'training:view', 'training:create',
    'training:update', 'assets:view', 'assets:create', 'assets:update', 'documents:view', 'documents:create',
    'documents:update', 'announcements:view', 'announcements:create', 'announcements:update',
    'notifications:view', 'reports:view', 'reports:export', 'settings:view',
  ],
  [ROLES.DEPARTMENT_MANAGER]: P(
    'dashboard:view', 'employees:view', 'departments:view', 'designations:view', 'attendance:view',
    'attendance:approve', 'shifts:view', 'leave:view', 'leave:approve', 'holidays:view',
    'projects:view', 'projects:create', 'projects:update', 'tasks:view', 'tasks:create', 'tasks:update',
    'tasks:delete', 'timesheets:view', 'timesheets:approve', 'performance:view', 'performance:update',
    'training:view', 'assets:view', 'documents:view', 'announcements:view', 'announcements:create',
    'notifications:view', 'reports:view', 'reports:export', 'onboarding:view', 'recruitment:view',
    'reimbursements:view', 'reimbursements:approve', 'offboarding:view', 'offboarding:approve',
  ),
  [ROLES.TEAM_LEADER]: P(
    'dashboard:view', 'employees:view', 'attendance:view', 'leave:view', 'leave:approve', 'holidays:view',
    'projects:view', 'tasks:view', 'tasks:create', 'tasks:update', 'timesheets:view', 'timesheets:approve',
    'performance:view', 'training:view', 'assets:view', 'documents:view', 'announcements:view',
    'notifications:view', 'reports:view', 'reimbursements:view', 'offboarding:view', 'offboarding:approve',
  ),
  [ROLES.EMPLOYEE]: P(
    'dashboard:view', 'attendance:view', 'attendance:create', 'leave:view', 'leave:create', 'holidays:view',
    'projects:view', 'tasks:view', 'tasks:update', 'timesheets:view', 'timesheets:create', 'training:view',
    'assets:view', 'documents:view', 'announcements:view', 'notifications:view', 'payroll:view',
    'reimbursements:view', 'reimbursements:create', 'performance:view', 'employees:view',
  ),
};

const PRIVILEGED_ROLES = [ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.HR_MANAGER];

const ENUMS = {
  employmentType: ['full_time', 'part_time', 'contract', 'intern', 'consultant'],
  employmentStatus: ['active', 'probation', 'notice_period', 'resigned', 'terminated', 'retired', 'inactive'],
  attendanceStatus: ['present', 'absent', 'half_day', 'late', 'early_exit', 'on_leave', 'holiday', 'weekly_off', 'work_from_home', 'od'],
  leaveStatus: ['pending', 'manager_approved', 'hr_approved', 'approved', 'rejected', 'cancelled'],
  taskStatus: ['todo', 'in_progress', 'in_review', 'completed', 'blocked'],
  priority: ['low', 'medium', 'high', 'urgent'],
  applicationStage: ['applied', 'screening', 'shortlisted', 'interview_scheduled', 'selected', 'offer_sent', 'hired', 'rejected', 'withdrawn'],
  payrollStatus: ['draft', 'pending_approval', 'approved', 'processed', 'locked', 'paid'],
  assetStatus: ['available', 'assigned', 'maintenance', 'retired', 'lost', 'damaged'],
  timesheetStatus: ['draft', 'submitted', 'approved', 'rejected'],
};

module.exports = { ROLES, ROLE_LIST, ROLE_LABELS, MODULES, ACTIONS, ALL_PERMISSIONS, ROLE_PERMISSIONS, PRIVILEGED_ROLES, ENUMS };
