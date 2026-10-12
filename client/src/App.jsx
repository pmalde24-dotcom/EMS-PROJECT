import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';

const Login = lazy(() => import('./pages/auth/Login'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const NotFound = lazy(() => import('./pages/NotFound'));

const Dashboard = lazy(() => import('./pages/Dashboard'));

const EmployeeList = lazy(() => import('./pages/employees/EmployeeList'));
const EmployeeDetail = lazy(() => import('./pages/employees/EmployeeDetail'));
const Directory = lazy(() => import('./pages/employees/Directory'));

const DepartmentList = lazy(() => import('./pages/departments/DepartmentList'));
const DesignationList = lazy(() => import('./pages/designations/DesignationList'));
const ShiftList = lazy(() => import('./pages/shifts/ShiftList'));
const HolidayList = lazy(() => import('./pages/holidays/HolidayList'));

const MyAttendance = lazy(() => import('./pages/attendance/MyAttendance'));
const AttendanceRecords = lazy(() => import('./pages/attendance/AttendanceRecords'));
const AttendanceCorrections = lazy(() => import('./pages/attendance/AttendanceCorrections'));

const MyLeave = lazy(() => import('./pages/leave/MyLeave'));
const LeaveRequests = lazy(() => import('./pages/leave/LeaveRequests'));
const LeaveApprovals = lazy(() => import('./pages/leave/LeaveApprovals'));
const LeaveTypes = lazy(() => import('./pages/leave/LeaveTypes'));
const LeaveCalendar = lazy(() => import('./pages/leave/LeaveCalendar'));
const LeaveBalances = lazy(() => import('./pages/leave/LeaveBalances'));

const MyPayslips = lazy(() => import('./pages/payroll/MyPayslips'));
const MySalary = lazy(() => import('./pages/payroll/MySalary'));
const PayrollRuns = lazy(() => import('./pages/payroll/PayrollRuns'));
const PayrollRunDetail = lazy(() => import('./pages/payroll/PayrollRunDetail'));
const SalaryStructures = lazy(() => import('./pages/payroll/SalaryStructures'));
const AllPayslips = lazy(() => import('./pages/payroll/AllPayslips'));

const MyReimbursements = lazy(() => import('./pages/reimbursements/MyReimbursements'));
const ReimbursementApprovals = lazy(() => import('./pages/reimbursements/ReimbursementApprovals'));

const JobList = lazy(() => import('./pages/recruitment/JobList'));
const Pipeline = lazy(() => import('./pages/recruitment/Pipeline'));
const ApplicationList = lazy(() => import('./pages/recruitment/ApplicationList'));
const ApplicationDetail = lazy(() => import('./pages/recruitment/ApplicationDetail'));

const OnboardingList = lazy(() => import('./pages/onboarding/OnboardingList'));
const OnboardingDetail = lazy(() => import('./pages/onboarding/OnboardingDetail'));
const OffboardingList = lazy(() => import('./pages/offboarding/OffboardingList'));
const OffboardingDetail = lazy(() => import('./pages/offboarding/OffboardingDetail'));

const ProjectList = lazy(() => import('./pages/projects/ProjectList'));
const ProjectDetail = lazy(() => import('./pages/projects/ProjectDetail'));
const MyTasks = lazy(() => import('./pages/tasks/MyTasks'));
const TaskBoard = lazy(() => import('./pages/tasks/TaskBoard'));
const TaskDetail = lazy(() => import('./pages/tasks/TaskDetail'));

const MyTimesheet = lazy(() => import('./pages/timesheets/MyTimesheet'));
const TimesheetApprovals = lazy(() => import('./pages/timesheets/TimesheetApprovals'));

const MyReviews = lazy(() => import('./pages/performance/MyReviews'));
const ReviewList = lazy(() => import('./pages/performance/ReviewList'));
const ReviewDetail = lazy(() => import('./pages/performance/ReviewDetail'));
const GoalList = lazy(() => import('./pages/performance/GoalList'));

const TrainingPrograms = lazy(() => import('./pages/training/TrainingPrograms'));
const MyTrainings = lazy(() => import('./pages/training/MyTrainings'));
const TrainingDetail = lazy(() => import('./pages/training/TrainingDetail'));

const AssetRegister = lazy(() => import('./pages/assets/AssetRegister'));
const MyAssets = lazy(() => import('./pages/assets/MyAssets'));

const Announcements = lazy(() => import('./pages/announcements/Announcements'));
const Notifications = lazy(() => import('./pages/notifications/Notifications'));
const Reports = lazy(() => import('./pages/reports/Reports'));
const UserList = lazy(() => import('./pages/users/UserList'));
const AuditLogs = lazy(() => import('./pages/audit/AuditLogs'));
const Settings = lazy(() => import('./pages/settings/Settings'));
const Profile = lazy(() => import('./pages/profile/Profile'));
const Security = lazy(() => import('./pages/profile/Security'));

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
    </div>
  );
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={location.state?.from?.pathname || '/dashboard'} replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
        <Route path="/reset-password" element={<PublicOnly><ResetPassword /></PublicOnly>} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />

            {/* HR core */}
            <Route path="/employees" element={<ProtectedRoute permission="employees:view"><EmployeeList /></ProtectedRoute>} />
            <Route path="/employees/:id" element={<ProtectedRoute permission="employees:view"><EmployeeDetail /></ProtectedRoute>} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/departments" element={<ProtectedRoute permission="departments:view"><DepartmentList /></ProtectedRoute>} />
            <Route path="/designations" element={<ProtectedRoute permission="designations:view"><DesignationList /></ProtectedRoute>} />
            <Route path="/shifts" element={<ProtectedRoute permission="shifts:view"><ShiftList /></ProtectedRoute>} />
            <Route path="/holidays" element={<ProtectedRoute permission="holidays:view"><HolidayList /></ProtectedRoute>} />

            {/* Attendance */}
            <Route path="/attendance" element={<MyAttendance />} />
            <Route path="/attendance/records" element={<ProtectedRoute permission="attendance:view"><AttendanceRecords /></ProtectedRoute>} />
            <Route path="/attendance/corrections" element={<ProtectedRoute permission="attendance:approve"><AttendanceCorrections /></ProtectedRoute>} />

            {/* Leave */}
            <Route path="/leave" element={<MyLeave />} />
            <Route path="/leave/requests" element={<ProtectedRoute permission="leave:view"><LeaveRequests /></ProtectedRoute>} />
            <Route path="/leave/approvals" element={<ProtectedRoute permission="leave:approve"><LeaveApprovals /></ProtectedRoute>} />
            <Route path="/leave/balances" element={<ProtectedRoute permission="leave:view"><LeaveBalances /></ProtectedRoute>} />
            <Route path="/leave/types" element={<ProtectedRoute permission="leave:update"><LeaveTypes /></ProtectedRoute>} />
            <Route path="/leave/calendar" element={<LeaveCalendar />} />

            {/* Payroll */}
            <Route path="/payroll/my-payslips" element={<MyPayslips />} />
            <Route path="/payroll/my-salary" element={<MySalary />} />
            <Route path="/payroll/runs" element={<ProtectedRoute permission="payroll:create"><PayrollRuns /></ProtectedRoute>} />
            <Route path="/payroll/runs/:id" element={<ProtectedRoute permission="payroll:view"><PayrollRunDetail /></ProtectedRoute>} />
            <Route path="/payroll/structures" element={<ProtectedRoute permission="payroll:update"><SalaryStructures /></ProtectedRoute>} />
            <Route path="/payroll/payslips" element={<ProtectedRoute permission="payroll:view"><AllPayslips /></ProtectedRoute>} />

            {/* Reimbursements */}
            <Route path="/reimbursements" element={<MyReimbursements />} />
            <Route path="/reimbursements/approvals" element={<ProtectedRoute permission="reimbursements:approve"><ReimbursementApprovals /></ProtectedRoute>} />

            {/* Recruitment */}
            <Route path="/recruitment/jobs" element={<ProtectedRoute permission="recruitment:view"><JobList /></ProtectedRoute>} />
            <Route path="/recruitment/pipeline" element={<ProtectedRoute permission="recruitment:view"><Pipeline /></ProtectedRoute>} />
            <Route path="/recruitment/applications" element={<ProtectedRoute permission="recruitment:view"><ApplicationList /></ProtectedRoute>} />
            <Route path="/recruitment/applications/:id" element={<ProtectedRoute permission="recruitment:view"><ApplicationDetail /></ProtectedRoute>} />

            {/* Onboarding / Offboarding */}
            <Route path="/onboarding" element={<ProtectedRoute permission="onboarding:view"><OnboardingList /></ProtectedRoute>} />
            <Route path="/onboarding/:id" element={<ProtectedRoute permission="onboarding:view"><OnboardingDetail /></ProtectedRoute>} />
            <Route path="/offboarding" element={<ProtectedRoute permission="offboarding:view"><OffboardingList /></ProtectedRoute>} />
            <Route path="/offboarding/:id" element={<ProtectedRoute permission="offboarding:view"><OffboardingDetail /></ProtectedRoute>} />

            {/* Projects & tasks */}
            <Route path="/projects" element={<ProtectedRoute permission="projects:view"><ProjectList /></ProtectedRoute>} />
            <Route path="/projects/:id" element={<ProtectedRoute permission="projects:view"><ProjectDetail /></ProtectedRoute>} />
            <Route path="/tasks" element={<MyTasks />} />
            <Route path="/tasks/board" element={<ProtectedRoute permission="tasks:view"><TaskBoard /></ProtectedRoute>} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/timesheets" element={<MyTimesheet />} />
            <Route path="/timesheets/approvals" element={<ProtectedRoute permission="timesheets:approve"><TimesheetApprovals /></ProtectedRoute>} />

            {/* Performance & training */}
            <Route path="/performance/my-reviews" element={<MyReviews />} />
            <Route path="/performance/reviews" element={<ProtectedRoute permission="performance:view"><ReviewList /></ProtectedRoute>} />
            <Route path="/performance/reviews/:id" element={<ProtectedRoute permission="performance:view"><ReviewDetail /></ProtectedRoute>} />
            <Route path="/performance/goals" element={<ProtectedRoute permission="performance:view"><GoalList /></ProtectedRoute>} />
            <Route path="/training/programs" element={<ProtectedRoute permission="training:view"><TrainingPrograms /></ProtectedRoute>} />
            <Route path="/training/programs/:id" element={<ProtectedRoute permission="training:view"><TrainingDetail /></ProtectedRoute>} />
            <Route path="/training/my-trainings" element={<MyTrainings />} />

            {/* Assets */}
            <Route path="/assets" element={<ProtectedRoute permission="assets:view"><AssetRegister /></ProtectedRoute>} />
            <Route path="/assets/my-assets" element={<MyAssets />} />

            {/* Comms & system */}
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/reports" element={<ProtectedRoute permission="reports:view"><Reports /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute permission="users:view"><UserList /></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute permission="audit:view"><AuditLogs /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute permission="settings:view"><Settings /></ProtectedRoute>} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/security" element={<Security />} />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
