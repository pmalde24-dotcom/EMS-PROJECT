import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Users } from 'lucide-react';
import { leaveApi, departmentApi } from '../../api/endpoints';
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, Select, Skeleton, StatCard } from '../../components/ui';
import { cn, fmtDate, monthName } from '../../lib/utils';

export default function LeaveCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [department, setDepartment] = useState('');

  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });
  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'calendar', year, month, department],
    queryFn: () => leaveApi.calendar({ year, month, department: department || undefined }),
  });

  const days = data?.data?.days || [];
  const firstDay = days.length ? new Date(days[0].date).getUTCDay() : 0;
  const totalLeaves = days.reduce((s, d) => s + d.leaves.length, 0);
  const holidays = days.filter((d) => d.holiday);

  return (
    <div>
      <PageHeader
        title="રજા કેલેન્ડર"
        subtitle="કોણ ક્યારે રજા પર છે — ટીમ પ્લાનિંગ માટે"
        actions={(
          <div className="flex gap-2">
            <Select wrapperClassName="w-36" options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }))} value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} />
            <Select wrapperClassName="w-28" options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))} value={String(year)} onChange={(e) => setYear(Number(e.target.value))} />
            <Select wrapperClassName="w-52" placeholder="બધા ડિપાર્ટમેન્ટ" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="આ મહિને રજાઓ" value={totalLeaves} sub={`${monthName(month)} ${year}`} icon={CalendarDays} tone="brand" />
        <StatCard label="તહેવારો" value={holidays.length} sub={holidays[0] ? `${holidays[0].holiday.name} — ${fmtDate(holidays[0].date)}` : 'કોઈ તહેવાર નથી'} icon={CalendarDays} tone="violet" />
        <StatCard label="એકસાથે રજા પર (પીક)" value={Math.max(0, ...days.map((d) => d.leaves.length))} icon={Users} tone="amber" />
      </div>

      <Card>
        <CardHeader title={`${monthName(month)} ${year}`} subtitle="રજા, તહેવાર અને સાપ્તાહિક રજાનું દૃશ્ય" icon={CalendarDays} />
        <div className="p-4">
          {isLoading ? <Skeleton className="h-72 w-full" /> : (
            <>
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500">
                {['રવિ', 'સોમ', 'મંગળ', 'બુધ', 'ગુરુ', 'શુક્ર', 'શનિ'].map((d) => <div key={d} className="py-1">{d}</div>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-2">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} className="min-h-24 rounded-lg bg-slate-50/50 dark:bg-slate-800/20" />)}
                {days.map((d) => (
                  <div
                    key={d.date}
                    className={cn('min-h-24 rounded-lg border p-2 text-xs',
                      d.holiday ? 'border-violet-200 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10' : 'border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{new Date(d.date).getUTCDate()}</span>
                      {d.leaves.length > 0 && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{d.leaves.length}</span>}
                    </div>
                    {d.holiday && <p className="mt-1 truncate text-[10px] font-medium text-violet-700 dark:text-violet-300">{d.holiday.name}</p>}
                    <div className="mt-1 space-y-1">
                      {d.leaves.slice(0, 3).map((l) => (
                        <div key={l.id} className="flex items-center gap-1 rounded px-1 py-0.5" style={{ background: `${l.leaveType?.color || '#4f46e5'}1a` }}>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: l.leaveType?.color || '#4f46e5' }} />
                          <span className="truncate text-[10px] text-slate-700 dark:text-slate-200">{l.employee?.firstName} {l.employee?.lastName?.[0]}.</span>
                        </div>
                      ))}
                      {d.leaves.length > 3 && <p className="text-[10px] text-slate-400">+{d.leaves.length - 3} વધુ</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="આ મહિનાની તમામ રજાઓ" subtitle="કર્મચારી મુજબ" icon={Users} />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {days.flatMap((d) => d.leaves.map((l) => ({ ...l, date: d.date }))).length === 0 && <EmptyState title="આ મહિને કોઈ મંજૂર રજા નથી" />}
          {days.flatMap((d) => d.leaves.map((l) => ({ ...l, date: d.date }))).slice(0, 40).map((l) => (
            <div key={`${l.id}-${l.date}`} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar src={l.employee?.profilePhoto} name={`${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{l.employee?.firstName} {l.employee?.lastName}</p>
                <p className="text-xs text-slate-500">{l.employee?.department?.name || ''} · {l.leaveType?.name}</p>
              </div>
              <span className="text-xs text-slate-500">{fmtDate(l.date)}</span>
              <Badge value={l.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
