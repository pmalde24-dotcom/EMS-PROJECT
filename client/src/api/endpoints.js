import api from './client';

const get = (url, params) => api.get(url, { params }).then((r) => r.data);
const post = (url, body) => api.post(url, body).then((r) => r.data);
const patch = (url, body) => api.patch(url, body).then((r) => r.data);
const del = (url, params) => api.delete(url, { params }).then((r) => r.data);

/* Auth */
export const authApi = {
  login: (body) => post('/auth/login', body),
  logout: () => post('/auth/logout', {}),
  logoutAll: () => post('/auth/logout-all', {}),
  me: () => get('/auth/me'),
  setupStatus: () => get('/auth/setup-status'),
  setup: (body) => post('/auth/setup', body),
  forgotPassword: (body) => post('/auth/forgot-password', body),
  resetPassword: (body) => post('/auth/reset-password', body),
  changePassword: (body) => post('/auth/change-password', body),
  preferences: (body) => patch('/auth/preferences', body),
  activity: () => get('/auth/activity'),
  myPermissions: () => get('/my-permissions'),
  rbacCatalog: () => get('/rbac/catalog'),
};

/* Dashboards */
export const dashboardApi = {
  admin: (params) => get('/dashboard/admin', params),
  hr: (params) => get('/dashboard/hr', params),
  manager: (params) => get('/dashboard/manager', params),
  employee: (params) => get('/dashboard/employee', params),
  celebrations: () => get('/dashboard/widgets/celebrations'),
  quickStats: () => get('/dashboard/widgets/quick-stats'),
};

/* Generic resource factory */
const resource = (base) => ({
  list: (params) => get(base, params),
  get: (id) => get(`${base}/${id}`),
  create: (body) => post(base, body),
  update: (id, body) => patch(`${base}/${id}`, body),
  remove: (id, params) => del(`${base}/${id}`, params),
  bulk: (body) => post(`${base}/bulk`, body),
  exportUrl: (params = {}) => {
    const qs = new URLSearchParams({ ...params, limit: 500 }).toString();
    return `${base}?${qs}`;
  },
});

