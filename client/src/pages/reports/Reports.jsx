import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  BarChart3, Boxes, Briefcase, CalendarCheck, ClipboardList, Download, FileSpreadsheet, FolderKanban,
  GraduationCap, PlaneTakeoff, Receipt, Target, TrendingUp, UserCheck, Users, Wallet,
} from 'lucide-react';
import { reportApi } from '../../api/endpoints';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, TableWrap, Tabs } from '../../components/ui';
import { chartColors } from '../../hooks/useList';
import { currency, label } from '../../lib/utils';

const AXIS = { stroke: '#94a3b8', fontSize: 12 };
const TOOLTIP = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 } };
const YEAR = new Date().getFullYear();

const TABLES = [
  { value: 'headcount', label: 'હેડકાઉન્ટ' },
  { value: 'attrition', label: 'એટ્રિશન' },
  { value: 'attendance', label: 'હાજરી' },
  { value: 'leave', label: 'રજા' },
  { value: 'payroll', label: 'પગાર' },
  { value: 'recruitment', label: 'ભરતી' },
  { value: 'performance', label: 'કામગીરી' },
  { value: 'training', label: 'તાલીમ' },
  { value: 'projects', label: 'પ્રોજેક્ટ' },
  { value: 'timesheets', label: 'ટાઇમશીટ' },
  { value: 'assets', label: 'સંપત્તિ' },
  { value: 'reimbursements', label: 'ખર્ચ' },
  { value: 'departments', label: 'ડિપાર્ટમેન્ટ' },
  { value: 'onboarding', label: 'ઓનબોર્ડિંગ' },
];

