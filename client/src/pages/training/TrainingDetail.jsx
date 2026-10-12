import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Award, BookOpen, CalendarDays, Download, MapPin, UserPlus, Users } from 'lucide-react';
import { trainingApi, departmentApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Progress, Select,
  Skeleton, StatCard, TableWrap,
} from '../../components/ui';
import { fmtDate, label } from '../../lib/utils';

export default function TrainingDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [assignOpen, setAssignOpen] = useState(false);
  const [mode, setMode] = useState('all');
  const [department, setDepartment] = useState('');
  const [ids, setIds] = useState([]);
  const [progressFor, setProgressFor] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['training', 'program', id], queryFn: () => trainingApi.program(id), enabled: !!id });
  const { data: departments } = useQuery({ queryKey: ['departments', 'options'], queryFn: () => departmentApi.list({ limit: 100 }), enabled: assignOpen });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }), enabled: assignOpen && mode === 'specific' });

  const assign = useMutation({
    mutationFn: (payload) => trainingApi.assign(id, payload),
    onSuccess: (res) => { toast.success(res.message || 'નોંધણી પૂર્ણ'); qc.invalidateQueries({ queryKey: ['training'] }); setAssignOpen(false); setIds([]); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const update = useMutation({
    mutationFn: ({ aid, payload }) => trainingApi.updateAssignment(aid, payload),
    onSuccess: () => { toast.success('અપડેટ થયું'); qc.invalidateQueries({ queryKey: ['training'] }); setProgressFor(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !data?.data) return <Card><ErrorState onRetry={refetch} /></Card>;

  const p = data.data.program;
  const assignments = data.data.assignments || [];
  const completed = assignments.filter((a) => a.status === 'completed').length;

  return (
    <div>
      <Link to="/training/programs" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> તાલીમ યાદી
      </Link>

      <PageHeader
        title={p.title}
        subtitle={`${p.code} · ${label(p.category)} · ${label(p.type)}`}
        actions={(
          <>
            <Badge value={p.status} />
            {can('training:create') && <Button icon={UserPlus} onClick={() => setAssignOpen(true)}>કર્મચારીઓ નોંધો</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="નોંધાયેલ" value={assignments.length} icon={Users} tone="brand" />
        <StatCard label="પૂર્ણ" value={completed} icon={Award} tone="emerald" />
        <StatCard label="સમયગાળો" value={`${p.durationHours} કલાક`} sub={`${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}`} icon={CalendarDays} tone="violet" />
        <StatCard label="પ્રતિ સહભાગી ખર્ચ" value={`₹${Number(p.costPerParticipant || 0).toLocaleString('en-IN')}`} icon={BookOpen} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="કાર્યક્રમ વિગત" subtitle={p.description || ''} icon={BookOpen} />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <Info l="તાલીમ આપનાર" v={p.trainer?.name || '—'} />
            <Info l="સ્થળ" v={p.venue || '—'} />
            <Info l="મીટિંગ લિંક" v={p.meetingLink ? <a className="text-brand-600 hover:underline" href={p.meetingLink} target="_blank" rel="noreferrer">જોડાઓ</a> : '—'} />
            <Info l="ફરજિયાત" v={p.mandatory ? 'હા' : 'ના'} />
            <Info l="સર્ટિફિકેટ" v={p.certificateProvided ? 'હા' : 'ના'} />
            <Info l="પાસિંગ સ્કોર" v={p.assessmentRequired ? `${p.passingScore}%` : 'મૂલ્યાંકન નથી'} />
          </div>
          {(p.skillsCovered || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              {p.skillsCovered.map((s) => <span key={s} className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{s}</span>)}
            </div>
          )}
          {(p.departments || []).length > 0 && (
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
              લક્ષ્ય ડિપાર્ટમેન્ટ: {p.departments.map((d) => d.name).join(', ')}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="સત્ર સૂચિ" subtitle={`${(p.schedule || []).length} સત્ર`} icon={CalendarDays} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(p.schedule || []).map((s, i) => (
              <div key={i} className="px-4 py-2.5">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.topic || `સત્ર ${i + 1}`}</p>
                <p className="text-xs text-slate-500">{fmtDate(s.date)} {s.startTime ? `· ${s.startTime}–${s.endTime || ''}` : ''} {s.mode ? `· ${label(s.mode)}` : ''}</p>
                {s.venue && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" /> {s.venue}</p>}
              </div>
            ))}
            {(p.schedule || []).length === 0 && <div className="px-4 py-3"><EmptyState title="સત્ર સૂચિ ઉમેરાઈ નથી" /></div>}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="નોંધાયેલા કર્મચારીઓ" subtitle={`${assignments.length} સહભાગી`} icon={Users} />
        {assignments.length === 0 ? <EmptyState title="કોઈ નોંધણી નથી" message="«કર્મચારીઓ નોંધો» દબાવીને સહભાગીઓ ઉમેરો." /> : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">કર્મચારી</th><th className="th">પ્રગતિ</th><th className="th">હાજરી</th><th className="th">સ્કોર</th><th className="th">સ્થિતિ</th><th className="th">સર્ટિફિકેટ</th><th className="th text-right">ક્રિયા</th></tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a._id} className="row">
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <Avatar name={`${a.employee?.firstName || ''} ${a.employee?.lastName || ''}`} size="xs" />
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{a.employee?.firstName} {a.employee?.lastName}</p>
                        <p className="text-xs text-slate-400">{a.employee?.employeeId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="td"><div className="min-w-20"><Progress value={a.progressPercent || 0} showLabel /></div></td>
                  <td className="td text-xs">{a.attendancePercent || 0}%</td>
                  <td className="td text-xs">{a.score ?? '—'}</td>
                  <td className="td"><Badge value={a.status} /></td>
                  <td className="td text-xs">{a.certificate?.issued ? a.certificate.certificateNo : '—'}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      {can('training:update') && (
                        <Button size="xs" variant="secondary" onClick={() => setProgressFor(a)}>અપડેટ</Button>
                      )}
                      {a.certificate?.url && <a className="btn-ghost btn-xs" href={a.certificate.url} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /></a>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={assignOpen} onClose={() => setAssignOpen(false)} title="કર્મચારીઓ નોંધો" subtitle={p.title}
        footer={<><Button variant="secondary" onClick={() => setAssignOpen(false)}>રદ</Button><Button loading={assign.isPending} disabled={(mode === 'specific' && !ids.length) || (mode === 'department' && !department)} onClick={() => assign.mutate(mode === 'all' ? { all: true } : mode === 'department' ? { department } : { employeeIds: ids })}>નોંધણી કરો</Button></>}
      >
        <div className="space-y-4">
          <Select label="કોને નોંધવું?" options={[{ value: 'all', label: 'બધા કર્મચારીઓ' }, { value: 'department', label: 'એક ડિપાર્ટમેન્ટ' }, { value: 'specific', label: 'ચોક્કસ કર્મચારીઓ' }]} value={mode} onChange={(e) => setMode(e.target.value)} />
          {mode === 'department' && <Select label="ડિપાર્ટમેન્ટ" required options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={department} onChange={(e) => setDepartment(e.target.value)} />}
          {mode === 'specific' && (
            <div>
              <label className="label">કર્મચારીઓ *</label>
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2">
                {(employees?.data || []).map((e) => (
                  <label key={e._id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={ids.includes(e._id)}
                      onChange={(ev) => setIds(ev.target.checked ? [...ids, e._id] : ids.filter((x) => x !== e._id))} />
                    {e.firstName} {e.lastName}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!progressFor} onClose={() => setProgressFor(null)} size="sm" title="તાલીમ પ્રગતિ અપડેટ" subtitle={progressFor ? `${progressFor.employee?.firstName} ${progressFor.employee?.lastName}` : ''}
        footer={<><Button variant="secondary" onClick={() => setProgressFor(null)}>રદ</Button><Button loading={update.isPending} onClick={() => update.mutate({ aid: progressFor._id, payload: { progressPercent: Number(progressFor.progressPercent || 0), attendancePercent: Number(progressFor.attendancePercent || 0), score: progressFor.score ? Number(progressFor.score) : undefined, result: progressFor.result, skillsAcquired: progressFor.skillsAcquired } })}>સાચવો</Button></>}
      >
        {progressFor && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="પ્રગતિ (%)" type="number" min={0} max={100} value={progressFor.progressPercent || 0} onChange={(e) => setProgressFor({ ...progressFor, progressPercent: e.target.value })} />
            <Input label="હાજરી (%)" type="number" min={0} max={100} value={progressFor.attendancePercent || 0} onChange={(e) => setProgressFor({ ...progressFor, attendancePercent: e.target.value })} />
            <Input label="સ્કોર" type="number" value={progressFor.score ?? ''} onChange={(e) => setProgressFor({ ...progressFor, score: e.target.value })} />
            <Select label="પરિણામ" placeholder="બાકી" options={[{ value: 'pass', label: 'પાસ' }, { value: 'fail', label: 'ફેલ' }, { value: 'pending', label: 'બાકી' }]} value={progressFor.result || ''} onChange={(e) => setProgressFor({ ...progressFor, result: e.target.value })} />
            <div className="sm:col-span-2"><Info l="કૌશલ્યો" v={(progressFor.skillsAcquired || []).join(', ') || '—'} /></div>
          </div>
        )}
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
