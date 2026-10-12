import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertCircle, ArrowRight, BadgeCheck, Building2, Cake, CalendarCheck, CalendarClock, CalendarDays,
  CheckCircle2, ClipboardList, FileSpreadsheet, FolderKanban, Gift, GraduationCap, Laptop, ListChecks,
  Megaphone, PartyPopper, PlaneTakeoff, Receipt, Target, TrendingUp, UserPlus, Users, Wallet,
} from 'lucide-react';
import { dashboardApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Progress, Skeleton, StatCard, TableSkeleton, TableWrap } from '../components/ui';
import { chartColors } from '../hooks/useList';
import { cn, currency, fmtDate, hours, label, monthName, relativeTime, STATUS_LABELS } from '../lib/utils';

const AXIS = { stroke: '#94a3b8', fontSize: 12 };
const TOOLTIP = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 } };

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'સુપ્રભાત';
  if (h < 17) return 'શુભ બપોર';
  return 'શુભ સાંજ';
};

function ChartCard({ title, subtitle, icon, children, height = 280, action }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={icon} action={action} />
      <div className="px-2 py-4 sm:px-4" style={{ height }}>{children}</div>
    </Card>
  );
}

function CelebrationList({ items, title, icon: Icon, subtitle }) {
  if (!items?.length) return null;
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={Icon} />
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.slice(0, 5).map((c) => (
          <div key={c._id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar src={c.profilePhoto} name={`${c.firstName} ${c.lastName}`} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.firstName} {c.lastName}</p>
              <p className="truncate text-xs text-slate-500">{c.department?.name || c.designation?.title || c.employeeId}</p>
            </div>
            <Badge
              value={c.inDays === 0 ? 'today' : 'pending'}
              label={c.inDays === 0 ? 'આજે!' : `${c.inDays} દિવસમાં`}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Admin / super-admin dashboard ────────────────────────────────── */
function AdminDashboard({ data }) {
  const att = data.attendance || {};
  const emp = data.employees || {};
  const trend = (att.trend || []).map((t) => ({ ...t, date: fmtDate(t.date).slice(0, 6) }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ કર્મચારી" value={emp.total ?? '—'} sub={`${emp.active ?? 0} સક્રિય · ${emp.newThisMonth ?? 0} નવા જોડાયા`} icon={Users} tone="brand" />
        <StatCard label="આજે હાજર" value={att.present ?? '—'} sub={`${att.late ?? 0} મોડા · ${att.onLeave ?? 0} રજા પર`} icon={CalendarCheck} tone="emerald" />
        <StatCard label="બાકી રજા મંજૂરી" value={data.leaves?.pendingApprovals ?? 0} sub={`${data.pendingActions?.attendanceCorrections ?? 0} હાજરી સુધારા વિનંતી`} icon={ClipboardList} tone="amber" />
        <StatCard label="ખુલ્લી જગ્યાઓ" value={data.recruitment?.openPositions ?? 0} sub={`${data.recruitment?.applicationsThisMonth ?? 0} અરજી આ મહિને`} icon={UserPlus} tone="violet" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="હાજરી ટ્રેન્ડ (30 દિવસ)" subtitle="રોજિંદા હાજર, ગેરહાજર અને રજા" icon={TrendingUp}>
            {trend.length === 0 ? <EmptyState title="પૂરતો ડેટા નથી" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" {...AXIS} />
                  <YAxis {...AXIS} />
                  <Tooltip {...TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="present" name="હાજર" stroke="#4f46e5" fill="url(#gPresent)" strokeWidth={2} />
                  <Area type="monotone" dataKey="absent" name="ગેરહાજર" stroke="#ef4444" fillOpacity={0} strokeWidth={2} />
                  <Area type="monotone" dataKey="onLeave" name="રજા" stroke="#f59e0b" fillOpacity={0} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <ChartCard title="ડિપાર્ટમેન્ટ મુજબ હેડકાઉન્ટ" subtitle="ટોચના 10 વિભાગ" icon={Building2}>
          {(data.organisation?.departmentHeadcount || []).length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.organisation.departmentHeadcount} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" {...AXIS} />
                <YAxis type="category" dataKey="name" width={92} {...AXIS} />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="count" name="કર્મચારી" radius={[0, 6, 6, 0]} fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader title="તાજેતરની પ્રવૃત્તિઓ" subtitle="ઓડિટ લોગમાંથી" icon={FileSpreadsheet} action={<Link to="/audit" className="btn-ghost btn-xs">બધું જુઓ <ArrowRight className="h-3 w-3" /></Link>} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.recentActivities || []).length === 0 && <EmptyState title="કોઈ પ્રવૃત્તિ નથી" />}
            {(data.recentActivities || []).slice(0, 8).map((a) => (
              <div key={a._id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="rounded-lg bg-slate-100 p-1.5 text-slate-500 dark:bg-slate-800"><AlertCircle className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-medium">{a.actor?.name || 'સિસ્ટમ'}</span> — {a.action} {a.model}
                  </p>
                  <p className="text-xs text-slate-400">{relativeTime(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="આ મહિનાનો પગારપત્રક" subtitle={data.payroll ? `${monthName(Number((data.payroll.period || '').split('-')[1]))} ${(data.payroll.period || '').split('-')[0]}` : 'કોઈ રન નથી'} icon={Wallet} />
          <div className="space-y-4 px-4 py-4">
            {data.payroll ? (
              <>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">કુલ નેટ પગાર</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-white">{currency(data.payroll.net)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-slate-500">કુલ ગ્રોસ</p><p className="font-medium">{currency(data.payroll.gross)}</p></div>
                  <div><p className="text-xs text-slate-500">કર્મચારી</p><p className="font-medium">{data.payroll.employees}</p></div>
                </div>
                <Badge value={data.payroll.status} />
                <Link to="/payroll/runs" className="btn-secondary w-full justify-center">પેરોલ રન જુઓ</Link>
              </>
            ) : <EmptyState title="પેરોલ રન બનાવો" action={<Link to="/payroll/runs" className="btn-primary btn-xs">પેરોલ રન</Link>} />}
          </div>
        </Card>

        <Card>
          <CardHeader title="એચઆર એક્શન" subtitle="તાત્કાલિક ધ્યાન જરૂરી" icon={AlertCircle} />
          <div className="space-y-2 p-4">
            {[
              { label: 'રજા મંજૂરી બાકી', value: data.pendingActions?.leaveApprovals ?? 0, to: '/leave/approvals', icon: CalendarDays, tone: 'amber' },
              { label: 'હાજરી સુધારા', value: data.pendingActions?.attendanceCorrections ?? 0, to: '/attendance/corrections', icon: CalendarClock, tone: 'rose' },
              { label: 'ઓનબોર્ડિંગ ચાલુ', value: (data.recentActivities || []).filter((a) => a.model === 'Onboarding').length, to: '/onboarding', icon: UserPlus, tone: 'violet' },
            ].map((a) => (
              <Link key={a.label} to={a.to} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
                <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><a.icon className="h-4 w-4 text-slate-400" /> {a.label}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold',
                  a.tone === 'amber' && 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
                  a.tone === 'rose' && 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
                  a.tone === 'violet' && 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300')}>{a.value}</span>
              </Link>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Link to="/employees" className="btn-secondary btn-xs justify-center"><Users className="h-3.5 w-3.5" /> કર્મચારી</Link>
              <Link to="/reports" className="btn-secondary btn-xs justify-center"><Target className="h-3.5 w-3.5" /> રિપોર્ટ</Link>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CelebrationList items={data.celebration?.birthdays} title="આવનારા જન્મદિવસ" subtitle="45 દિવસમાં" icon={Cake} />
        <CelebrationList items={data.celebration?.anniversaries} title="કાર્ય વર્ષગાંઠ" subtitle="45 દિવસમાં" icon={Gift} />
      </div>
    </>
  );
}

/* ── HR dashboard ─────────────────────────────────────────────────── */
function HrDashboard({ data }) {
  const stats = data.employeeStats || {};
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const pipeline = (data.recruitmentPipeline || []).map((p) => ({ name: label(p._id), value: p.count }));
  const leaveTrend = (data.leaveTrend || []).map((l) => ({ ...l, month: typeof l.month === 'number' ? monthName(l.month).slice(0, 3) : String(l.month).slice(0, 3) }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ કર્મચારી" value={total} sub={`${stats.probation || 0} પ્રોબેશન પર`} icon={Users} tone="brand" />
        <StatCard label="બાકી રજા વિનંતી" value={data.pendingLeaves?.length ?? 0} sub="મંજૂરીની રાહમાં" icon={CalendarDays} tone="amber" />
        <StatCard label="બાકી ખર્ચ ક્લેમ" value={data.pendingReimbursements ?? 0} sub="નિર્ણય જરૂરી" icon={Receipt} tone="rose" />
        <StatCard label="નવા જોડાયેલા" value={data.newJoineersThisMonth ?? 0} sub="આ મહિને" icon={UserPlus} tone="emerald" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="રજાનો ટ્રેન્ડ" subtitle="મંજૂર થયેલી રજાઓ — આ વર્ષ" icon={CalendarDays}>
            {leaveTrend.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaveTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" {...AXIS} />
                  <YAxis {...AXIS} />
                  <Tooltip {...TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="days" name="દિવસો" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="requests" name="વિનંતીઓ" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <ChartCard title="ભરતી પાઇપલાઇન" subtitle="તબક્કા મુજબ ઉમેદવારો" icon={UserPlus}>
          {pipeline.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pipeline} dataKey="value" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={2}>
                  {pipeline.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="બાકી રજા મંજૂરી" subtitle="પ્રાથમિકતા મુજબ" icon={ClipboardList} action={<Link to="/leave/approvals" className="btn-ghost btn-xs">બધું</Link>} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.pendingLeaves || []).length === 0 && <EmptyState title="કંઈ બાકી નથી" />}
            {(data.pendingLeaves || []).map((l) => (
              <div key={l._id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar src={l.employee?.profilePhoto} name={`${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{l.employee?.firstName} {l.employee?.lastName}</p>
                  <p className="text-xs text-slate-500">{l.leaveType?.name} · {fmtDate(l.startDate)} → {fmtDate(l.endDate)} · {l.totalDays} દિવસ</p>
                </div>
                <Badge value={l.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="ઓનબોર્ડિંગ પ્રગતિ" subtitle="ચાલુ પ્રક્રિયાઓ" icon={UserPlus} action={<Link to="/onboarding" className="btn-ghost btn-xs">બધું</Link>} />
          <div className="space-y-3 p-4">
            {(data.onboardingProgress || []).length === 0 && <EmptyState title="કોઈ ચાલુ ઓનબોર્ડિંગ નથી" />}
            {(data.onboardingProgress || []).map((o) => {
              const tasks = o.tasks || [];
              const done = tasks.filter((t) => t.status === 'completed').length;
              const pctVal = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
              return (
                <div key={o._id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <Link to={`/onboarding/${o._id}`} className="truncate font-medium text-slate-700 hover:text-brand-600 dark:text-slate-200">
                      {o.employee?.firstName} {o.employee?.lastName}
                    </Link>
                    <span className="text-xs text-slate-500">{done}/{tasks.length}</span>
                  </div>
                  <Progress value={pctVal} showLabel />
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="ધ્યાન જરૂરી" subtitle="દસ્તાવેજો અને પ્રોબેશન" icon={AlertCircle} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.expiringDocuments || []).length === 0 && (data.probationEnding || []).length === 0 && <EmptyState title="કંઈ બાકી નથી" />}
            {(data.expiringDocuments || []).slice(0, 4).map((d, i) => (
              <div key={`doc-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-500/10"><BadgeCheck className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700 dark:text-slate-200">{d.firstName} {d.lastName} — {d.title}</p>
                  <p className="text-xs text-slate-400">સમાપ્તિ: {fmtDate(d.expiryDate)}</p>
                </div>
              </div>
            ))}
            {(data.probationEnding || []).slice(0, 4).map((p) => (
              <div key={p._id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="rounded-lg bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-500/10"><CalendarClock className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700 dark:text-slate-200">{p.firstName} {p.lastName} — પ્રોબેશન</p>
                  <p className="text-xs text-slate-400">{fmtDate(p.probationEndDate)} ના રોજ પૂર્ણ</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader title="આવનારા તહેવારો" subtitle="આગામી રજાઓ" icon={PlaneTakeoff} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">તહેવાર</th><th className="th">તારીખ</th><th className="th">પ્રકાર</th><th className="th">દિવસ</th></tr>
            </thead>
            <tbody>
              {(data.upcomingHolidays || []).map((h) => (
                <tr key={h._id} className="row">
                  <td className="td font-medium">{h.name}</td>
                  <td className="td">{fmtDate(h.date)}</td>
                  <td className="td"><Badge value={h.type} label={label(h.type)} /></td>
                  <td className="td text-slate-500">{new Date(h.date).toLocaleDateString('gu-IN', { weekday: 'long' })}</td>
                </tr>
              ))}
              {(data.upcomingHolidays || []).length === 0 && <tr><td className="td" colSpan={4}><EmptyState /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      </div>
    </>
  );
}

/* ── Manager dashboard ────────────────────────────────────────────── */
function ManagerDashboard({ data }) {
  const t = data.team || {};
  const att = data.attendance || {};
  const taskStats = data.taskStats?.byStatus || [];
  const pie = taskStats.map((s) => ({ name: label(s.status), value: s.count }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ટીમ સાઇઝ" value={t.size ?? 0} sub="સીધા રિપોર્ટી" icon={Users} tone="brand" />
        <StatCard label="આજે હાજર" value={att.present ?? 0} sub={`${att.onLeave ?? 0} રજા · ${att.absent ?? 0} ગેરહાજર`} icon={CalendarCheck} tone="emerald" />
        <StatCard label="બાકી મંજૂરી" value={(data.pendingApprovals?.leaves ?? 0) + (data.pendingApprovals?.timesheets ?? 0)} sub={`${data.pendingApprovals?.leaves ?? 0} રજા · ${data.pendingApprovals?.timesheets ?? 0} ટાઇમશીટ`} icon={ClipboardList} tone="amber" />
        <StatCard label="ટીમ કાર્ય પૂર્ણતા" value={`${data.taskStats?.completionPercent ?? 0}%`} sub={`${data.taskStats?.completed ?? 0} / ${data.taskStats?.total ?? 0} પૂર્ણ`} icon={ListChecks} tone="violet" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="ટીમ સભ્યો" subtitle="આજની સ્થિતિ" icon={Users} />
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">કર્મચારી</th><th className="th">હોદ્દો</th><th className="th">સ્થિતિ</th><th className="th"></th></tr>
              </thead>
              <tbody>
                {(t.members || []).map((m) => (
                  <tr key={m._id} className="row">
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={m.profilePhoto} name={`${m.firstName} ${m.lastName}`} size="xs" />
                        <span>
                          <span className="block font-medium">{m.firstName} {m.lastName}</span>
                          <span className="block text-xs text-slate-400">{m.employeeId}</span>
                        </span>
                      </div>
                    </td>
                    <td className="td">{m.designation?.title || '—'}</td>
                    <td className="td"><Badge value={m.employmentStatus} /></td>
                    <td className="td text-right"><Link to={`/employees/${m._id}`} className="btn-ghost btn-xs">પ્રોફાઇલ</Link></td>
                  </tr>
                ))}
                {(t.members || []).length === 0 && <tr><td className="td" colSpan={4}><EmptyState title="ટીમમાં કોઈ સભ્ય નથી" /></td></tr>}
              </tbody>
            </TableWrap>
          </Card>
        </div>

        <ChartCard title="કાર્ય સ્થિતિ" subtitle="સ્થિતિ મુજબ વિભાજન" icon={ListChecks}>
          {pie.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={84} paddingAngle={2}>
                  {pie.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="ટીમની રજા વિનંતીઓ" subtitle="મંજૂરી બાકી" icon={CalendarDays} action={<Link to="/leave/approvals" className="btn-ghost btn-xs">મંજૂરી પેજ</Link>} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.approvals || []).length === 0 && <EmptyState title="કોઈ બાકી વિનંતી નથી" />}
            {(data.approvals || []).map((l) => (
              <div key={l._id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar src={l.employee?.profilePhoto} name={`${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{l.employee?.firstName} {l.employee?.lastName}</p>
                  <p className="text-xs text-slate-500">{l.leaveType?.name} · {l.totalDays} દિવસ · {fmtDate(l.startDate)}</p>
                </div>
                <Badge value={l.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="ટીમ પ્રદર્શન" subtitle="કાર્ય પૂર્ણતા દર" icon={Target} />
          <div className="space-y-3 p-4">
            {(data.teamPerformance || []).length === 0 && <EmptyState />}
            {(data.teamPerformance || []).map((p) => (
              <div key={p.employeeId}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 truncate font-medium text-slate-700 dark:text-slate-200">
                    <Avatar src={p.photo} name={p.name} size="xs" /> {p.name}
                  </span>
                  <span className="text-xs text-slate-500">{p.completed}/{p.total}{p.overdue ? ` · ${p.overdue} મોડા` : ''}</span>
                </div>
                <Progress value={p.rate} showLabel />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

/* ── Employee dashboard ───────────────────────────────────────────── */
function EmployeeDashboard({ data }) {
  const e = data.employee || {};
  const att = data.attendance || {};
  const live = att.live;
  const balances = data.leave?.balances || [];
  const taskStatus = data.tasks?.byStatus || [];

  return (
    <>
      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-brand-700 to-brand-600 p-5 text-white sm:flex-row sm:items-center">
          <Avatar src={e.profilePhoto} name={e.name} size="lg" className="ring-white/40" />
          <div className="flex-1">
            <p className="text-xs text-brand-100">{greeting()},</p>
            <h2 className="text-xl font-semibold">{e.name}</h2>
            <p className="mt-0.5 text-sm text-brand-100">
              {e.designation || '—'} · {e.department || '—'} · {e.employeeId}
            </p>
            <p className="mt-0.5 text-xs text-brand-200">
              રિપોર્ટિંગ મેનેજર: {e.reportingManager?.name || '—'} · શિફ્ટ: {e.shift?.name || '—'}
              {e.shift ? ` (${e.shift.startTime}–${e.shift.endTime})` : ''}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 text-center backdrop-blur">
            <p className="text-xs text-brand-100">આજની હાજરી</p>
            <p className="text-lg font-semibold">{att.today?.checkIn ? (live ? 'કામ ચાલુ' : 'પૂર્ણ') : 'બાકી'}</p>
            <p className="text-[11px] text-brand-100">
              {live ? `${hours(live.minutes)} વીત્યા` : att.today?.checkIn ? `${att.today.workedHours || 0} કલાક` : 'પંચ-ઇન કરો'}
            </p>
            <Link to="/attendance" className="btn-xs mt-2 inline-flex bg-white/90 text-brand-700 hover:bg-white">હાજરી પેજ</Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="બાકી કાર્યો" value={(data.tasks?.total ?? 0) - (taskStatus.find((s) => s.status === 'completed')?.count || 0)} sub={`${data.tasks?.total ?? 0} કુલ સોંપાયેલા`} icon={ListChecks} tone="brand" />
        <StatCard label="બાકી રજા વિનંતી" value={data.leave?.pendingRequests ?? 0} sub="મંજૂરીની રાહમાં" icon={CalendarDays} tone="amber" />
        <StatCard label="આ મહિનાની હાજરી" value={att.monthSummary?.present ?? 0} sub={`${att.monthSummary?.absent ?? 0} ગેરહાજર · ${att.monthSummary?.leave ?? att.monthSummary?.on_leave ?? 0} રજા`} icon={CalendarCheck} tone="emerald" />
        <StatCard label="છેલ્લો નેટ પગાર" value={data.latestPayslip ? currency(data.latestPayslip.netPay) : '—'} sub={data.latestPayslip ? `${monthName(data.latestPayslip.month)} ${data.latestPayslip.year}` : 'પે-સ્લિપ ઉપલબ્ધ નથી'} icon={Wallet} tone="violet" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="મારી રજા બેલેન્સ" subtitle="આ વર્ષ" icon={CalendarDays} action={<Link to="/leave" className="btn-ghost btn-xs">રજા અરજી</Link>} />
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {balances.length === 0 && <EmptyState title="બેલેન્સ ઉપલબ્ધ નથી" />}
            {balances.map((b) => (
              <div key={b.code || b.name} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{b.name}</p>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color || '#4f46e5' }} />
                </div>
                <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{b.available ?? 0}</p>
                <p className="text-xs text-slate-500">ઉપલબ્ધ · {b.used ?? 0} વપરાયેલ · {b.pending ?? 0} બાકી</p>
                <Progress className="mt-2" value={b.allocated ? ((b.used || 0) / b.allocated) * 100 : 0} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="આવનારા ડેડલાઇન" subtitle="મારા બાકી કાર્યો" icon={ListChecks} action={<Link to="/tasks" className="btn-ghost btn-xs">બધું</Link>} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.tasks?.upcoming || []).length === 0 && <EmptyState title="કોઈ બાકી કાર્ય નથી" />}
            {(data.tasks?.upcoming || []).map((t) => (
              <Link key={t._id} to={`/tasks/${t._id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', t.isOverdue ? 'bg-rose-500' : 'bg-brand-500')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.project?.name || 'સામાન્ય'} · {t.dueDate ? fmtDate(t.dueDate) : 'ડેડલાઇન નથી'}</p>
                </div>
                <Badge value={t.status} />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader title="મારા એસેટ" icon={Laptop} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.assets || []).length === 0 && <EmptyState title="કોઈ એસેટ સોંપાયેલ નથી" />}
            {(data.assets || []).map((a) => (
              <div key={a._id} className="px-4 py-2.5">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{a.asset?.name || '—'}</p>
                <p className="text-xs text-slate-500">{a.asset?.assetId} · {label(a.asset?.category)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="મારી તાલીમ" icon={GraduationCap} action={<Link to="/training/my-trainings" className="btn-ghost btn-xs">બધું</Link>} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.training || []).length === 0 && <EmptyState title="કોઈ તાલીમ સોંપાયેલ નથી" />}
            {(data.training || []).map((t) => (
              <div key={t._id} className="px-4 py-2.5">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.program?.title}</p>
                <p className="text-xs text-slate-500">{fmtDate(t.program?.startDate)} · {t.program?.durationHours} કલાક</p>
                <Badge value={t.status} className="mt-1" />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="તહેવારો" icon={PartyPopper} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.upcomingHolidays || []).length === 0 && <EmptyState />}
            {(data.upcomingHolidays || []).map((h) => (
              <div key={h._id} className="flex items-center justify-between px-4 py-2.5">
                <div><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{h.name}</p><p className="text-xs text-slate-500">{label(h.type)}</p></div>
                <span className="text-xs font-medium text-slate-500">{fmtDate(h.date)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="જાહેરાતો" icon={Megaphone} action={<Link to="/announcements" className="btn-ghost btn-xs">બધું</Link>} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.announcements || []).length === 0 && <EmptyState />}
            {(data.announcements || []).map((a) => (
              <div key={a._id} className="px-4 py-2.5">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{a.title}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{a.summary}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{relativeTime(a.publishAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user, role, isAdmin } = useAuth();

  const endpoint = isAdmin ? (role === 'hr_manager' ? 'hr' : 'admin') : ['department_manager', 'team_leader'].includes(role) ? 'manager' : 'employee';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', endpoint, user?._id],
    queryFn: () => dashboardApi[endpoint](),
    enabled: !!user,
  });

  const roleTitles = {
    admin: ['કંપની ડેશબોર્ડ', 'સંપૂર્ણ સંસ્થાનું રીઅલ-ટાઇમ ચિત્ર'],
    hr: ['HR ડેશબોર્ડ', 'કર્મચારી, ભરતી અને ઓનબોર્ડિંગનું નિરીક્ષણ'],
    manager: ['મેનેજર ડેશબોર્ડ', 'તમારી ટીમ, કાર્યો અને મંજૂરીઓ'],
    employee: ['મારું ડેશબોર્ડ', 'તમારી હાજરી, રજા, કાર્યો અને પગાર'],
  };

  const payload = data?.data;
  const isEmptyPrivileged = payload?.isPrivileged;

  return (
    <div>
      <PageHeader
        title={roleTitles[endpoint][0]}
        subtitle={`${greeting()}, ${user?.name} — ${roleTitles[endpoint][1]}`}
        actions={(
          <>
            <Link to="/attendance" className="btn-secondary"><CalendarCheck className="h-4 w-4" /> હાજરી</Link>
            <Link to="/leave" className="btn-primary"><CalendarDays className="h-4 w-4" /> રજા અરજી</Link>
          </>
        )}
      />

      {isLoading && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="card-pad"><Skeleton className="h-4 w-24" /><Skeleton className="mt-3 h-7 w-20" /></Card>)}
          </div>
          <Card><TableSkeleton rows={5} cols={4} /></Card>
        </div>
      )}

      {isError && !isLoading && <Card><ErrorState onRetry={refetch} /></Card>}

      {!isLoading && !isError && payload && (
        isEmptyPrivileged ? (
          <Card><EmptyState icon={AlertCircle} title="તમારું લોગિન કર્મચારી રેકોર્ડ સાથે જોડાયેલું નથી" message={payload.message} /></Card>
        ) : endpoint === 'admin' ? <AdminDashboard data={payload} />
          : endpoint === 'hr' ? <HrDashboard data={payload} />
            : endpoint === 'manager' ? <ManagerDashboard data={payload} />
              : <EmployeeDashboard data={payload} />
      )}
    </div>
  );
}

void STATUS_LABELS; void FolderKanban; void CheckCircle2; void Receipt;