export default function Reports() {
  const [tab, setTab] = useState('headcount');
  const [year, setYear] = useState(String(YEAR));

  const opts = (key, fn) => ({ queryKey: ['reports', key, year], queryFn: () => fn({ year }) });
  const headcount = useQuery(opts('headcount', reportApi.headcount));
  const attrition = useQuery(opts('attrition', reportApi.attrition));
  const attendance = useQuery(opts('attendance', reportApi.attendance));
  const leave = useQuery(opts('leave', reportApi.leave));
  const payroll = useQuery(opts('payroll', reportApi.payroll));
  const recruitment = useQuery(opts('recruitment', reportApi.recruitment));
  const performance = useQuery(opts('performance', reportApi.performance));
  const training = useQuery(opts('training', reportApi.training));
  const projects = useQuery(opts('projects', reportApi.projects));
  const timesheets = useQuery(opts('timesheets', reportApi.timesheets));
  const assets = useQuery(opts('assets', reportApi.assets));
  const reimbursements = useQuery(opts('reimbursements', reportApi.reimbursements));
  const departments = useQuery(opts('departments', reportApi.departments));
  const onboarding = useQuery(opts('onboarding', reportApi.onboarding));

  const d = (query) => query.data?.data;

  return (
    <div>
      <PageHeader
        title="રિપોર્ટ્સ અને એનાલિટિક્સ"
        subtitle="બધા મોડ્યુલના લાઇવ MongoDB આંકડા — CSV એક્સપોર્ટ સાથે"
        actions={(
          <>
            <select className="input w-28" value={year} onChange={(e) => setYear(e.target.value)}>
              {[YEAR, YEAR - 1, YEAR - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <a className="btn-primary" href={reportApi.masterExportUrl({ year })}><Download className="h-4 w-4" /> માસ્ટર એમ્પ્લોયી એક્સપોર્ટ</a>
          </>
        )}
      />

      <Tabs className="mb-4 overflow-x-auto" active={tab} onChange={setTab} tabs={TABLES} />

      {tab === 'headcount' && (
        <Section loading={headcount.isLoading} isError={headcount.isError} onRetry={headcount.refetch} csv="/api/reports/headcount?export=csv">
          <StatRow items={[
            { label: 'કુલ કર્મચારી', value: d(headcount)?.total ?? '—', icon: Users, tone: 'brand' },
            { label: 'સક્રિય', value: find(d(headcount)?.byStatus, 'active'), icon: UserCheck, tone: 'emerald' },
            { label: 'નોટિસ પીરિયડ', value: find(d(headcount)?.byStatus, 'notice_period'), icon: PlaneTakeoff, tone: 'amber' },
            { label: 'ડિપાર્ટમેન્ટ', value: (d(headcount)?.byDepartment || []).length, icon: Briefcase, tone: 'violet' },
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="ડિપાર્ટમેન્ટ મુજબ હેડકાઉન્ટ" icon={Users} data={d(headcount)?.byDepartment} labelKey="department" valueKey="headcount" />
            <Donut title="પદ મુજબ વિભાજન" icon={UserCheck} data={(d(headcount)?.byDesignation || []).map((x) => ({ name: x.designation || x._id, value: x.count }))} />
            <Bars title="રોજગાર પ્રકાર" icon={Briefcase} data={d(headcount)?.byType} labelKey="_id" valueKey="count" />
            <Bars title="સ્થળ મુજબ" icon={Users} data={d(headcount)?.byLocation} labelKey="_id" valueKey="count" />
          </div>
        </Section>
      )}

      {tab === 'attrition' && (
        <Section loading={attrition.isLoading} isError={attrition.isError} onRetry={attrition.refetch}>
          <StatRow items={[
            { label: 'જોડાયા', value: d(attrition)?.joiners ?? '—', icon: UserCheck, tone: 'emerald' },
            { label: 'નીકળ્યા', value: d(attrition)?.exits ?? '—', icon: PlaneTakeoff, tone: 'rose' },
            { label: 'ટર્નઓવર %', value: d(attrition)?.turnoverPercent !== undefined ? `${d(attrition).turnoverPercent}%` : '—', icon: TrendingUp, tone: 'amber' },
            { label: 'સરેરાશ ટેન્યોર', value: d(attrition)?.averageTenureYears !== undefined ? `${d(attrition).averageTenureYears} વર્ષ` : '—', icon: BarChart3, tone: 'violet' },
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="મહિના મુજબ જોડાયા / નીકળ્યા" icon={TrendingUp} data={d(attrition)?.monthly} labelKey="month" valueKey="joiners" />
            <Bars title="બહાર નીકળવાના કારણો" icon={PlaneTakeoff} data={d(attrition)?.byReason} labelKey="_id" valueKey="count" />
            <Bars title="ડિપાર્ટમેન્ટ મુજબ એક્ઝિટ" icon={Briefcase} data={d(attrition)?.byDepartment} labelKey="department" valueKey="exits" />
          </div>
        </Section>
      )}

      {tab === 'attendance' && (
        <Section loading={attendance.isLoading} isError={attendance.isError} onRetry={attendance.refetch} csv={`/api/reports/attendance?year=${year}&month=&export=csv`}>
          <Bars title="કર્મચારી મુજબ હાજરી" icon={CalendarCheck} data={d(attendance)?.rows} labelKey="name" valueKey="presentDays" />
          <DataTable data={d(attendance)?.rows} />
        </Section>
      )}

      {tab === 'leave' && (
        <Section loading={leave.isLoading} isError={leave.isError} onRetry={leave.refetch}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Donut title="રજા પ્રકાર મુજબ" icon={PlaneTakeoff} data={(d(leave)?.byType || []).map((x) => ({ name: x.leaveType || x._id, value: x.days || x.count }))} />
            <Donut title="સ્થિતિ મુજબ" icon={ClipboardList} data={(d(leave)?.byStatus || []).map((x) => ({ name: label(x._id), value: x.count }))} />
            <Bars title="ડિપાર્ટમેન્ટ મુજબ રજાના દિવસ" icon={Briefcase} data={d(leave)?.byDepartment} labelKey="department" valueKey="days" />
          </div>
          <DataTable title="રજા બેલેન્સ" data={d(leave)?.balances} />
        </Section>
      )}

      {tab === 'payroll' && (
        <Section loading={payroll.isLoading} isError={payroll.isError} onRetry={payroll.refetch}>
          <StatRow items={[
            { label: 'કુલ ગ્રોસ', value: currency(d(payroll)?.totals?.gross || 0), icon: Wallet, tone: 'brand' },
            { label: 'કુલ નેટ', value: currency(d(payroll)?.totals?.net || 0), icon: Wallet, tone: 'emerald' },
            { label: 'કુલ કપાત', value: currency(d(payroll)?.totals?.deductions || 0), icon: Receipt, tone: 'rose' },
          ]} />
          <Bars title="મહિના મુજબ પગાર" icon={Wallet} data={d(payroll)?.monthly} labelKey="month" valueKey="net" />
          <DataTable data={d(payroll)?.monthly} />
        </Section>
      )}

      {tab === 'recruitment' && (
        <Section loading={recruitment.isLoading} isError={recruitment.isError} onRetry={recruitment.refetch}>
          <StatRow items={[
            { label: 'ખુલ્લી જગ્યાઓ', value: d(recruitment)?.openPositions ?? '—', icon: Briefcase, tone: 'brand' },
            { label: 'ફનલ સ્ટેજ', value: (d(recruitment)?.funnel || []).length, icon: BarChart3, tone: 'violet' },
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="ભરતી ફનલ" icon={BarChart3} data={d(recruitment)?.funnel} labelKey="stage" valueKey="count" />
            <Donut title="સ્રોત મુજબ અરજી" icon={Users} data={(d(recruitment)?.bySource || []).map((x) => ({ name: x.source || x._id, value: x.count }))} />
            <Bars title="ડિપાર્ટમેન્ટ મુજબ ખુલ્લી જગ્યા" icon={Briefcase} data={d(recruitment)?.byDepartment} labelKey="department" valueKey="count" />
          </div>
        </Section>
      )}

      {tab === 'performance' && (
        <Section loading={performance.isLoading} isError={performance.isError} onRetry={performance.refetch}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="રેટિંગ વિતરણ" icon={Target} data={d(performance)?.distribution} labelKey="rating" valueKey="count" />
            <Bars title="ડિપાર્ટમેન્ટ સરેરાશ" icon={Briefcase} data={d(performance)?.byDepartment} labelKey="department" valueKey="avgRating" />
          </div>
          <DataTable title="ટોપ પરફોર્મર્સ" data={d(performance)?.topPerformers} />
        </Section>
      )}

      {tab === 'training' && (
        <Section loading={training.isLoading} isError={training.isError} onRetry={training.refetch}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Donut title="સ્થિતિ મુજબ નોંધણી" icon={GraduationCap} data={(d(training)?.byStatus || []).map((x) => ({ name: label(x._id), value: x.count }))} />
            <Bars title="કેટેગરી મુજબ" icon={GraduationCap} data={d(training)?.byCategory} labelKey="_id" valueKey="count" />
            <Bars title="ડિપાર્ટમેન્ટ પૂર્ણતા" icon={Briefcase} data={d(training)?.byDepartment} labelKey="department" valueKey="completed" />
          </div>
        </Section>
      )}

      {tab === 'projects' && (
        <Section loading={projects.isLoading} isError={projects.isError} onRetry={projects.refetch} csv="/api/reports/projects?export=csv">
          <DataTable data={d(projects)?.rows} />
        </Section>
      )}

      {tab === 'timesheets' && (
        <Section loading={timesheets.isLoading} isError={timesheets.isError} onRetry={timesheets.refetch}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="પ્રોજેક્ટ મુજબ કલાક" icon={FolderKanban} data={d(timesheets)?.byProject} labelKey="project" valueKey="hours" />
            <Bars title="કર્મચારી મુજબ કલાક" icon={Users} data={d(timesheets)?.byEmployee} labelKey="name" valueKey="hours" />
          </div>
          <DataTable data={d(timesheets)?.byEmployee} />
        </Section>
      )}

      {tab === 'assets' && (
        <Section loading={assets.isLoading} isError={assets.isError} onRetry={assets.refetch}>
          <StatRow items={[
            { label: 'કુલ મૂલ્ય', value: currency(d(assets)?.totalValue || 0), icon: Boxes, tone: 'brand' },
            { label: 'સરેરાશ ઉંમર (વર્ષ)', value: d(assets)?.avgAgeYears ?? '—', icon: BarChart3, tone: 'violet' },
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="કેટેગરી મુજબ" icon={Boxes} data={d(assets)?.byCategory} labelKey="_id" valueKey="count" />
            <Donut title="સ્થિતિ મુજબ" icon={Boxes} data={(d(assets)?.byStatus || []).map((x) => ({ name: label(x._id), value: x.count }))} />
          </div>
        </Section>
      )}

      {tab === 'reimbursements' && (
        <Section loading={reimbursements.isLoading} isError={reimbursements.isError} onRetry={reimbursements.refetch}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="મહિના મુજબ ખર્ચ" icon={Receipt} data={d(reimbursements)?.monthly} labelKey="month" valueKey="amount" />
            <Donut title="કેટેગરી મુજબ" icon={Receipt} data={(d(reimbursements)?.byCategory || []).map((x) => ({ name: label(x._id), value: x.amount }))} />
            <Bars title="ડિપાર્ટમેન્ટ મુજબ" icon={Briefcase} data={d(reimbursements)?.byDepartment} labelKey="department" valueKey="amount" />
          </div>
        </Section>
      )}

      {tab === 'departments' && (
        <Section loading={departments.isLoading} isError={departments.isError} onRetry={departments.refetch} csv={`/api/reports/departments?year=${year}&export=csv`}>
          <DataTable data={d(departments)?.rows} />
        </Section>
      )}

      {tab === 'onboarding' && (
        <Section loading={onboarding.isLoading} isError={onboarding.isError} onRetry={onboarding.refetch}>
          <StatRow items={[
            { label: 'સરેરાશ પૂર્ણતા (દિવસ)', value: d(onboarding)?.avgDaysToComplete ?? '—', icon: UserCheck, tone: 'brand' },
            { label: 'અટકેલા', value: (d(onboarding)?.stalled || []).length, icon: PlaneTakeoff, tone: 'amber' },
          ]} />
          <Donut title="સ્થિતિ મુજબ" icon={UserCheck} data={(d(onboarding)?.byStatus || []).map((x) => ({ name: label(x._id), value: x.count }))} />
          <DataTable title="અટકેલા ઓનબોર્ડિંગ" data={d(onboarding)?.stalled} />
        </Section>
      )}
    </div>
  );
}

function Section({ children, loading, isError, onRetry, csv }) {
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (isError) return <Card><ErrorState onRetry={onRetry} /></Card>;
  return (
    <div className="space-y-4">
      {csv && (
        <div className="flex justify-end">
          <a className="btn-secondary btn-xs" href={csv}><FileSpreadsheet className="h-3.5 w-3.5" /> CSV ડાઉનલોડ</a>
        </div>
      )}
      {children}
    </div>
  );
}

function StatRow({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((i) => <StatCard key={i.label} label={i.label} value={i.value} icon={i.icon} tone={i.tone} />)}
    </div>
  );
}

function resolveLabel(row, key) {
  const v = row?.[key];
  if (v === undefined || v === null || v === '') {
    const alt = row?.name || row?.department || row?.project || row?.month || row?._id || '—';
    return typeof alt === 'string' ? label(alt) : String(alt);
  }
  return typeof v === 'string' ? label(v) : v;
}

function Bars({ title, icon, data, labelKey = 'name', valueKey = 'count' }) {
  const rows = (data || []).map((r) => ({ name: resolveLabel(r, labelKey), value: Number(r[valueKey] ?? r.count ?? r.total ?? r.amount ?? r.hours ?? r.days ?? 0) }));
  return (
    <Card>
      <CardHeader title={title} icon={icon} />
      {rows.length === 0 ? <EmptyState title="ડેટા ઉપલબ્ધ નથી" /> : (
        <div className="px-2 py-4 sm:px-4" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={AXIS} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={AXIS} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {rows.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function Donut({ title, icon, data }) {
  const rows = (data || []).filter((r) => r.value !== undefined && r.value !== null);
  return (
    <Card>
      <CardHeader title={title} icon={icon} />
      {rows.length === 0 ? <EmptyState title="ડેટા ઉપલબ્ધ નથી" /> : (
        <div className="px-2 py-4 sm:px-4" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {rows.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip {...TOOLTIP} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function DataTable({ title, data }) {
  const rows = data || [];
  if (!rows.length) return <Card><CardHeader title={title || 'ડેટા'} icon={BarChart3} /><EmptyState title="ડેટા ઉપલબ્ધ નથી" /></Card>;
  const cols = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object').slice(0, 8);
  return (
    <Card>
      <CardHeader title={title || 'વિગતવાર ડેટા'} subtitle={`${rows.length} રેકોર્ડ`} icon={BarChart3} />
      <TableWrap>
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>{cols.map((c) => <th key={c} className="th">{label(c)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((r, i) => (
            <tr key={i} className="row">
              {cols.map((c) => <td key={c} className="td text-xs">{typeof r[c] === 'number' ? r[c] : (r[c] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </Card>
  );
}

function find(arr, id) {
  const hit = (arr || []).find((x) => x._id === id);
  return hit ? hit.count : 0;
}
