import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FolderKanban, Pencil, Plus, Trash2, TrendingUp, Users } from 'lucide-react';
import { projectApi, employeeApi, departmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Pagination, Progress, SearchInput, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { currency, fmtDate, label } from '../../lib/utils';

const empty = {
  name: '', code: '', client: '', description: '', department: '', manager: '', startDate: '', endDate: '',
  status: 'planning', priority: 'medium', budget: { amount: '' }, billable: true, tags: '',
};

export default function ProjectList() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['projects'], projectApi.list, { limit: 20 });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [confirm, setConfirm] = useState(null);

  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }) });
  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });

  const save = useMutation({
    mutationFn: (payload) => (editing ? projectApi.update(editing._id, payload) : projectApi.create(payload)),
    onSuccess: () => { toast.success(editing ? 'પ્રોજેક્ટ અપડેટ થયો' : 'નવો પ્રોજેક્ટ બન્યો'); qc.invalidateQueries({ queryKey: ['projects'] }); setOpen(false); setEditing(null); setForm(empty); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id) => projectApi.remove(id),
    onSuccess: () => { toast.success('પ્રોજેક્ટ આર્કાઇવ થયો'); qc.invalidateQueries({ queryKey: ['projects'] }); setConfirm(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name || '', code: p.code || '', client: p.client || '', description: p.description || '',
      department: p.department?._id || p.department || '', manager: p.manager?._id || p.manager || '',
      startDate: p.startDate ? new Date(p.startDate).toISOString().slice(0, 10) : '',
      endDate: p.endDate ? new Date(p.endDate).toISOString().slice(0, 10) : '',
      status: p.status || 'planning', priority: p.priority || 'medium',
      budget: { amount: p.budget?.amount ?? '' }, billable: p.billable !== false, tags: (p.tags || []).join(', '),
    });
    setOpen(true);
  };

  const rows = list.rows;
  const active = rows.filter((p) => p.status === 'active').length;
  const totalBudget = rows.reduce((s, p) => s + (p.budget?.amount || 0), 0);
  const totalTasks = rows.reduce((s, p) => s + (p.taskStats?.total || 0), 0);

  return (
    <div>
      <PageHeader
        title="પ્રોજેક્ટ"
        subtitle="ક્લાયન્ટ પ્રોજેક્ટ, ટીમ, બજેટ અને કાર્ય પ્રગતિ"
        actions={can('projects:create') && <Button icon={Plus} onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}>નવો પ્રોજેક્ટ</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ પ્રોજેક્ટ" value={list.meta?.total ?? '—'} icon={FolderKanban} tone="brand" />
        <StatCard label="સક્રિય" value={active} icon={TrendingUp} tone="emerald" />
        <StatCard label="કુલ કાર્યો (પેજ)" value={totalTasks} icon={Users} tone="violet" />
        <StatCard label="કુલ બજેટ" value={currency(totalBudget)} icon={FolderKanban} tone="amber" />
      </div>

      <Card>
        <CardHeader title="પ્રોજેક્ટ યાદી" icon={FolderKanban} action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="નામ, કોડ, ક્લાયન્ટ…" className="w-full sm:w-64" />} />
        <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Select wrapperClassName="w-full sm:w-44" placeholder="બધી સ્થિતિ" options={['planning', 'active', 'on_hold', 'completed', 'cancelled'].map((s) => ({ value: s, label: label(s) }))} value={list.params.status || ''} onChange={(e) => list.patch({ status: e.target.value || undefined })} />
          <Select wrapperClassName="w-full sm:w-44" placeholder="બધી પ્રાથમિકતા" options={['low', 'medium', 'high', 'urgent'].map((s) => ({ value: s, label: label(s) }))} value={list.params.priority || ''} onChange={(e) => list.patch({ priority: e.target.value || undefined })} />
          <Select wrapperClassName="w-full sm:w-52" placeholder="બધા ડિપાર્ટમેન્ટ" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={list.params.department || ''} onChange={(e) => list.patch({ department: e.target.value || undefined })} />
        </div>

        {list.isLoading ? <TableSkeleton rows={6} cols={7} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ પ્રોજેક્ટ નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">પ્રોજેક્ટ</th><th className="th">ક્લાયન્ટ</th><th className="th">મેનેજર</th><th className="th">સમયગાળો</th>
                  <th className="th">કાર્ય પ્રગતિ</th><th className="th">બજેટ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p._id} className="row">
                    <td className="td">
                      <Link to={`/projects/${p._id}`} className="font-medium hover:text-brand-600 dark:text-slate-100">{p.name}</Link>
                      <p className="text-xs text-slate-400">{p.code} · {label(p.priority)} પ્રાથમિકતા · {(p.team || []).length} સભ્ય</p>
                    </td>
                    <td className="td">{p.client || '—'}</td>
                    <td className="td">
                      {p.manager ? (
                        <div className="flex items-center gap-2">
                          <Avatar src={p.manager.profilePhoto} name={`${p.manager.firstName} ${p.manager.lastName}`} size="xs" />
                          <span className="text-sm">{p.manager.firstName} {p.manager.lastName}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="td text-xs">{fmtDate(p.startDate)}<span className="block text-slate-400">→ {fmtDate(p.endDate)}</span></td>
                    <td className="td">
                      <div className="min-w-32">
                        <Progress value={p.taskStats?.progressPercent || 0} showLabel />
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {p.taskStats?.completed || 0}/{p.taskStats?.total || 0} પૂર્ણ
                          {p.taskStats?.overdue ? ` · ${p.taskStats.overdue} મોડા` : ''}
                        </p>
                      </div>
                    </td>
                    <td className="td">{p.budget?.amount ? currency(p.budget.amount) : '—'}{p.billable ? <span className="block text-[11px] text-emerald-600">બિલેબલ</span> : <span className="block text-[11px] text-slate-400">નોન-બિલેબલ</span>}</td>
                    <td className="td"><Badge value={p.status} label={label(p.status)} /></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Link to={`/projects/${p._id}`} className="btn-ghost btn-xs">જુઓ</Link>
                        {can('projects:update') && <button className="btn-ghost btn-xs" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></button>}
                        {can('projects:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirm(p)}><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={list.meta} onPage={list.setPage} />
          </>
        )}
      </Card>

      <Modal
        open={open} onClose={() => setOpen(false)} size="lg"
        title={editing ? 'પ્રોજેક્ટ સંપાદિત કરો' : 'નવો પ્રોજેક્ટ'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={save.isPending} disabled={!form.name || !form.manager} onClick={() => save.mutate({ ...form, code: form.code || undefined, tags: form.tags ? String(form.tags).split(',').map((t) => t.trim()).filter(Boolean) : [], budget: { amount: Number(form.budget?.amount) || 0 }, startDate: form.startDate || undefined, endDate: form.endDate || undefined, department: form.department || undefined })}>{editing ? 'અપડેટ' : 'બનાવો'}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="પ્રોજેક્ટનું નામ" required wrapperClassName="sm:col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="કોડ" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <Input label="ક્લાયન્ટ" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
          <Select label="ડિપાર્ટમેન્ટ" placeholder="પસંદ કરો" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <Select label="પ્રોજેક્ટ મેનેજર" required placeholder="પસંદ કરો" options={(employees?.data || []).map((m) => ({ value: m._id, label: `${m.firstName} ${m.lastName} (${m.employeeId})` }))} value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
          <Input label="શરૂઆતની તારીખ" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Input label="અંતિમ તારીખ" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <Select label="સ્થિતિ" options={['planning', 'active', 'on_hold', 'completed', 'cancelled'].map((s) => ({ value: s, label: label(s) }))} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <Select label="પ્રાથમિકતા" options={['low', 'medium', 'high', 'urgent'].map((s) => ({ value: s, label: label(s) }))} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          <Input label="બજેટ (₹)" type="number" value={form.budget?.amount} onChange={(e) => setForm({ ...form, budget: { amount: e.target.value } })} />
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              બિલેબલ પ્રોજેક્ટ
            </label>
          </div>
          <Input label="ટેગ્સ (કોમાથી અલગ)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2 lg:col-span-3" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm} title="પ્રોજેક્ટ આર્કાઇવ કરો?"
        message={confirm ? `«${confirm.name}» આર્કાઇવ થશે. તેના કાર્યો અને ટાઇમશીટ રેકોર્ડ સચવાશે.` : ''}
        loading={remove.isPending} onClose={() => setConfirm(null)} onConfirm={() => remove.mutate(confirm._id)}
      />
    </div>
  );
}