export const employeeApi = {
  ...resource('/employees'),
  stats: () => get('/employees/stats/summary'),
  directory: (params) => get('/employees/directory', params),
  celebrations: (params) => get('/employees/celebrations/upcoming', params),
  overview: (id) => get(`/employees/${id}/overview`),
  reportees: (id) => get(`/employees/${id}/reportees`),
  deactivate: (id, body) => post(`/employees/${id}/deactivate`, body),
  reactivate: (id, body) => post(`/employees/${id}/reactivate`, body),
  restore: (id) => post(`/employees/${id}/restore`, {}),
  addNote: (id, body) => post(`/employees/${id}/notes`, body),
  resetPassword: (id, body) => post(`/employees/${id}/account/reset-password`, body),
  addDocument: (id, formData) => api.post(`/employees/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  updateDocument: (id, docId, body) => patch(`/employees/${id}/documents/${docId}`, body),
  deleteDocument: (id, docId) => del(`/employees/${id}/documents/${docId}`),
  uploadPhoto: (id, formData) => api.post(`/employees/${id}/photo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  importCsv: (formData, params) => api.post('/employees/import', formData, { headers: { 'Content-Type': 'multipart/form-data' }, params }).then((r) => r.data),
  importTemplateUrl: '/api/employees/import/template',
};

export const departmentApi = {
  ...resource('/departments'),
  overview: (id) => get(`/departments/${id}/overview`),
  employees: (id) => get(`/departments/${id}/employees`),
  assignHead: (id, employeeId) => post(`/departments/${id}/assign-head`, { employeeId }),
  budget: (id, body) => post(`/departments/${id}/budget`, body),
};
export const designationApi = resource('/designations');
export const shiftApi = {
  ...resource('/shifts'),
  assign: (id, body) => post(`/shifts/${id}/assign`, body),
};
export const holidayApi = { ...resource('/holidays'), calendar: (year) => get(`/holidays/calendar/${year}`) };
export const leaveTypeApi = resource('/leave/types');

export const attendanceApi = {
  list: (params) => get('/attendance', params),
  today: () => get('/attendance/me/today'),
  calendar: (params) => get('/attendance/me/calendar', params),
  summary: (employeeId, params) => get(`/attendance/summary${employeeId ? `/${employeeId}` : ''}`, params),
  punchIn: (body) => post('/attendance/punch-in', body),
  punchOut: (body) => post('/attendance/punch-out', body),
  breakStart: () => post('/attendance/break/start', {}),
  breakEnd: () => post('/attendance/break/end', {}),
  requestCorrection: (body) => post('/attendance/corrections', body),
  pendingCorrections: () => get('/attendance/corrections/pending'),
  decideCorrection: (attendanceId, correctionId, body) => post(`/attendance/corrections/${attendanceId}/${correctionId}/decide`, body),
  adjust: (body) => post('/attendance/adjust', body),
  markAbsent: (body) => post('/attendance/jobs/mark-absent', body),
  departmentReport: (params) => get('/attendance/reports/department', params),
  trend: (params) => get('/attendance/reports/trend', params),
  get: (id) => get(`/attendance/${id}`),
};

export const leaveApi = {
  list: (params) => get('/leave/requests', params),
  get: (id) => get(`/leave/requests/${id}`),
  apply: (body) => post('/leave/requests', body),
  approve: (id, body) => post(`/leave/requests/${id}/approve`, body),
  reject: (id, body) => post(`/leave/requests/${id}/reject`, body),
  cancel: (id, body) => post(`/leave/requests/${id}/cancel`, body),
  pendingApprovals: () => get('/leave/requests/pending-approvals'),
  myBalances: (params) => get('/leave/balances/me', params),
  balances: (params) => get('/leave/balances', params),
  adjustBalance: (body) => post('/leave/balances/adjust', body),
  allocate: (body) => post('/leave/jobs/allocate', body),
  calendar: (params) => get('/leave/calendar', params),
  report: (params) => get('/leave/reports/summary', params),
};

export const payrollApi = {
  structures: (params) => get('/payroll/structures', params),
  structureFor: (employeeId) => get(`/payroll/structures/current/${employeeId}`),
  saveStructure: (body) => post('/payroll/structures', body),
  runs: (params) => get('/payroll/runs', params),
  run: (id) => get(`/payroll/runs/${id}`),
  generate: (body) => post('/payroll/runs/generate', body),
  approveRun: (id, body) => post(`/payroll/runs/${id}/approve`, body),
  processRun: (id, body) => post(`/payroll/runs/${id}/process`, body),
  lockRun: (id, body) => post(`/payroll/runs/${id}/lock`, body),
  markPaid: (id, body) => post(`/payroll/runs/${id}/mark-paid`, body),
  deleteRun: (id) => del(`/payroll/runs/${id}`),
  payslips: (params) => get('/payroll/payslips', params),
  payslip: (id) => get(`/payroll/payslips/${id}`),
  payslipPdfUrl: (id) => `/api/payroll/payslips/${id}/pdf`,
  revisions: (params) => get('/payroll/revisions', params),
  report: (params) => get('/payroll/reports/summary', params),
  salaryRegister: (params) => get('/payroll/reports/salary-register', params),
};

export const reimbursementApi = {
  list: (params) => get('/reimbursements', params),
  get: (id) => get(`/reimbursements/${id}`),
  create: (body) => post('/reimbursements', body),
  decide: (id, body) => post(`/reimbursements/${id}/decide`, body),
  markPaid: (id, body) => post(`/reimbursements/${id}/paid`, body),
  cancel: (id) => del(`/reimbursements/${id}`),
  pending: () => get('/reimbursements/pending-approvals'),
  stats: (params) => get('/reimbursements/summary/stats', params),
};

export const recruitmentApi = {
  jobs: (params) => get('/recruitment/jobs', params),
  job: (id) => get(`/recruitment/jobs/${id}`),
  createJob: (body) => post('/recruitment/jobs', body),
  updateJob: (id, body) => patch(`/recruitment/jobs/${id}`, body),
  deleteJob: (id) => del(`/recruitment/jobs/${id}`),
  applications: (params) => get('/recruitment/applications', params),
  application: (id) => get(`/recruitment/applications/${id}`),
  pipeline: (params) => get('/recruitment/pipeline', params),
  changeStage: (id, body) => post(`/recruitment/applications/${id}/stage`, body),
  scheduleInterview: (id, body) => post(`/recruitment/applications/${id}/interviews`, body),
  interviewFeedback: (id, interviewId, body) => post(`/recruitment/applications/${id}/interviews/${interviewId}/feedback`, body),
  sendOffer: (id, body) => post(`/recruitment/applications/${id}/offer`, body),
  offerPdfUrl: (id) => `/api/recruitment/applications/${id}/offer/pdf`,
  convert: (id, body) => post(`/recruitment/applications/${id}/convert`, body),
  report: () => get('/recruitment/reports/summary'),
};

export const onboardingApi = {
  list: (params) => get('/onboarding', params),
  get: (id) => get(`/onboarding/${id}`),
  start: (body) => post('/onboarding', body),
  updateTask: (id, taskId, body) => patch(`/onboarding/${id}/tasks/${taskId}`, body),
  addAsset: (id, body) => post(`/onboarding/${id}/assets`, body),
  verifyDocument: (id, docId, body) => post(`/onboarding/${id}/documents/${docId}/verify`, body),
  acknowledge: (id, agreementId) => post(`/onboarding/${id}/agreements/${agreementId}/acknowledge`, {}),
  complete: (id, body) => post(`/onboarding/${id}/complete`, body),
  templates: () => get('/onboarding/templates'),
  createTemplate: (body) => post('/onboarding/templates', body),
  deleteTemplate: (id) => del(`/onboarding/templates/${id}`),
};

export const offboardingApi = {
  list: (params) => get('/offboarding', params),
  get: (id) => get(`/offboarding/${id}`),
  submit: (body) => post('/offboarding', body),
  decide: (id, body) => post(`/offboarding/${id}/decide`, body),
  updateTask: (id, taskId, body) => patch(`/offboarding/${id}/tasks/${taskId}`, body),
  addTask: (id, body) => post(`/offboarding/${id}/tasks`, body),
  returnAsset: (id, assignmentId, body) => post(`/offboarding/${id}/assets/${assignmentId}/return`, body),
  revokeAccess: (id, body) => post(`/offboarding/${id}/revoke-access`, body),
  exitInterview: (id, body) => post(`/offboarding/${id}/exit-interview`, body),
  reconciliation: (id) => get(`/offboarding/${id}/reconciliation`),
  settlement: (id, body) => post(`/offboarding/${id}/final-settlement`, body),
  letterUrl: (id, type) => `/api/offboarding/${id}/letters/${type}`,
  complete: (id, body) => post(`/offboarding/${id}/complete`, body),
};

export const projectApi = {
  ...resource('/projects'),
  progress: (id) => get(`/projects/${id}/progress`),
  addMember: (id, body) => post(`/projects/${id}/team`, body),
  removeMember: (id, memberId) => del(`/projects/${id}/team/${memberId}`),
};

export const taskApi = {
  list: (params) => get('/tasks', params),
  get: (id) => get(`/tasks/${id}`),
  create: (body) => post('/tasks', body),
  update: (id, body) => patch(`/tasks/${id}`, body),
  remove: (id) => del(`/tasks/${id}`),
  board: (params) => get('/tasks/board/kanban', params),
  mySummary: () => get('/tasks/me/summary'),
  changeStatus: (id, body) => post(`/tasks/${id}/status`, body),
  addSubtask: (id, body) => post(`/tasks/${id}/subtasks`, body),
  updateSubtask: (id, subtaskId, body) => patch(`/tasks/${id}/subtasks/${subtaskId}`, body),
  addComment: (id, body) => post(`/tasks/${id}/comments`, body),
  deleteComment: (id, commentId) => del(`/tasks/${id}/comments/${commentId}`),
  attachments: (id, formData) => api.post(`/tasks/${id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  workload: () => get('/tasks/reports/workload'),
  overdue: () => get('/tasks/reports/overdue'),
};

export const timesheetApi = {
  list: (params) => get('/timesheets', params),
  get: (id) => get(`/timesheets/${id}`),
  current: (params) => get('/timesheets/me/current', params),
  addEntry: (id, body) => post(`/timesheets/${id}/entries`, body),
  updateEntry: (id, entryId, body) => patch(`/timesheets/${id}/entries/${entryId}`, body),
  deleteEntry: (id, entryId) => del(`/timesheets/${id}/entries/${entryId}`),
  submit: (id) => post(`/timesheets/${id}/submit`, {}),
  decide: (id, body) => post(`/timesheets/${id}/decide`, body),
  pending: () => get('/timesheets/pending/approvals'),
  report: (params) => get('/timesheets/reports/summary', params),
};

export const performanceApi = {
  reviews: (params) => get('/performance/reviews', params),
  review: (id) => get(`/performance/reviews/${id}`),
  createReviews: (body) => post('/performance/reviews/bulk-create', body),
  selfAssessment: (id, body) => post(`/performance/reviews/${id}/self-assessment`, body),
  managerAssessment: (id, body) => post(`/performance/reviews/${id}/manager-assessment`, body),
  hrReview: (id, body) => post(`/performance/reviews/${id}/hr-review`, body),
  goals: (params) => get('/performance/goals', params),
  createGoal: (body) => post('/performance/goals', body),
  updateGoal: (id, body) => patch(`/performance/goals/${id}`, body),
  deleteGoal: (id) => del(`/performance/goals/${id}`),
  plans: () => get('/performance/plans'),
  createPlan: (body) => post('/performance/plans', body),
  updatePlan: (id, body) => patch(`/performance/plans/${id}`, body),
  templates: () => get('/performance/templates'),
  report: (params) => get('/performance/reports/summary', params),
};

export const trainingApi = {
  programs: (params) => get('/training/programs', params),
  program: (id) => get(`/training/programs/${id}`),
  createProgram: (body) => post('/training/programs', body),
  updateProgram: (id, body) => patch(`/training/programs/${id}`, body),
  deleteProgram: (id) => del(`/training/programs/${id}`),
  assign: (id, body) => post(`/training/programs/${id}/assign`, body),
  assignments: (params) => get('/training/assignments', params),
  updateAssignment: (id, body) => patch(`/training/assignments/${id}`, body),
  feedback: (id, body) => post(`/training/assignments/${id}/feedback`, body),
  skillMatrix: (params) => get('/training/reports/skill-matrix', params),
  report: () => get('/training/reports/summary'),
};

export const assetApi = {
  ...resource('/assets'),
  myAssets: () => get('/assets/my-assets'),
  stats: () => get('/assets/stats/summary'),
  assign: (id, body) => post(`/assets/${id}/assign`, body),
  returnAsset: (assignmentId, body) => post(`/assets/assignments/${assignmentId}/return`, body),
  transfer: (assignmentId, body) => post(`/assets/assignments/${assignmentId}/transfer`, body),
  acknowledge: (assignmentId) => post(`/assets/assignments/${assignmentId}/acknowledge`, {}),
  maintenance: (id, body) => post(`/assets/${id}/maintenance`, body),
  updateMaintenance: (id, body) => patch(`/assets/maintenance/${id}`, body),
  allocation: () => get('/assets/reports/allocation'),
};

export const announcementApi = {
  list: (params) => get('/announcements', params),
  get: (id) => get(`/announcements/${id}`),
  create: (body) => post('/announcements', body),
  update: (id, body) => patch(`/announcements/${id}`, body),
  remove: (id) => del(`/announcements/${id}`),
  feed: () => get('/announcements/feed/me'),
  markRead: (id, acknowledge) => post(`/announcements/${id}/read`, { acknowledge }),
  publish: (id) => post(`/announcements/${id}/publish`, {}),
  stats: (id) => get(`/announcements/${id}/stats`),
};

export const notificationApi = {
  list: (params) => get('/notifications', params),
  unreadCount: () => get('/notifications/unread-count'),
  markRead: (id) => post(`/notifications/${id}/read`, {}),
  markAllRead: () => post('/notifications/read-all', {}),
  remove: (id) => del(`/notifications/${id}`),
  broadcast: (body) => post('/notifications/broadcast', body),
};

export const reportApi = {
  headcount: (p) => get('/reports/headcount', p),
  attrition: (p) => get('/reports/attrition', p),
  attendance: (p) => get('/reports/attendance', p),
  leave: (p) => get('/reports/leave', p),
  payroll: (p) => get('/reports/payroll', p),
  recruitment: (p) => get('/reports/recruitment', p),
  projects: (p) => get('/reports/projects', p),
  training: (p) => get('/reports/training', p),
  assets: (p) => get('/reports/assets', p),
  reimbursements: (p) => get('/reports/reimbursements', p),
  performance: (p) => get('/reports/performance', p),
  departments: (p) => get('/reports/departments', p),
  timesheets: (p) => get('/reports/timesheets', p),
  onboarding: (p) => get('/reports/onboarding-status', p),
  masterExportUrl: (params = {}) => `/api/reports/master/employees?${new URLSearchParams(params).toString()}`,
};

export const userApi = {
  list: (params) => get('/users', params),
  get: (id) => get(`/users/${id}`),
  create: (body) => post('/users', body),
  update: (id, body) => patch(`/users/${id}`, body),
  toggleActive: (id) => post(`/users/${id}/toggle-active`, {}),
  permissions: (id, body) => post(`/users/${id}/permissions`, body),
  revokeSessions: (id) => post(`/users/${id}/revoke-sessions`, {}),
  remove: (id) => del(`/users/${id}`),
  roles: () => get('/users/roles'),
  updateRolePermissions: (key, permissions) => patch(`/users/roles/${key}/permissions`, { permissions }),
  permissionCatalog: () => get('/users/permissions/catalog'),
};

export const auditApi = {
  list: (params) => get('/audit', params),
  stats: () => get('/audit/stats'),
  record: (model, id) => get(`/audit/record/${model}/${id}`),
};

export const settingsApi = {
  get: () => get('/settings'),
  public: () => get('/settings/public'),
  update: (body) => patch('/settings', body),
  uploadLogo: (formData) => api.post('/settings/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  roles: () => get('/settings/roles'),
  updateRole: (key, body) => patch(`/settings/roles/${key}`, body),
  reference: () => get('/settings/reference-data'),
  system: () => get('/settings/system'),
};

export const uploadApi = {
  upload: (folder, formData) => api.post(`/uploads/${folder}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
};
