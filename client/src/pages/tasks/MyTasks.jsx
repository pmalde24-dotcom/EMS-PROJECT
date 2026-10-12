import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ListChecks, Plus, Timer } from 'lucide-react';
import { taskApi, projectApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination, Progress,
  SearchInput, Select, StatCard, TableSkeleton, TableWrap, Tabs, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateInput, label } from '../../lib/utils';

export default function MyTasks() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState('mine');
  const list = useList(['tasks', tab], taskApi.list, { limit: 20 }, { enabled: true });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', project: '', assignees: [], priority: 'medium', dueDate: fmtDateInput(), estimatedHours: 8 });

  const params = tab === 'mine' ? { mine: 'true' } : tab === 'team' ? { team: 'true' } : tab === 'overdue' ? { overdue: 'true' } : { all: 'true' };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tasks', tab, list.params],
    queryFn: () => taskApi.list({ ...params, limit: list.params.limit, page: list.params.page, q: list.params.q, status: list.params.status, priority: list.params.priority }),
  });

  const { data: summary } = useQuery({ queryKey: ['tasks', 'me', 'summary'], queryFn: taskApi.mySummary });
  const { data: projects } = useQuery({ queryKey: ['projects', 'options'], queryFn: () => projectApi.list({ limit: 100 }) });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }), enabled: open });

  const create = useMutation({
    mutationFn: (payload) => taskApi.create(payload),
    onSuccess: () => { toast.success('કાર્ય બન્યું'); qc.invalidateQueries({ queryKey: ['tasks'] }); setOpen(false); setForm({ ...form, title: '', description: '' }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }) => taskApi.changeStatus(id, { status }),
    onSuccess: () => { toast.success('સ્થિતિ બદલાઈ'); qc.invalidateQueries({ queryKey: ['tasks'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = data?.data || [];
  const meta = data?.meta;
  const s = summary?.data || {};

  return (
    <div>
      <PageHeader
        title="મારા કાર્યો"
        subtitle="સોંપાયેલા કાર્યોની યાદી, સ્થિતિ અને ડેડલાઇન"
        actions={(
          <>
            <Link to="/tasks/board" className="btn-secondary">કાનબાન બોર્ડ</Link>
            {can('tasks:create') && <Button icon={Plus} onClick={() => setOpen(true)}>નવું કાર્ય</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ સોંપાયેલ" value={s.total ?? '—'} icon={ListChecks} tone="brand" />
        <StatCard label="પૂર્ણ" value={(s.byStatus || []).find((x) => x._id === 'completed')?.count ?? 0} icon={CheckCircle2} tone="emerald" />
        <StatCard label="મોડા પડેલા" value={s.overdue ?? 0} icon={AlertTriangle} tone="rose" />
        <StatCard label="લોગ થયેલા કલાક" value={`${s.loggedHours ?? 0} કલાક`} icon={Timer} tone="violet" />
      </div>

      <Tabs
        className="mb-4" active={tab} onChange={setTab}
        tabs={[
          { value: 'mine', label: 'મારા કાર્યો' },
          { value: 'team', label: 'ટીમના કાર્યો' },
          { value: 'overdue', label: 'મોડા પડેલા' },
          { value: 'all', label: 'બધા કાર્યો' },
        ]}
      />

      <Card>
        <CardHeader
          title={tab === 'mine' ? 'મારા કાર્યો' : tab === 'team' ? 'ટીમના કાર્યો' : tab === 'overdue' ? 'મોડા પડેલા કાર્યો' : 'બધા કાર્યો'}
          subtitle={meta ? `કુલ ${meta.total} કાર્ય` : ''}
          icon={ListChecks}
          action={(
            <div className="flex flex-wrap gap-2">
              <SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="કાર્ય શોધો…" className="w-full sm:w-56" />
              <Select wrapperClassName="w-36" placeholder="સ્થિતિ" options={['todo', 'in_progress', 'in_review', 'completed', 'blocked'].map((x) => ({ value: x, label: label(x) }))} value={list.params.status || ''} onChange={(e) => list.patch({ status: e.target.value || undefined })} />
              <Select wrapperClassName="w-36" placeholder="પ્રાથમિકતા" options={['low', 'medium', 'high', 'urgent'].map((x) => ({ value: x, label: label(x) }))} value={list.params.priority || ''} onChange={(e) => list.patch({ priority: e.target.value || undefined })} />
            </div>
          )}
        />

        {isLoading ? <TableSkeleton rows={8} cols={6} /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ કાર્ય મળ્યું નથી" message="નવું કાર્ય બનાવો કે ફિલ્ટર બદલો." />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">કાર્ય</th><th className="th">પ્રોજેક્ટ</th><th className="th">ડેડલાઇન</th><th className="th">પ્રગતિ</th>
                  <th className="th">કલાક (લોગ/અંદાજ)</th><th className="th">પ્રાથમિકતા</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t._id} className="row">
                    <td className="td">
                      <Link to={`/tasks/${t._id}`} className="font-medium hover:text-brand-600 dark:text-slate-100">{t.title}</Link>
                      <p className="text-xs text-slate-400">{(t.assignees || []).map((a) => a.firstName).join(', ')}</p>
                    </td>
                    <td className="td text-xs">{t.project?.name || '—'}</td>
                    <td className={`td ${t.isOverdue ? 'text-rose-600' : ''}`}>{fmtDate(t.dueDate)}{t.isOverdue ? ' · મોડું' : ''}</td>
                    <td className="td"><div className="min-w-24"><Progress value={t.progressPercent || 0} showLabel /></div></td>
                    <td className="td text-xs">{t.loggedHours || 0} / {t.estimatedHours || 0}</td>
                    <td className="td"><Badge value={t.priority} /></td>
                    <td className="td"><Badge value={t.status} /></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        {t.status !== 'completed' && can('tasks:update') && (
                          <Button size="xs" variant="success" onClick={() => changeStatus.mutate({ id: t._id, status: 'completed' })}>પૂર્ણ</Button>
                        )}
                        <Link to={`/tasks/${t._id}`} className="btn-ghost btn-xs">જુઓ</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={meta} onPage={list.setPage} />
          </>
        )}
      </Card>

      <Modal
        open={open} onClose={() => setOpen(false)} title="નવું કાર્ય બનાવો"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={create.isPending} disabled={!form.title || form.assignees.length === 0} onClick={() => create.mutate({ ...form, project: form.project || undefined, dueDate: form.dueDate || undefined })}>બનાવો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="શીર્ષક" required wrapperClassName="sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select label="પ્રોજેક્ટ (વૈકલ્પિક)" placeholder="કોઈ નહીં" options={(projects?.data || []).map((p) => ({ value: p._id, label: p.name }))} value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} />
          <Select label="પ્રાથમિકતા" options={['low', 'medium', 'high', 'urgent'].map((x) => ({ value: x, label: label(x) }))} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          <Input label="ડેડલાઇન" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <Input label="અંદાજિત કલાક" type="number" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: Number(e.target.value) })} />
          <div className="sm:col-span-2">
            <label className="label">સોંપાયેલ વ્યક્તિ (એકથી વધુ) *</label>
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2">
              {(employees?.data || []).map((e) => (
                <label key={e._id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300"
                    checked={form.assignees.includes(e._id)}
                    onChange={(ev) => setForm({ ...form, assignees: ev.target.checked ? [...form.assignees, e._id] : form.assignees.filter((x) => x !== e._id) })}
                  />
                  {e.firstName} {e.lastName} ({e.employeeId})
                </label>
              ))}
            </div>
          </div>
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
