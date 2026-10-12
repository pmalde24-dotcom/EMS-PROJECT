import {
  LayoutDashboard, Users, Building2, BadgeCheck, CalendarCheck, CalendarDays, Wallet, Receipt,
  BriefcaseBusiness, UserPlus, LogOut, FolderKanban, ListChecks, Clock, Target, GraduationCap,
  Laptop, Megaphone, BarChart3, ScrollText, Settings, ShieldCheck, PartyPopper, CalendarOff,
  Timer, ClipboardList, FileSpreadsheet, Bell,
} from 'lucide-react';

/**
 * Sidebar navigation. Each item declares `perm` (any-of) and/or `roles`.
 * Items the user cannot access are hidden (the backend enforces them too).
 */
export const NAV_SECTIONS = [
  {
    title: 'મુખ્ય',
    items: [
      { to: '/dashboard', label: 'ડેશબોર્ડ', icon: LayoutDashboard, always: true },
      { to: '/announcements', label: 'જાહેરાતો', icon: Megaphone, perm: 'announcements:view' },
      { to: '/notifications', label: 'સૂચનાઓ', icon: Bell },
    ],
  },
  {
    title: 'મારું કાર્યસ્થળ',
    items: [
      { to: '/attendance', label: 'હાજરી', icon: CalendarCheck, perm: 'attendance:view', roles: ['employee', 'team_leader', 'department_manager', 'hr_manager', 'hr_admin', 'super_admin'] },
      { to: '/leave', label: 'રજાઓ', icon: CalendarDays, perm: 'leave:view' },
      { to: '/tasks', label: 'કાર્યો (Tasks)', icon: ListChecks, perm: 'tasks:view' },
      { to: '/timesheets', label: 'ટાઇમશીટ', icon: Timer, perm: 'timesheets:view' },
      { to: '/reimbursements', label: 'ખર્ચ ક્લેમ', icon: Receipt, perm: 'reimbursements:view' },
      { to: '/assets/my-assets', label: 'મારા એસેટ', icon: Laptop, perm: 'assets:view' },
      { to: '/training/my-trainings', label: 'મારી તાલીમ', icon: GraduationCap, perm: 'training:view' },
      { to: '/performance/my-reviews', label: 'પ્રદર્શન', icon: Target, perm: 'performance:view' },
    ],
  },
  {
    title: 'HR ઓપરેશન્સ',
    items: [
      { to: '/employees', label: 'કર્મચારીઓ', icon: Users, perm: 'employees:view' },
      { to: '/departments', label: 'ડિપાર્ટમેન્ટ', icon: Building2, perm: 'departments:view' },
      { to: '/designations', label: 'હોદ્દા', icon: BadgeCheck, perm: 'designations:view' },
      { to: '/attendance/records', label: 'હાજરી રેકોર્ડ', icon: CalendarCheck, perm: 'attendance:view', roles: ['hr_admin', 'hr_manager', 'department_manager', 'team_leader', 'super_admin'] },
      { to: '/leave/approvals', label: 'રજા મંજૂરી', icon: ClipboardList, perm: 'leave:approve', roles: ['hr_admin', 'hr_manager', 'super_admin'] },
      { to: '/leave/requests', label: 'રજા વિનંતીઓ', icon: CalendarDays, perm: 'leave:view', roles: ['hr_admin', 'hr_manager', 'super_admin'] },
      { to: '/leave/types', label: 'રજા પ્રકારો', icon: CalendarOff, perm: 'leave:update', roles: ['hr_admin', 'hr_manager', 'super_admin'] },
      { to: '/leave/calendar', label: 'રજા કેલેન્ડર', icon: CalendarDays, perm: 'leave:view' },
      { to: '/onboarding', label: 'ઓનબોર્ડિંગ', icon: UserPlus, perm: 'onboarding:view' },
      { to: '/offboarding', label: 'ઓફબોર્ડિંગ', icon: LogOut, perm: 'offboarding:view' },
      { to: '/reimbursements/approvals', label: 'ક્લેમ મંજૂરી', icon: Receipt, perm: 'reimbursements:approve', roles: ['hr_admin', 'hr_manager', 'super_admin'] },
    ],
  },
  {
    title: 'ભરતી',
    items: [
      { to: '/recruitment/jobs', label: 'જોબ ઓપનિંગ્સ', icon: BriefcaseBusiness, perm: 'recruitment:view' },
      { to: '/recruitment/pipeline', label: 'કેન્ડિડેટ પાઇપલાઇન', icon: FolderKanban, perm: 'recruitment:view' },
      { to: '/recruitment/applications', label: 'અરજીઓ', icon: ClipboardList, perm: 'recruitment:view' },
    ],
  },
  {
    title: 'પગારપત્રક',
    items: [
      { to: '/payroll/my-payslips', label: 'મારા પે-સ્લિપ', icon: FileSpreadsheet, perm: 'payroll:view' },
      { to: '/payroll/my-salary', label: 'મારો પગાર', icon: Wallet, perm: 'payroll:view' },
      { to: '/payroll/runs', label: 'પેરોલ રન', icon: Wallet, perm: 'payroll:create', roles: ['hr_admin', 'hr_manager', 'super_admin'] },
      { to: '/payroll/structures', label: 'સેલેરી સ્ટ્રક્ચર', icon: Wallet, perm: 'payroll:update', roles: ['hr_admin', 'super_admin'] },
      { to: '/payroll/payslips', label: 'બધા પે-સ્લિપ', icon: FileSpreadsheet, perm: 'payroll:view', roles: ['hr_admin', 'hr_manager', 'super_admin'] },
    ],
  },
  {
    title: 'પ્રોજેક્ટ',
    items: [
      { to: '/projects', label: 'પ્રોજેક્ટ', icon: FolderKanban, perm: 'projects:view' },
      { to: '/tasks/board', label: 'કાનબાન બોર્ડ', icon: ListChecks, perm: 'tasks:view' },
      { to: '/timesheets/approvals', label: 'ટાઇમશીટ મંજૂરી', icon: Clock, perm: 'timesheets:approve' },
    ],
  },
  {
    title: 'એચઆર સિસ્ટમ',
    items: [
      { to: '/performance/reviews', label: 'પ્રદર્શન સમીક્ષા', icon: Target, perm: 'performance:update', roles: ['hr_admin', 'hr_manager', 'department_manager', 'super_admin'] },
      { to: '/performance/goals', label: 'લક્ષ્યો (OKR)', icon: Target, perm: 'performance:view' },
      { to: '/training/programs', label: 'તાલીમ કાર્યક્રમ', icon: GraduationCap, perm: 'training:create', roles: ['hr_admin', 'hr_manager', 'super_admin'] },
      { to: '/assets', label: 'એસેટ રજિસ્ટર', icon: Laptop, perm: 'assets:view', roles: ['hr_admin', 'hr_manager', 'super_admin', 'department_manager'] },
      { to: '/holidays', label: 'તહેવારો', icon: CalendarOff, perm: 'holidays:view' },
      { to: '/shifts', label: 'શિફ્ટ', icon: Clock, perm: 'shifts:view', roles: ['hr_admin', 'hr_manager', 'super_admin'] },
    ],
  },
  {
    title: 'વિશ્લેષણ અને સેટિંગ',
    items: [
      { to: '/reports', label: 'રિપોર્ટ્સ', icon: BarChart3, perm: 'reports:view' },
      { to: '/users', label: 'વપરાશકર્તા', icon: ShieldCheck, perm: 'users:view', roles: ['super_admin', 'hr_admin'] },
      { to: '/audit', label: 'ઓડિટ લોગ', icon: ScrollText, perm: 'audit:view', roles: ['super_admin'] },
      { to: '/settings', label: 'કંપની સેટિંગ', icon: Settings, perm: 'settings:view', roles: ['super_admin', 'hr_admin'] },
    ],
  },
];

export const filterNav = (sections, { can, hasRole, role }) => sections
  .map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.always) return true;
      if (item.roles && !item.roles.includes(role)) return false;
      if (item.perm && !can(item.perm)) return false;
      return true;
    }),
  }))
  .filter((section) => section.items.length);

export const ROLE_HOME = '/dashboard';
void PartyPopper;
