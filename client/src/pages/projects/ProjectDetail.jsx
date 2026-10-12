import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Clock, FolderKanban, ListChecks, Plus, UserMinus, Users } from 'lucide-react';
import { projectApi, taskApi, employeeApi, timesheetApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Progress,
  Select, Skeleton, StatCard, TableWrap, Tabs,
} from '../../components/ui';
import { currency, fmtDate, label, monthName } from '../../lib/utils';

export default function ProjectDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState('tasks');
  const [memberOpen, setMemberOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [member, setMember] = useState({ employee: '', role: 'Member', allocatedPercent: 100 });
  const [task, setTask] = useState({ title: '', description: '', assignees: [], priority: 'medium', dueDate: '', estimatedHours: 8 });

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['project', id], queryFn: () => projectApi.get(id), enabled: !!id });
  const { data: progress } = useQuery({ queryKey: ['project', id, 'progress'], queryFn: () => projectApi.progress(id), enabled: !!id });
  const { data: tasks } = useQuery({ queryKey: ['tasks', 'project', id], queryFn: () => taskApi.list({ project: id, limit: 100 }), enabled: !!id && tab === 'tasks' });
  const { data: timesheets } = useQuery({ queryKey: ['timesheets', 'project', id], queryFn: () => timesheetApi.list({ project: id, limit: 50 }), enabled: !!id && tab === 'timesheets' });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }), enabled: memberOpen || taskOpen });

  const addMember = useMutation({
    mutationFn: (payload) => projectApi.addMember(id, payload),
    onSuccess: () => { toast.success('સભ્ય ઉમેરાયો'); qc.invalidateQueries({ queryKey: ['project', id] }); setMemberOpen(false); setMember({ employee: '', role: 'Member', allocatedPercent: 100 }); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const removeMember = useMutation({
    mutationFn: (memberId) => projectApi.removeMember(id, memberId),
    onSuccess: () => { toast.success('સભ્ય દૂર કરાયો'); qc.invalidateQueries({ queryKey: ['project', id] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const createTask = useMutation({
    mutationFn: (payload) => taskApi.create({ ...payload, project: id }),
    onSuccess: () => { toast.success('કાર્ય ઉમેરાયું'); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['project', id] }); setTaskOpen(false); setTask({ title: '', description: '', assignees: [], priority: 'medium', dueDate: '', estimatedHours: 8 }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !data?.data) return <Card><ErrorState onRetry={refetch} /></Card>;

  const p = data.data.project;
  const stats = data.data.taskStats || [];
  const ts = data.data.timesheetStats || {};
  const total = stats.reduce((s, x) => s + x.count, 0);
  const completed = stats.find((s) => s._id === 'completed')?.count || 0;

  return (
    <div>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> પ્રોજેક્ટ યાદી
      </Link>

      <PageHeader
        title={p.name}
        subtitle={`${p.code || ''} · ${p.client || ''} · મેનેજર: ${p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : '—'}`}
        actions={(
          <>
            <Badge value={p.status} label={label(p.status)} />
            {can('tasks:create') && <Button icon={Plus} onClick={() => setTaskOpen(true)}>કાર્ય ઉમેરો</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ કાર્યો" value={total} sub={`${completed} પૂર્ણ`} icon={ListChecks} tone="brand" />
        <StatCard label="પ્રગતિ" value={`${total ? Math.round((completed / total) * 100) : 0}%`} icon={FolderKanban} tone="emerald" />
        <StatCard label="લોગ થયેલા કલાક" value={`${ts.hours || 0} કલાક`} sub={`બિલેબલ: ${ts.billable || 0} કલાક`} icon={Clock} tone="violet" />
        <StatCard label="બજેટ" value={p.budget?.amount ? currency(p.budget.amount) : '—'} sub={`${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}`} icon={FolderKanban} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="પ્રોજેક્ટ વિગત" subtitle={p.description || 'વર્ણન નથી'} icon={FolderKanban} />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <Info l="સ્થિતિ" v={label(p.status)} />
            <Info l="પ્રાથમિકતા" v={label(p.priority)} />
            <Info l="બિલેબલ" v={p.billable ? 'હા' : 'ના'} />
            <Info l="ડિપાર્ટમેન્ટ" v={p.department?.name || '—'} />
            <Info l="ટાગ્સ" v={(p.tags || []).join(', ') || '—'} />
            <Info l="ટીમ સાઇઝ" v={`${(p.team || []).length} સભ્ય`} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="ટીમ" subtitle={`${(p.team || []).length} સભ્ય`} icon={Users}
            action={can('projects:update') && <Button size="xs" onClick={() => setMemberOpen(true)}>ઉમેરો</Button>}
          />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(p.team || []).map((m) => (
              <div key={m._id || m.employee?._id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar src={m.employee?.profilePhoto} name={`${m.employee?.firstName || ''} ${m.employee?.lastName || ''}`} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{m.employee?.firstName} {m.employee?.lastName}</p>
                  <p className="text-xs text-slate-500">{m.role || 'સભ્ય'}{m.allocatedPercent ? ` · ${m.allocatedPercent}%` : ''}</p>
                </div>
                {can('projects:update') && m._id && (
                  <button className="btn-ghost btn-xs text-rose-600" onClick={() => removeMember.mutate(m._id)}><UserMinus className="h-3.5 w-3.5" /></button>
                )}
              </div>
            ))}
            {(p.team || []).length === 0 && <EmptyState title="ટીમમાં કોઈ સભ્ય નથી" />}
          </div>
        </Card>
      </div>

      <Tabs
        className="mt-4 mb-4" active={tab} onChange={setTab}
        tabs={[{ value: 'tasks', label: 'કાર્યો' }, { value: 'progress', label: 'પ્રગતિ વિશ્લેષણ' }, { value: 'timesheets', label: 'ટાઇમશીટ' }]}
      />

      {tab === 'tasks' && (
        <Card>
          <CardHeader title="પ્રોજેક્ટ કાર્યો" subtitle={`${(tasks?.data || []).length} કાર્ય`} icon={ListChecks} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">કાર્ય</th><th className="th">સોંપાયેલ</th><th className="th">ડેડલાઇન</th><th className="th">અંદાજ/લોગ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
            </thead>
            <tbody>
              {(tasks?.data || []).map((t) => (
                <tr key={t._id} className="row">
                  <td className="td"><Link to={`/tasks/${t._id}`} className="font-medium hover:text-brand-600">{t.title}</Link><p className="text-xs text-slate-400">{label(t.priority)}</p></td>
                  <td className="td text-xs">{(t.assignees || []).map((a) => `${a.firstName} ${a.lastName}`).join(', ') || '—'}</td>
                  <td className="td">{fmtDate(t.dueDate)}{t.isOverdue ? <span className="ml-1 text-xs text-rose-600">મોડું</span> : null}</td>
                  <td className="td text-xs">{t.estimatedHours || 0} કલાક / {t.loggedHours || 0} કલાક</td>
                  <td className="td"><Badge value={t.status} /></td>
                  <td className="td text-right"><Link to={`/tasks/${t._id}`} className="btn-ghost btn-xs">જુઓ</Link></td>
                </tr>
              ))}
              {(tasks?.data || []).length === 0 && <tr><td className="td" colSpan={6}><EmptyState title="કોઈ કાર્ય નથી" /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'progress' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="સ્થિતિ મુજબ કાર્યો" icon={ListChecks} />
            <div className="space-y-3 p-4">
              {(progress?.data?.byStatus || []).map((s) => (
                <div key={s._id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{label(s._id)}</span>
                    <span className="font-medium">{s.count}</span>
                  </div>
                  <Progress className="mt-1" value={total ? (s.count / total) * 100 : 0} />
                </div>
              ))}
              {(progress?.data?.byStatus || []).length === 0 && <EmptyState />}
            </div>
          </Card>

          <Card>
            <CardHeader title="સભ્ય મુજબ કાર્ય ભાર" subtitle="પ્રગતિ અને મોડા કાર્યો" icon={Users} />
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">સભ્ય</th><th className="th">કુલ</th><th className="th">પૂર્ણ</th><th className="th">મોડા</th><th className="th">કલાક</th></tr>
              </thead>
              <tbody>
                {(progress?.data?.byAssignee || []).map((a, i) => (
                  <tr key={i} className="row">
                    <td className="td">{a.name || a.employee?.firstName || '—'}</td>
                    <td className="td">{a.total ?? 0}</td>
                    <td className="td">{a.completed ?? 0}</td>
                    <td className="td text-rose-600">{a.overdue ?? 0}</td>
                    <td className="td">{a.hours ?? 0}</td>
                  </tr>
                ))}
                {(progress?.data?.byAssignee || []).length === 0 && <tr><td className="td" colSpan={5}><EmptyState /></td></tr>}
              </tbody>
            </TableWrap>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="બર્નડાઉન" subtitle="મહિના મુજબ પૂર્ણ થયેલા કાર્યો" icon={FolderKanban} />
            <div className="space-y-2 p-4">
              {(progress?.data?.burndown || []).map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-24 text-xs text-slate-500">{b.label || (b.month ? monthName(b.month) : `મહિનો ${i + 1}`)}</span>
                  <Progress value={b.percent ?? ((b.completed || 0) / Math.max(1, b.total || 1)) * 100} showLabel />
                </div>
              ))}
              {(progress?.data?.burndown || []).length === 0 && <EmptyState />}
            </div>
          </Card>
        </div>
      )}

      {tab === 'timesheets' && (
        <Card>
          <CardHeader title="પ્રોજેક્ટ ટાઇમશીટ" subtitle="લોગ થયેલા કલાક" icon={Clock} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">કર્મચારી</th><th className="th">સપ્તાહ</th><th className="th">કુલ કલાક</th><th className="th">બિલેબલ</th><th className="th">સ્થિતિ</th></tr>
            </thead>
            <tbody>
              {(timesheets?.data || []).map((t) => (
                <tr key={t._id} className="row">
                  <td className="td">{t.employee?.firstName} {t.employee?.lastName}</td>
                  <td className="td text-xs">{fmtDate(t.weekStart)} → {fmtDate(t.weekEnd)}</td>
                  <td className="td">{t.totalHours ?? 0}</td>
                  <td className="td">{t.billableHours ?? 0}</td>
                  <td className="td"><Badge value={t.status} /></td>
                </tr>
              ))}
              {(timesheets?.data || []).length === 0 && <tr><td className="td" colSpan={5}><EmptyState title="કોઈ ટાઇમશીટ નથી" /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <Modal
        open={memberOpen} onClose={() => setMemberOpen(false)} size="sm" title="પ્રોજેક્ટ ટીમમાં સભ્ય ઉમેરો"
        footer={<><Button variant="secondary" onClick={() => setMemberOpen(false)}>રદ</Button><Button loading={addMember.isPending} disabled={!member.employee} onClick={() => addMember.mutate(member)}>ઉમેરો</Button></>}
      >
        <div className="space-y-4">
          <Select label="કર્મચારી" required placeholder="પસંદ કરો" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` }))} value={member.employee} onChange={(e) => setMember({ ...member, employee: e.target.value })} />
          <Input label="ભૂમિકા" value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value })} placeholder="Developer / QA / Designer" />
          <Input label="આવંટન (%)" type="number" min={1} max={100} value={member.allocatedPercent} onChange={(e) => setMember({ ...member, allocatedPercent: Number(e.target.value) })} />
        </div>
      </Modal>

      <Modal
        open={taskOpen} onClose={() => setTaskOpen(false)} title="નવું કાર્ય ઉમેરો" subtitle={p.name}
        footer={<><Button variant="secondary" onClick={() => setTaskOpen(false)}>રદ</Button><Button loading={createTask.isPending} disabled={!task.title || task.assignees.length === 0} onClick={() => createTask.mutate({ ...task, dueDate: task.dueDate || undefined })}>ઉમેરો</Button></>}
      >
        <div className="space-y-4">
          <Input label="કાર્યનું શીર્ષક" required value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="પ્રાથમિકતા" options={['low', 'medium', 'high', 'urgent'].map((x) => ({ value: x, label: label(x) }))} value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })} />
            <Input label="ડેડલાઇન" type="date" value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} />
            <Input label="અંદાજિત કલાક" type="number" value={task.estimatedHours} onChange={(e) => setTask({ ...task, estimatedHours: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">સોંપાયેલ વ્યક્તિ (એકથી વધુ) *</label>
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2">
              {(employees?.data || []).map((e) => (
                <label key={e._id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300"
                    checked={task.assignees.includes(e._id)}
                    onChange={(ev) => setTask({ ...task, assignees: ev.target.checked ? [...task.assignees, e._id] : task.assignees.filter((x) => x !== e._id) })}
                  />
                  {e.firstName} {e.lastName}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Info({ l, v }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{v}</p>
    </div>
  );
}
