import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GripVertical, ListChecks, Plus } from 'lucide-react';
import { taskApi, projectApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Skeleton, StatCard, Textarea } from '../../components/ui';
import { fmtDate, label } from '../../lib/utils';

const COLUMNS = [
  { key: 'todo', label: 'કરવાનું' },
  { key: 'in_progress', label: 'ચાલુ' },
  { key: 'in_review', label: 'સમીક્ષામાં' },
  { key: 'completed', label: 'પૂર્ણ' },
  { key: 'blocked', label: 'અટકેલું' },
];

export default function TaskBoard() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [projectId, setProjectId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', project: '', assignees: [], priority: 'medium', dueDate: '', estimatedHours: 8, description: '' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tasks', 'board', projectId, assignee],
    queryFn: () => taskApi.board({ project: projectId || undefined, assignees: assignee || undefined }),
  });
  const { data: projects } = useQuery({ queryKey: ['projects', 'options'], queryFn: () => projectApi.list({ limit: 100 }) });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }), enabled: open });

  const move = useMutation({
    mutationFn: ({ id, status }) => taskApi.changeStatus(id, { status }),
    onSuccess: () => { toast.success('સ્થિતિ બદલાઈ'); qc.invalidateQueries({ queryKey: ['tasks'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const create = useMutation({
    mutationFn: (payload) => taskApi.create(payload),
    onSuccess: () => { toast.success('કાર્ય બન્યું'); qc.invalidateQueries({ queryKey: ['tasks'] }); setOpen(false); setForm({ ...form, title: '', description: '' }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const columns = data?.data?.columns || [];
  const total = data?.data?.total || 0;
  const colFor = (key) => columns.find((c) => c.status === key) || { status: key, count: 0, tasks: [] };

  return (
    <div>
      <PageHeader
        title="કાર્ય કાનબાન બોર્ડ"
        subtitle="કાર્ડ ખેંચીને સ્થિતિ બદલો — ફેરફાર તરત સર્વર પર સેવ થાય છે"
        actions={(
          <>
            <Select wrapperClassName="w-52" placeholder="બધા પ્રોજેક્ટ" options={(projects?.data || []).map((p) => ({ value: p._id, label: p.name }))} value={projectId} onChange={(e) => setProjectId(e.target.value)} />
            <Select wrapperClassName="w-52" placeholder="બધા સભ્ય" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName}` }))} value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            {can('tasks:create') && <Button icon={Plus} onClick={() => setOpen(true)}>નવું કાર્ય</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((c) => (
          <StatCard key={c.key} label={c.label} value={colFor(c.key).count} icon={ListChecks} tone={c.key === 'completed' ? 'emerald' : c.key === 'blocked' ? 'rose' : 'brand'} />
        ))}
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}</div>
      ) : isError ? <Card><ErrorState onRetry={refetch} /></Card> : total === 0 ? (
        <Card><EmptyState title="કોઈ કાર્ય નથી" message="ફિલ્ટર બદલો અથવા નવું કાર્ય બનાવો." /></Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setHover(col.key); }}
              onDragLeave={() => setHover(null)}
              onDrop={() => { setHover(null); if (drag && drag.status !== col.key) move.mutate({ id: drag.id, status: col.key }); setDrag(null); }}
              className={`w-72 shrink-0 rounded-xl border p-2 transition ${hover === col.key ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10' : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40'}`}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{col.label}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800">{colFor(col.key).tasks.length}</span>
              </div>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {colFor(col.key).tasks.map((t) => (
                  <div
                    key={t._id}
                    draggable={can('tasks:update')}
                    onDragStart={() => setDrag({ id: t._id, status: col.key })}
                    onDragEnd={() => { setDrag(null); setHover(null); }}
                    className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-card active:cursor-grabbing dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                      <div className="min-w-0 flex-1">
                        <Link to={`/tasks/${t._id}`} className="block text-sm font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100">{t.title}</Link>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{t.project?.name || 'સામાન્ય કાર્ય'}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <Badge value={t.priority} />
                          {t.dueDate && (
                            <span className={`badge ${t.isOverdue ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                              {fmtDate(t.dueDate)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          {(t.assignees || []).slice(0, 3).map((a) => (
                            <Avatar key={a._id} src={a.profilePhoto || a.profileImage} name={`${a.firstName} ${a.lastName}`} size="xs" className="ring-1" />
                          ))}
                          {(t.assignees || []).length > 3 && <span className="text-[11px] text-slate-400">+{t.assignees.length - 3}</span>}
                          {t.loggedHours ? <span className="ml-auto text-[11px] text-slate-400">{t.loggedHours} કલાક</span> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {(columns[col.key] || []).length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">ખાલી</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open} onClose={() => setOpen(false)} title="નવું કાર્ય"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={create.isPending} disabled={!form.title || form.assignees.length === 0} onClick={() => create.mutate({ ...form, project: form.project || undefined, dueDate: form.dueDate || undefined })}>બનાવો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="શીર્ષક" required wrapperClassName="sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select label="પ્રોજેક્ટ" placeholder="કોઈ નહીં" options={(projects?.data || []).map((p) => ({ value: p._id, label: p.name }))} value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} />
          <Select label="પ્રાથમિકતા" options={['low', 'medium', 'high', 'urgent'].map((x) => ({ value: x, label: label(x) }))} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          <Input label="ડેડલાઇન" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <Input label="અંદાજિત કલાક" type="number" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: Number(e.target.value) })} />
          <div className="sm:col-span-2">
            <label className="label">સોંપાયેલ વ્યક્તિ *</label>
            <div className="grid max-h-36 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2">
              {(employees?.data || []).map((e) => (
                <label key={e._id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={form.assignees.includes(e._id)}
                    onChange={(ev) => setForm({ ...form, assignees: ev.target.checked ? [...form.assignees, e._id] : form.assignees.filter((x) => x !== e._id) })} />
                  {e.firstName} {e.lastName}
                </label>
              ))}
            </div>
          </div>
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
