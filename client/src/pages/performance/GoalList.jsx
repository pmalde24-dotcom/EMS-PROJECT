import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Plus, Target, Trash2, TrendingUp } from 'lucide-react';
import { performanceApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Progress, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateInput, label } from '../../lib/utils';

export default function GoalList() {
  const qc = useQueryClient();
  const { can, isAdmin, employeeId } = useAuth();
  const [scope, setScope] = useState('all');
  const [filters, setFilters] = useState({ type: '', status: '', period: '' });
  const [open, setOpen] = useState(false);
  const [progressGoal, setProgressGoal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({
    employee: '', title: '', description: '', type: 'individual', category: 'business', period: '', priority: 'medium',
    startDate: fmtDateInput(), dueDate: '', keyResults: [{ title: '', target: 100, current: 0, unit: '%' }],
  });

  const params = { ...(scope === 'mine' ? { mine: 'true' } : scope === 'team' ? { team: 'true' } : {}), ...(filters.type ? { type: filters.type } : {}), ...(filters.status ? { status: filters.status } : {}), ...(filters.period ? { period: filters.period } : {}) };

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['performance', 'goals', params], queryFn: () => performanceApi.goals(params) });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }), enabled: open && isAdmin });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['performance'] });

  const create = useMutation({
    mutationFn: (payload) => performanceApi.createGoal(payload),
    onSuccess: () => { toast.success('લક્ષ્ય બન્યું'); invalidate(); setOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const update = useMutation({
    mutationFn: ({ id, payload }) => performanceApi.updateGoal(id, payload),
    onSuccess: () => { toast.success('લક્ષ્ય અપડેટ થયું'); invalidate(); setProgressGoal(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id) => performanceApi.deleteGoal(id),
    onSuccess: () => { toast.success('લક્ષ્ય દૂર થયું'); invalidate(); setConfirmDel(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = data?.data || [];
  const achieved = rows.filter((g) => g.status === 'achieved').length;
  const avg = rows.length ? Math.round(rows.reduce((s, g) => s + (g.progressPercent || 0), 0) / rows.length) : 0;

  return (
    <div>
      <PageHeader
        title="લક્ષ્યો અને OKR"
        subtitle="લક્ષ્યો સેટ કરો, કી રિઝલ્ટ અપડેટ કરો અને પ્રગતિ ટ્રેક કરો"
        actions={can('performance:create') && <Button icon={Plus} onClick={() => setOpen(true)}>નવું લક્ષ્ય</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ લક્ષ્યો" value={rows.length} icon={Target} tone="brand" />
        <StatCard label="પ્રાપ્ત" value={achieved} icon={CheckCircle2} tone="emerald" />
        <StatCard label="સરેરાશ પ્રગતિ" value={`${avg}%`} icon={TrendingUp} tone="violet" />
        <StatCard label="જોખમમાં" value={rows.filter((g) => ['at_risk', 'off_track'].includes(g.status)).length} icon={Target} tone="rose" />
      </div>

      <Card>
        <CardHeader
          title="લક્ષ્ય યાદી" subtitle={`${rows.length} લક્ષ્ય`} icon={Target}
          action={(
            <div className="flex flex-wrap gap-2">
              <Select wrapperClassName="w-36" options={[{ value: 'all', label: 'બધા' }, { value: 'mine', label: 'મારા' }, { value: 'team', label: 'ટીમના' }]} value={scope} onChange={(e) => setScope(e.target.value)} />
              <Select wrapperClassName="w-36" placeholder="પ્રકાર" options={['okr', 'kpi', 'individual', 'team', 'development'].map((x) => ({ value: x, label: label(x) }))} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} />
              <Select wrapperClassName="w-36" placeholder="સ્થિતિ" options={['not_started', 'in_progress', 'achieved', 'partially_achieved', 'missed', 'cancelled'].map((x) => ({ value: x, label: label(x) }))} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} />
              <Input wrapperClassName="w-36" placeholder="સમયગાળો (FY2026-H1)" value={filters.period} onChange={(e) => setFilters({ ...filters, period: e.target.value })} />
            </div>
          )}
        />
        {isLoading ? <TableSkeleton rows={6} cols={6} /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ લક્ષ્ય નથી" message="નવું લક્ષ્ય બનાવો અથવા ફિલ્ટર બદલો." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">લક્ષ્ય</th><th className="th">કર્મચારી</th><th className="th">કી રિઝલ્ટ</th><th className="th">પ્રગતિ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g._id} className="row">
                  <td className="td">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{g.title}</p>
                    <p className="text-xs text-slate-400">{label(g.type)} · {label(g.category)} · {g.period || '—'}{g.dueDate ? ` · ડેડલાઇન ${fmtDate(g.dueDate)}` : ''}</p>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <Avatar src={g.employee?.profilePhoto} name={`${g.employee?.firstName || ''} ${g.employee?.lastName || ''}`} size="xs" />
                      <span className="text-xs">{g.employee?.firstName} {g.employee?.lastName}</span>
                    </div>
                  </td>
                  <td className="td text-xs">{(g.keyResults || []).length} KR<span className="block text-slate-400">{(g.keyResults || []).map((k) => `${k.current}/${k.target} ${k.unit || ''}`).slice(0, 2).join(', ')}</span></td>
                  <td className="td"><div className="min-w-24"><Progress value={g.progressPercent || 0} showLabel /></div></td>
                  <td className="td"><Badge value={g.status} /></td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      {can('performance:update') && <button className="btn-ghost btn-xs" onClick={() => setProgressGoal(g)}>અપડેટ</button>}
                      {can('performance:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirmDel(g)}><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={open} onClose={() => setOpen(false)} title="નવું લક્ષ્ય" subtitle="કી રિઝલ્ટ ઉમેરો — પ્રગતિ સ્વયં ગણાશે"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={create.isPending} disabled={!form.title} onClick={() => create.mutate({ ...form, employee: form.employee || undefined, dueDate: form.dueDate || undefined, period: form.period || undefined })}>બનાવો</Button></>}
      >
        <div className="space-y-4">
          <Input label="લક્ષ્યનું શીર્ષક" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label="વર્ણન" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            {isAdmin && (
              <Select label="કર્મચારી" placeholder="મારું લક્ષ્ય (ડિફોલ્ટ)" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName}` }))} value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })} />
            )}
            <Select label="પ્રકાર" options={['okr', 'kpi', 'individual', 'team', 'development'].map((x) => ({ value: x, label: label(x) }))} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            <Select label="કેટેગરી" options={['business', 'technical', 'leadership', 'customer', 'process', 'learning', 'other'].map((x) => ({ value: x, label: label(x) }))} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input label="સમયગાળો" placeholder="FY2026-H1" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
            <Input label="ડેડલાઇન" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <Select label="પ્રાથમિકતા" options={['low', 'medium', 'high', 'critical'].map((x) => ({ value: x, label: label(x) }))} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">કી રિઝલ્ટ</label>
              <Button size="xs" variant="secondary" onClick={() => setForm({ ...form, keyResults: [...form.keyResults, { title: '', target: 100, current: 0, unit: '%' }] })}>+ KR ઉમેરો</Button>
            </div>
            <div className="space-y-2">
              {form.keyResults.map((kr, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-12">
                  <Input wrapperClassName="sm:col-span-5" placeholder="KR શીર્ષક" value={kr.title} onChange={(e) => { const kr2 = [...form.keyResults]; kr2[i] = { ...kr, title: e.target.value }; setForm({ ...form, keyResults: kr2 }); }} />
                  <Input wrapperClassName="sm:col-span-3" type="number" placeholder="ટાર્ગેટ" value={kr.target} onChange={(e) => { const kr2 = [...form.keyResults]; kr2[i] = { ...kr, target: Number(e.target.value) }; setForm({ ...form, keyResults: kr2 }); }} />
                  <Input wrapperClassName="sm:col-span-2" placeholder="એકમ" value={kr.unit} onChange={(e) => { const kr2 = [...form.keyResults]; kr2[i] = { ...kr, unit: e.target.value }; setForm({ ...form, keyResults: kr2 }); }} />
                  <button
                    className="btn-ghost btn-xs self-center sm:col-span-2"
                    onClick={() => setForm({ ...form, keyResults: form.keyResults.filter((_, x) => x !== i) })}
                  >દૂર કરો</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!progressGoal} onClose={() => setProgressGoal(null)} size="sm" title="પ્રગતિ અપડેટ કરો" subtitle={progressGoal?.title}
        footer={<><Button variant="secondary" onClick={() => setProgressGoal(null)}>રદ</Button><Button loading={update.isPending} onClick={() => update.mutate({ id: progressGoal._id, payload: { keyResults: progressGoal.keyResults, status: progressGoal.status, managerComments: progressGoal.managerComments } })}>સાચવો</Button></>}
      >
        {progressGoal && (
          <div className="space-y-4">
            {(progressGoal.keyResults || []).map((kr, i) => (
              <div key={i} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{kr.title}</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Input label="વર્તમાન" type="number" value={kr.current} onChange={(e) => {
                    const next = { ...progressGoal, keyResults: progressGoal.keyResults.map((k, x) => (x === i ? { ...k, current: Number(e.target.value) } : k)) };
                    setProgressGoal(next);
                  }} />
                  <Input label="ટાર્ગેટ" type="number" value={kr.target} onChange={(e) => {
                    const next = { ...progressGoal, keyResults: progressGoal.keyResults.map((k, x) => (x === i ? { ...k, target: Number(e.target.value) } : k)) };
                    setProgressGoal(next);
                  }} />
                </div>
                <Select label="KR સ્થિતિ" wrapperClassName="mt-3" options={['not_started', 'on_track', 'at_risk', 'off_track', 'achieved'].map((x) => ({ value: x, label: label(x) }))} value={kr.status || 'not_started'} onChange={(e) => {
                  const next = { ...progressGoal, keyResults: progressGoal.keyResults.map((k, x) => (x === i ? { ...k, status: e.target.value } : k)) };
                  setProgressGoal(next);
                }} />
              </div>
            ))}
            <Select label="લક્ષ્ય સ્થિતિ" options={['not_started', 'in_progress', 'achieved', 'partially_achieved', 'missed', 'cancelled'].map((x) => ({ value: x, label: label(x) }))} value={progressGoal.status} onChange={(e) => setProgressGoal({ ...progressGoal, status: e.target.value })} />
            {can('performance:approve') && <Textarea label="મેનેજર ટિપ્પણી" rows={2} value={progressGoal.managerComments || ''} onChange={(e) => setProgressGoal({ ...progressGoal, managerComments: e.target.value })} />}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={() => remove.mutate(confirmDel._id)} loading={remove.isPending}
        title="લક્ષ્ય દૂર કરવું?" message={confirmDel ? `"${confirmDel.title}" દૂર કરવામાં આવશે.` : ''}
      />
    </div>
  );
}
