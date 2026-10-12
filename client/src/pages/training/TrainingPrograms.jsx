import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, GraduationCap, Plus, TrendingUp, UserPlus, Users } from 'lucide-react';
import { trainingApi, departmentApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination,
  Progress, SearchInput, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateInput, label } from '../../lib/utils';

export default function TrainingPrograms() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['training', 'programs'], trainingApi.programs, { limit: 20, sort: '-createdAt' });
  const [open, setOpen] = useState(false);
  const [assignProgram, setAssignProgram] = useState(null);
  const [assignMode, setAssignMode] = useState('all');
  const [assignDepartment, setAssignDepartment] = useState('');
  const [assignIds, setAssignIds] = useState([]);
  const [form, setForm] = useState({
    title: '', code: '', description: '', category: 'technical', type: 'internal', trainerName: '',
    durationHours: 4, startDate: fmtDateInput(), endDate: '', venue: '', meetingLink: '', maxParticipants: 30,
    costPerParticipant: 0, skillsCovered: '', mandatory: false, certificateProvided: true, assessmentRequired: false, passingScore: 60,
  });

  const { data: summary } = useQuery({ queryKey: ['training', 'summary'], queryFn: trainingApi.report });
  const { data: departments } = useQuery({ queryKey: ['departments', 'options'], queryFn: () => departmentApi.list({ limit: 100 }), enabled: !!assignProgram });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }), enabled: !!assignProgram && assignMode === 'specific' });

  const create = useMutation({
    mutationFn: (payload) => trainingApi.createProgram(payload),
    onSuccess: () => { toast.success('તાલીમ કાર્યક્રમ બન્યો'); qc.invalidateQueries({ queryKey: ['training'] }); setOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const assign = useMutation({
    mutationFn: ({ id, payload }) => trainingApi.assign(id, payload),
    onSuccess: (res) => { toast.success(res.message || 'નોંધણી પૂર્ણ'); qc.invalidateQueries({ queryKey: ['training'] }); setAssignProgram(null); setAssignIds([]); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows || [];
  const totals = summary?.data?.totals || {};

  return (
    <div>
      <PageHeader
        title="તાલીમ કાર્યક્રમો"
        subtitle="કાર્યક્રમ બનાવો, કર્મચારીઓને નોંધો અને પૂર્ણતા ટ્રેક કરો"
        actions={(
          <>
            <a className="btn-secondary" href="/api/training/reports/skill-matrix">સ્કિલ મેટ્રિક્સ</a>
            {can('training:create') && <Button icon={Plus} onClick={() => setOpen(true)}>નવો કાર્યક્રમ</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ કાર્યક્રમ" value={list.meta?.total ?? '—'} icon={GraduationCap} tone="brand" />
        <StatCard label="ચાલુ / નિર્ધારિત" value={(summary?.data?.byStatus || []).filter((x) => ['scheduled', 'ongoing'].includes(x._id)).reduce((a, x) => a + x.count, 0)} icon={BookOpen} tone="violet" />
        <StatCard label="પૂર્ણ નોંધણી" value={(summary?.data?.byStatus || []).find((x) => x._id === 'completed')?.count ?? 0} icon={Users} tone="emerald" />
        <StatCard label="કુલ તાલીમ ખર્ચ" value={totals.totalCost ? `₹${Number(totals.totalCost).toLocaleString('en-IN')}` : '—'} icon={TrendingUp} tone="amber" />
      </div>

      <Card>
        <CardHeader
          title="કાર્યક્રમ યાદી" subtitle={list.meta ? `કુલ ${list.meta.total} કાર્યક્રમ` : ''} icon={GraduationCap}
          action={(
            <div className="flex flex-wrap gap-2">
              <SearchInput value={list.searchInput} onChange={list.setSearchInput} onSubmit={list.submitSearch} placeholder="કાર્યક્રમ શોધો…" className="w-full sm:w-52" />
              <Select wrapperClassName="w-40" placeholder="કેટેગરી" options={['technical', 'soft_skills', 'leadership', 'compliance', 'safety', 'product', 'domain', 'other'].map((x) => ({ value: x, label: label(x) }))} value={list.params.category || ''} onChange={(e) => list.patch({ category: e.target.value || undefined })} />
              <Select wrapperClassName="w-40" placeholder="સ્થિતિ" options={['draft', 'scheduled', 'ongoing', 'completed', 'cancelled'].map((x) => ({ value: x, label: label(x) }))} value={list.params.status || ''} onChange={(e) => list.patch({ status: e.target.value || undefined })} />
              <a className="btn-secondary btn-xs self-center" href="/api/training/programs?export=csv">CSV</a>
            </div>
          )}
        />
        {list.isLoading ? <TableSkeleton rows={8} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ કાર્યક્રમ નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">કાર્યક્રમ</th><th className="th">સમય</th><th className="th">નોંધાયેલ / પૂર્ણ</th><th className="th">ખર્ચ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p._id} className="row">
                    <td className="td">
                      <Link to={`/training/programs/${p._id}`} className="font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100">{p.title}</Link>
                      <p className="text-xs text-slate-400">{p.code} · {label(p.category)} · {label(p.type)}{p.mandatory ? ' · ફરજિયાત' : ''}</p>
                    </td>
                    <td className="td text-xs">{fmtDate(p.startDate)} → {fmtDate(p.endDate)}<span className="block text-slate-400">{p.durationHours} કલાક · {p.venue || p.meetingLink ? (p.venue || 'ઓનલાઇન') : '—'}</span></td>
                    <td className="td">
                      <p className="text-xs">{p.enrolled || 0} નોંધાયેલ / {p.completed || 0} પૂર્ણ</p>
                      <div className="mt-1 min-w-20"><Progress value={p.enrolled ? ((p.completed || 0) / p.enrolled) * 100 : 0} /></div>
                    </td>
                    <td className="td text-xs">₹{Number(p.costPerParticipant || 0).toLocaleString('en-IN')} × {p.enrolled || 0}</td>
                    <td className="td"><Badge value={p.status} /></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        {can('training:create') && <Button size="xs" variant="secondary" icon={UserPlus} onClick={() => { setAssignProgram(p); setAssignMode('all'); }}>નોંધો</Button>}
                        <Link to={`/training/programs/${p._id}`} className="btn-ghost btn-xs">જુઓ</Link>
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
        open={open} onClose={() => setOpen(false)} title="નવો તાલીમ કાર્યક્રમ" size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={create.isPending} disabled={!form.title} onClick={() => create.mutate({ ...form, code: form.code || undefined, endDate: form.endDate || undefined, trainer: { name: form.trainerName, isInternal: true }, skillsCovered: form.skillsCovered.split(',').map((s) => s.trim()).filter(Boolean) })}>બનાવો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="શીર્ષક" required wrapperClassName="sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label="કોડ" placeholder="સ્વયં બનશે" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Select label="કેટેગરી" options={['technical', 'soft_skills', 'leadership', 'compliance', 'safety', 'product', 'domain', 'other'].map((x) => ({ value: x, label: label(x) }))} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Select label="પ્રકાર" options={['internal', 'external', 'online', 'self_paced', 'workshop', 'certification'].map((x) => ({ value: x, label: label(x) }))} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          <Input label="તાલીમ આપનારનું નામ" value={form.trainerName} onChange={(e) => setForm({ ...form, trainerName: e.target.value })} />
          <Input label="શરૂ તારીખ" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Input label="અંતિમ તારીખ" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <Input label="સમયગાળો (કલાક)" type="number" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) })} />
          <Input label="સ્થળ" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          <Input label="મીટિંગ લિંક" value={form.meetingLink} onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} />
          <Input label="મહત્તમ સહભાગી" type="number" value={form.maxParticipants} onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) })} />
          <Input label="પ્રતિ સહભાગી ખર્ચ (₹)" type="number" value={form.costPerParticipant} onChange={(e) => setForm({ ...form, costPerParticipant: Number(e.target.value) })} />
          <Input label="કૌશલ્યો (કોમાથી અલગ)" wrapperClassName="sm:col-span-2" placeholder="React, Node, Communication" value={form.skillsCovered} onChange={(e) => setForm({ ...form, skillsCovered: e.target.value })} />
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <Checkbox label="ફરજિયાત તાલીમ" checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} />
            <Checkbox label="સર્ટિફિકેટ આપવામાં આવશે" checked={form.certificateProvided} onChange={(e) => setForm({ ...form, certificateProvided: e.target.checked })} />
            <Checkbox label="મૂલ્યાંકન જરૂરી" checked={form.assessmentRequired} onChange={(e) => setForm({ ...form, assessmentRequired: e.target.checked })} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!assignProgram} onClose={() => setAssignProgram(null)} title="કર્મચારીઓને નોંધો" subtitle={assignProgram?.title}
        footer={<><Button variant="secondary" onClick={() => setAssignProgram(null)}>રદ</Button><Button loading={assign.isPending} disabled={assignMode === 'specific' && !assignIds.length || assignMode === 'department' && !assignDepartment} onClick={() => assign.mutate({ id: assignProgram._id, payload: assignMode === 'all' ? { all: true } : assignMode === 'department' ? { department: assignDepartment } : { employeeIds: assignIds } })}>નોંધણી કરો</Button></>}
      >
        <div className="space-y-4">
          <Select label="કોને નોંધવું?" options={[{ value: 'all', label: 'બધા કર્મચારીઓ' }, { value: 'department', label: 'એક ડિપાર્ટમેન્ટ' }, { value: 'specific', label: 'ચોક્કસ કર્મચારીઓ' }]} value={assignMode} onChange={(e) => setAssignMode(e.target.value)} />
          {assignMode === 'department' && (
            <Select label="ડિપાર્ટમેન્ટ" required options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={assignDepartment} onChange={(e) => setAssignDepartment(e.target.value)} />
          )}
          {assignMode === 'specific' && (
            <div>
              <label className="label">કર્મચારીઓ *</label>
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2">
                {(employees?.data || []).map((e) => (
                  <label key={e._id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={assignIds.includes(e._id)}
                      onChange={(ev) => setAssignIds(ev.target.checked ? [...assignIds, e._id] : assignIds.filter((x) => x !== e._id))} />
                    {e.firstName} {e.lastName} ({e.employeeId})
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">નોંધાયેલા કર્મચારીઓને નોટિફિકેશન અને ઈમેલ મોકલાશે.</p>
        </div>
      </Modal>
    </div>
  );
}
