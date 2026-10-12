import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BriefcaseBusiness, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { recruitmentApi, departmentApi, designationApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Pagination, SearchInput, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { fmtDate, label } from '../../lib/utils';

const empty = {
  title: '', department: '', designation: '', description: '', responsibilities: '', requiredSkills: '',
  experienceMin: 0, experienceMax: 5, employmentType: 'full_time', workMode: 'onsite', location: '', openings: 1,
  salaryRange: { min: '', max: '' }, priority: 'medium', status: 'open', applicationDeadline: '', interviewRounds: 3,
  hiringManager: '', recruiter: '',
};

const STATUS_OPTIONS = ['draft', 'open', 'on_hold', 'closed', 'cancelled'].map((s) => ({ value: s, label: s }));
const PRIORITY = ['low', 'medium', 'high', 'urgent'].map((s) => ({ value: s, label: label(s) }));
const WORK_MODES = ['onsite', 'remote', 'hybrid'].map((s) => ({ value: s, label: label(s) }));
const TYPES = ['full_time', 'part_time', 'contract', 'intern', 'consultant'].map((s) => ({ value: s, label: label(s) }));

export default function JobList() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['recruitment', 'jobs'], recruitmentApi.jobs, { limit: 20 });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [confirm, setConfirm] = useState(null);

  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });
  const { data: designations } = useQuery({ queryKey: ['designations', 'all'], queryFn: () => designationApi.list({ limit: 300 }) });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300 }) });
  const { data: report } = useQuery({ queryKey: ['recruitment', 'report'], queryFn: recruitmentApi.report });

  const save = useMutation({
    mutationFn: (payload) => (editing ? recruitmentApi.updateJob(editing._id, payload) : recruitmentApi.createJob(payload)),
    onSuccess: () => { toast.success(editing ? 'જોબ અપડેટ થઈ' : 'નવી જોબ ઓપનિંગ બની'); qc.invalidateQueries({ queryKey: ['recruitment'] }); setOpen(false); setEditing(null); setForm(empty); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id) => recruitmentApi.deleteJob(id),
    onSuccess: () => { toast.success('જોબ બંધ કરાઈ'); qc.invalidateQueries({ queryKey: ['recruitment'] }); setConfirm(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const openEdit = (j) => {
    setEditing(j);
    setForm({
      ...empty, ...j,
      department: j.department?._id || j.department || '', designation: j.designation?._id || j.designation || '',
      hiringManager: j.hiringManager?._id || j.hiringManager || '', recruiter: j.recruiter?._id || j.recruiter || '',
      requiredSkills: (j.requiredSkills || []).join(', '), responsibilities: (j.responsibilities || []).join('\n'),
      applicationDeadline: j.applicationDeadline ? new Date(j.applicationDeadline).toISOString().slice(0, 10) : '',
      salaryRange: { min: j.salaryRange?.min ?? '', max: j.salaryRange?.max ?? '' },
    });
    setOpen(true);
  };

  const rows = list.rows;
  const totalOpenings = rows.reduce((s, j) => s + (j.openings || 0), 0);
  const r = report?.data || {};

  return (
    <div>
      <PageHeader
        title="જોબ ઓપનિંગ્સ"
        subtitle="ખુલ્લી જગ્યાઓ, પ્રાથમિકતા અને ભરતીની સ્થિતિ"
        actions={(
          <>
            <Link to="/recruitment/pipeline" className="btn-secondary">પાઇપલાઇન જુઓ</Link>
            {can('recruitment:create') && <Button icon={Plus} onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}>નવી જોબ</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ જોબ" value={list.meta?.total ?? '—'} icon={BriefcaseBusiness} tone="brand" />
        <StatCard label="ખુલ્લી જગ્યાઓ" value={totalOpenings} icon={Users} tone="emerald" />
        <StatCard label="સરેરાશ ભરતી સમય" value={`${r.avgTimeToHireDays ?? 0} દિવસ`} icon={BriefcaseBusiness} tone="violet" />
        <StatCard label="આ વર્ષે નિમણૂક" value={(r.byStage || []).find((s) => s._id === 'hired')?.count ?? 0} icon={Users} tone="amber" />
      </div>

      <Card>
        <CardHeader title="જોબ યાદી" icon={BriefcaseBusiness} action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="ટાઇટલ કે કોડ શોધો…" className="w-full sm:w-64" />} />
        {list.isLoading ? <TableSkeleton rows={6} cols={7} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ જોબ ઓપનિંગ નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">જોબ</th><th className="th">ડિપાર્ટમેન્ટ</th><th className="th">સ્થળ</th><th className="th">જગ્યા</th>
                  <th className="th">અરજી</th><th className="th">સ્થિતિ</th><th className="th">અંતિમ તારીખ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => (
                  <tr key={j._id} className="row">
                    <td className="td">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{j.title}</p>
                      <p className="text-xs text-slate-400">{j.jobCode} · {label(j.employmentType)} · <Badge value={j.priority} label={label(j.priority)} /></p>
                    </td>
                    <td className="td">{j.department?.name || '—'}</td>
                    <td className="td text-xs">{j.location || '—'}<span className="block text-slate-400">{label(j.workMode)}</span></td>
                    <td className="td">{j.vacanciesFilled || 0}/{j.openings}</td>
                    <td className="td">{j.applicationCount ?? j.applications ?? 0}</td>
                    <td className="td"><Badge value={j.status} label={label(j.status)} /></td>
                    <td className="td">{fmtDate(j.applicationDeadline)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Link to={`/recruitment/applications?job=${j._id}`} className="btn-ghost btn-xs">અરજીઓ</Link>
                        {can('recruitment:update') && <button className="btn-ghost btn-xs" onClick={() => openEdit(j)}><Pencil className="h-3.5 w-3.5" /></button>}
                        {can('recruitment:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirm(j)}><Trash2 className="h-3.5 w-3.5" /></button>}
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
        title={editing ? 'જોબ સંપાદિત કરો' : 'નવી જોબ ઓપનિંગ'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={save.isPending} disabled={!form.title || !form.department} onClick={() => save.mutate({
          ...form,
          requiredSkills: form.requiredSkills ? String(form.requiredSkills).split(',').map((s) => s.trim()).filter(Boolean) : [],
          responsibilities: form.responsibilities ? String(form.responsibilities).split('\n').map((s) => s.trim()).filter(Boolean) : [],
          salaryRange: { min: Number(form.salaryRange?.min || 0), max: Number(form.salaryRange?.max || 0) },
          hiringManager: form.hiringManager || undefined, recruiter: form.recruiter || undefined,
          designation: form.designation || undefined, applicationDeadline: form.applicationDeadline || undefined,
        })}>{editing ? 'અપડેટ' : 'બનાવો'}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="જોબ ટાઇટલ" required wrapperClassName="sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Senior React Developer" />
          <Select label="સ્થિતિ" options={STATUS_OPTIONS} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <Select label="ડિપાર્ટમેન્ટ" required placeholder="પસંદ કરો" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <Select label="હોદ્દો" placeholder="પસંદ કરો" options={(designations?.data || []).map((d) => ({ value: d._id, label: d.title }))} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <Select label="પ્રાથમિકતા" options={PRIORITY} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          <Select label="રોજગાર પ્રકાર" options={TYPES} value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} />
          <Select label="કામનું મોડ" options={WORK_MODES} value={form.workMode} onChange={(e) => setForm({ ...form, workMode: e.target.value })} />
          <Input label="સ્થળ" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ahmedabad" />
          <Input label="ખુલ્લી જગ્યાઓ" type="number" min={1} value={form.openings} onChange={(e) => setForm({ ...form, openings: Number(e.target.value) })} />
          <Input label="અનુભવ ન્યૂનતમ (વર્ષ)" type="number" value={form.experienceMin} onChange={(e) => setForm({ ...form, experienceMin: Number(e.target.value) })} />
          <Input label="અનુભવ મહત્તમ (વર્ષ)" type="number" value={form.experienceMax} onChange={(e) => setForm({ ...form, experienceMax: Number(e.target.value) })} />
          <Input label="પગાર ન્યૂનતમ (₹/વર્ષ)" type="number" value={form.salaryRange?.min} onChange={(e) => setForm({ ...form, salaryRange: { ...form.salaryRange, min: e.target.value } })} />
          <Input label="પગાર મહત્તમ (₹/વર્ષ)" type="number" value={form.salaryRange?.max} onChange={(e) => setForm({ ...form, salaryRange: { ...form.salaryRange, max: e.target.value } })} />
          <Input label="અરજીની અંતિમ તારીખ" type="date" value={form.applicationDeadline} onChange={(e) => setForm({ ...form, applicationDeadline: e.target.value })} />
          <Select label="હાયરિંગ મેનેજર" placeholder="પસંદ કરો" options={(employees?.data || []).map((m) => ({ value: m._id, label: `${m.firstName} ${m.lastName}` }))} value={form.hiringManager} onChange={(e) => setForm({ ...form, hiringManager: e.target.value })} />
          <Select label="રિક્રુટર" placeholder="પસંદ કરો" options={(employees?.data || []).map((m) => ({ value: m._id, label: `${m.firstName} ${m.lastName}` }))} value={form.recruiter} onChange={(e) => setForm({ ...form, recruiter: e.target.value })} />
          <Input label="ઇન્ટરવ્યુ રાઉન્ડ" type="number" min={1} max={6} value={form.interviewRounds} onChange={(e) => setForm({ ...form, interviewRounds: Number(e.target.value) })} />
          <Input label="જરૂરી સ્કિલ્સ (કોમાથી અલગ)" wrapperClassName="sm:col-span-2 lg:col-span-3" value={form.requiredSkills} onChange={(e) => setForm({ ...form, requiredSkills: e.target.value })} placeholder="React, Node.js, MongoDB" />
          <Textarea label="જવાબદારીઓ (દર લાઇને એક)" wrapperClassName="sm:col-span-2 lg:col-span-3" rows={3} value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} />
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2 lg:col-span-3" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm} title="જોબ બંધ કરો?"
        message={confirm ? `«${confirm.title}» (${confirm.jobCode}) બંધ થશે — નવી અરજીઓ સ્વીકારાશે નહીં.` : ''}
        loading={remove.isPending} onClose={() => setConfirm(null)} onConfirm={() => remove.mutate(confirm._id)}
      />
    </div>
  );
}
