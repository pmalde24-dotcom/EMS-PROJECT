import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Briefcase, CalendarCheck, CalendarDays, Camera, CheckCircle2, Download, FileText, GraduationCap, Laptop, Mail, MapPin, Pencil, Phone, Plus, Shield, Target, Trash2, TrendingUp, UserCog, UserX, X } from 'lucide-react';
import { attendanceApi, employeeApi, leaveApi, taskApi, assetApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import EmployeeForm from './EmployeeForm';
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, ErrorState, Input, Modal, Progress, Select, Skeleton, TableWrap, Tabs, Textarea } from '../../components/ui';
import { fmtDate, fmtDateTime, hours, label } from '../../lib/utils';

const DOC_TYPES = [
  { value: 'id_proof', label: 'ઓળખપત્ર' },
  { value: 'address_proof', label: 'સરનામાનો પુરાવો' },
  { value: 'education', label: 'શૈક્ષણિક પ્રમાણપત્ર' },
  { value: 'experience', label: 'અનુભવ પત્ર' },
  { value: 'offer_letter', label: 'ઓફર લેટર' },
  { value: 'contract', label: 'કરાર' },
  { value: 'other', label: 'અન્ય' },
];

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can, user, employeeId } = useAuth();
  const [tab, setTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [docForm, setDocForm] = useState({ title: '', type: 'id_proof', expiryDate: '', file: null });
  const [noteText, setNoteText] = useState('');
  const [photoFile, setPhotoFile] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => employeeApi.get(id),
    enabled: !!id,
  });
  const { data: overview } = useQuery({ queryKey: ['employee', id, 'overview'], queryFn: () => employeeApi.overview(id), enabled: !!id });
  const { data: reportees } = useQuery({ queryKey: ['employee', id, 'reportees'], queryFn: () => employeeApi.reportees(id), enabled: !!id && tab === 'team' });
  const { data: attendance } = useQuery({
    queryKey: ['employee', id, 'attendance'],
    queryFn: () => attendanceApi.list({ employee: id, limit: 20 }),
    enabled: !!id && tab === 'attendance',
  });
  const { data: leaves } = useQuery({
    queryKey: ['employee', id, 'leaves'],
    queryFn: () => leaveApi.list({ employee: id, limit: 20 }),
    enabled: !!id && tab === 'leave',
  });
  const { data: tasks } = useQuery({
    queryKey: ['employee', id, 'tasks'],
    queryFn: () => taskApi.list({ assignee: id, limit: 20 }),
    enabled: !!id && tab === 'tasks',
  });

  const e = data?.data;

  const deactivate = useMutation({
    mutationFn: () => employeeApi.deactivate(id, { reason: 'Deactivated from employee profile' }),
    onSuccess: () => { toast.success('કર્મચારી નિષ્ક્રિય કરાયો'); qc.invalidateQueries({ queryKey: ['employee', id] }); setConfirmDeactivate(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reactivate = useMutation({
    mutationFn: () => employeeApi.reactivate(id, {}),
    onSuccess: () => { toast.success('કર્મચારી ફરી સક્રિય કરાયો'); qc.invalidateQueries({ queryKey: ['employee', id] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const addDocument = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', docForm.file);
      fd.append('title', docForm.title);
      fd.append('type', docForm.type);
      if (docForm.expiryDate) fd.append('expiryDate', docForm.expiryDate);
      return employeeApi.addDocument(id, fd);
    },
    onSuccess: () => { toast.success('દસ્તાવેજ ઉમેરાયો'); qc.invalidateQueries({ queryKey: ['employee', id] }); setDocOpen(false); setDocForm({ title: '', type: 'id_proof', expiryDate: '', file: null }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeDocument = useMutation({
    mutationFn: (docId) => employeeApi.deleteDocument(id, docId),
    onSuccess: () => { toast.success('દસ્તાવેજ દૂર કરાયો'); qc.invalidateQueries({ queryKey: ['employee', id] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const addNote = useMutation({
    mutationFn: () => employeeApi.addNote(id, { text: noteText }),
    onSuccess: () => { toast.success('નોંધ ઉમેરાઈ'); qc.invalidateQueries({ queryKey: ['employee', id] }); setNoteOpen(false); setNoteText(''); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const uploadPhoto = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('photo', photoFile);
      return employeeApi.uploadPhoto(id, fd);
    },
    onSuccess: () => { toast.success('ફોટો અપડેટ થયો'); qc.invalidateQueries({ queryKey: ['employee', id] }); setPhotoOpen(false); setPhotoFile(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const resetPassword = useMutation({
    mutationFn: () => employeeApi.resetPassword(id, { sendEmail: true }),
    onSuccess: (res) => toast.success(res?.message || 'પાસવર્ડ રીસેટ લિંક મોકલાઈ'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError || !e) return <Card><ErrorState onRetry={refetch} /></Card>;

  const isSelf = String(employeeId) === String(e._id);
  const ov = overview?.data;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> પાછા જાઓ
      </button>

      <Card className="mb-4">
        <div className="flex flex-col gap-5 p-5 sm:flex-row">
          <div className="relative">
            <Avatar src={e.profilePhoto} name={`${e.firstName} ${e.lastName}`} size="xl" />
            {(can('employees:update') || isSelf) && (
              <button onClick={() => setPhotoOpen(true)} className="absolute -bottom-1 -right-1 rounded-full bg-brand-600 p-2 text-white shadow transition hover:bg-brand-700">
                <Camera className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl">{e.firstName} {e.lastName}</h1>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {e.designation?.title || '—'} · {e.department?.name || '—'} · <span className="font-medium text-slate-600 dark:text-slate-300">{e.employeeId}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge value={e.employmentStatus} />
                <Badge value={e.employmentType} />
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Mail, label: 'ઇમેઇલ', value: e.email },
                { icon: Phone, label: 'ફોન', value: e.phone || '—' },
                { icon: Briefcase, label: 'જોડાયા', value: fmtDate(e.joiningDate) },
                { icon: MapPin, label: 'કાર્યસ્થળ', value: e.workLocation || '—' },
                { icon: UserCog, label: 'રિપોર્ટિંગ મેનેજર', value: e.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName || ''}` : '—' },
                { icon: TrendingUp, label: 'શિફ્ટ', value: e.shift?.name || '—' },
                { icon: Shield, label: 'લોગિન', value: e.user?.email ? `${e.user.email} (${label(e.user.role)})` : 'લોગિન નથી' },
                { icon: CalendarDays, label: 'પ્રોબેશન સમાપ્તિ', value: fmtDate(e.probationEndDate) },
              ].map((f) => (
                <div key={f.label} className="flex items-start gap-2">
                  <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{f.label}</p>
                    <p className="truncate font-medium text-slate-700 dark:text-slate-200">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:w-44">
            {can('employees:update') && <Button icon={Pencil} onClick={() => setEditOpen(true)}>સંપાદિત કરો</Button>}
            {can('users:update') && e.user && <Button variant="secondary" icon={Shield} onClick={() => resetPassword.mutate()} loading={resetPassword.isPending}>પાસવર્ડ રીસેટ</Button>}
            {can('employees:update') && (e.isActive
              ? <Button variant="danger" icon={UserX} onClick={() => setConfirmDeactivate(true)}>નિષ્ક્રિય કરો</Button>
              : <Button variant="success" icon={CheckCircle2} onClick={() => reactivate.mutate()} loading={reactivate.isPending}>સક્રિય કરો</Button>)}
          </div>
        </div>
      </Card>

      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'ઝલક' },
          { value: 'attendance', label: 'હાજરી' },
          { value: 'leave', label: 'રજા' },
          { value: 'tasks', label: 'કાર્યો' },
          { value: 'documents', label: 'દસ્તાવેજો', count: e.documents?.length },
          { value: 'team', label: 'ટીમ' },
          { value: 'notes', label: 'નોંધ', count: e.notes?.length },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader title="આ મહિનાની હાજરી" subtitle="સ્થિતિ મુજબ સારાંશ" icon={CalendarCheck} />
              <div className="grid gap-3 p-4 sm:grid-cols-4">
                {(ov?.attendanceThisMonth || []).length === 0 && <EmptyState title="આ મહિને કોઈ હાજરી રેકોર્ડ નથી" />}
                {(ov?.attendanceThisMonth || []).map((a) => (
                  <div key={a._id} className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
                    <p className="text-xs text-slate-500">{label(a._id)}</p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white">{a.count}</p>
                    <p className="text-[11px] text-slate-400">{hours(a.minutes)}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="રજા બેલેન્સ" subtitle="ચાલુ વર્ષ" icon={CalendarDays} action={<Link to="/leave/balances" className="btn-ghost btn-xs">મેનેજ કરો</Link>} />
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {(ov?.leaveBalances || []).length === 0 && <EmptyState title="બેલેન્સ ઉપલબ્ધ નથી" />}
                {(ov?.leaveBalances || []).map((b) => (
                  <div key={b._id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{b.leaveType?.name || '—'}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{b.available ?? 0} <span className="text-xs font-normal text-slate-500">ઉપલબ્ધ</span></p>
                    <Progress className="mt-2" value={b.allocated ? (b.used / b.allocated) * 100 : 0} />
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="સોંપાયેલા એસેટ" subtitle="ચાલુ સોંપણી" icon={Laptop} />
              <TableWrap>
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><th className="th">એસેટ ID</th><th className="th">નામ</th><th className="th">શ્રેણી</th><th className="th">સ્થિતિ</th></tr>
                </thead>
                <tbody>
                  {(ov?.assets || []).map((a) => (
                    <tr key={a._id} className="row">
                      <td className="td font-medium">{a.asset?.assetId}</td>
                      <td className="td">{a.asset?.name}</td>
                      <td className="td">{label(a.asset?.category)}</td>
                      <td className="td"><Badge value={a.asset?.status} /></td>
                    </tr>
                  ))}
                  {(ov?.assets || []).length === 0 && <tr><td className="td" colSpan={4}><EmptyState title="કોઈ એસેટ સોંપાયેલ નથી" /></td></tr>}
                </tbody>
              </TableWrap>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="પગાર અને બેંક" subtitle={can('payroll:view') ? '' : 'મર્યાદિત દૃશ્ય'} icon={Target} />
              <div className="space-y-3 p-4 text-sm">
                <Row label="બેંક" value={e.bank?.bankName || '—'} />
                <Row label="ખાતા નંબર" value={e.bank?.accountNumber || e.bank?.masked || '—'} />
                <Row label="IFSC" value={e.bank?.ifsc || '—'} />
                <Row label="પાન" value={e.pan || '—'} />
                <Row label="PF નંબર" value={e.pfNumber || '—'} />
                <Row label="ESIC" value={e.esicNumber || '—'} />
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800/60">
                  બેંક વિગત માત્ર અધિકૃત ભૂમિકાને દેખાય છે અને નંબર હંમેશા માસ્ક કરેલો દર્શાવાય છે.
                </p>
              </div>
            </Card>

            <Card>
              <CardHeader title="શિક્ષણ અને કૌશલ્ય" icon={GraduationCap} />
              <div className="space-y-3 p-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">કૌશલ્ય</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(e.skills || []).length === 0 && <span className="text-xs text-slate-500">—</span>}
                    {(e.skills || []).map((s) => (
                      <span key={s.name} className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{s.name}{s.level ? ` · ${s.level}` : ''}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">લાયકાત</p>
                  {(e.qualifications || []).length === 0 && <span className="text-xs text-slate-500">—</span>}
                  {(e.qualifications || []).map((q, i) => (
                    <p key={i} className="text-sm text-slate-700 dark:text-slate-200">{q.degree} {q.specialization ? `— ${q.specialization}` : ''} <span className="text-xs text-slate-500">{q.institution} {q.year}</span></p>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">અગાઉનો અનુભવ</p>
                  {(e.experience || []).length === 0 && <span className="text-xs text-slate-500">—</span>}
                  {(e.experience || []).map((x, i) => (
                    <p key={i} className="text-sm text-slate-700 dark:text-slate-200">{x.title} @ {x.company} <span className="text-xs text-slate-500">{fmtDate(x.from)} – {x.current ? 'ચાલુ' : fmtDate(x.to)}</span></p>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="ઇમરજન્સી સંપર્ક" icon={Phone} />
              <div className="space-y-2 p-4 text-sm">
                <Row label="નામ" value={e.emergencyContact?.name || '—'} />
                <Row label="સંબંધ" value={e.emergencyContact?.relationship || '—'} />
                <Row label="ફોન" value={e.emergencyContact?.phone || '—'} />
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'attendance' && (
        <Card>
          <CardHeader title="તાજેતરની હાજરી" subtitle="છેલ્લા 20 રેકોર્ડ" icon={CalendarCheck} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">તારીખ</th><th className="th">ઇન</th><th className="th">આઉટ</th><th className="th">કામ</th><th className="th">ઓવરટાઇમ</th><th className="th">સ્થિતિ</th></tr>
            </thead>
            <tbody>
              {(attendance?.data || []).map((a) => (
                <tr key={a._id} className="row">
                  <td className="td">{fmtDate(a.date)}</td>
                  <td className="td">{a.checkIn ? fmtDateTime(a.checkIn).split(', ')[1] : '—'}</td>
                  <td className="td">{a.checkOut ? fmtDateTime(a.checkOut).split(', ')[1] : '—'}</td>
                  <td className="td">{hours(a.workedMinutes)}</td>
                  <td className="td">{a.overtimeMinutes ? hours(a.overtimeMinutes) : '—'}</td>
                  <td className="td"><Badge value={a.status} /></td>
                </tr>
              ))}
              {(attendance?.data || []).length === 0 && <tr><td className="td" colSpan={6}><EmptyState /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'leave' && (
        <Card>
          <CardHeader title="રજા વિનંતીઓ" subtitle="તાજેતરની અરજીઓ" icon={CalendarDays} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">પ્રકાર</th><th className="th">થી</th><th className="th">સુધી</th><th className="th">દિવસ</th><th className="th">સ્થિતિ</th></tr>
            </thead>
            <tbody>
              {(leaves?.data || []).map((l) => (
                <tr key={l._id} className="row">
                  <td className="td font-medium">{l.leaveType?.name}</td>
                  <td className="td">{fmtDate(l.startDate)}</td>
                  <td className="td">{fmtDate(l.endDate)}</td>
                  <td className="td">{l.totalDays}</td>
                  <td className="td"><Badge value={l.status} /></td>
                </tr>
              ))}
              {(leaves?.data || []).length === 0 && <tr><td className="td" colSpan={5}><EmptyState /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'tasks' && (
        <Card>
          <CardHeader title="સોંપાયેલા કાર્યો" icon={Target} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">કાર્ય</th><th className="th">પ્રોજેક્ટ</th><th className="th">ડેડલાઇન</th><th className="th">પ્રાથમિકતા</th><th className="th">સ્થિતિ</th></tr>
            </thead>
            <tbody>
              {(tasks?.data || []).map((t) => (
                <tr key={t._id} className="row">
                  <td className="td"><Link to={`/tasks/${t._id}`} className="font-medium hover:text-brand-600">{t.title}</Link></td>
                  <td className="td">{t.project?.name || '—'}</td>
                  <td className="td">{fmtDate(t.dueDate)}</td>
                  <td className="td"><Badge value={t.priority} /></td>
                  <td className="td"><Badge value={t.status} /></td>
                </tr>
              ))}
              {(tasks?.data || []).length === 0 && <tr><td className="td" colSpan={5}><EmptyState /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader
            title="દસ્તાવેજો" subtitle="ખાનગી ફાઇલો — માત્ર અધિકૃત વપરાશકર્તા ડાઉનલોડ કરી શકે"
            icon={FileText}
            action={can('documents:create') && <Button size="xs" icon={Plus} onClick={() => setDocOpen(true)}>દસ્તાવેજ ઉમેરો</Button>}
          />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">શીર્ષક</th><th className="th">પ્રકાર</th><th className="th">અપલોડ</th><th className="th">સમાપ્તિ</th><th className="th">સ્થિતિ</th><th className="th"></th></tr>
            </thead>
            <tbody>
              {(e.documents || []).map((d) => (
                <tr key={d._id} className="row">
                  <td className="td font-medium">{d.title}</td>
                  <td className="td">{label(d.type)}</td>
                  <td className="td">{fmtDate(d.uploadedAt || d.createdAt)}</td>
                  <td className="td">{fmtDate(d.expiryDate)}</td>
                  <td className="td"><Badge value={d.verified ? 'approved' : 'pending'} label={d.verified ? 'ચકાસાયેલ' : 'બાકી'} /></td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <a href={`/api/employees/${id}/documents/${d._id}/download`} className="btn-ghost btn-xs" target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /></a>
                      {can('documents:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => removeDocument.mutate(d._id)}><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {(e.documents || []).length === 0 && <tr><td className="td" colSpan={6}><EmptyState title="કોઈ દસ્તાવેજ નથી" /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'team' && (
        <Card>
          <CardHeader title="રિપોર્ટી ટીમ" subtitle={reportees?.data ? `સીધા ${reportees.data.direct?.length || 0} · કુલ ${reportees.data.totalReporting || 0}` : ''} icon={UserCog} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">કર્મચારી</th><th className="th">હોદ્દો</th><th className="th">સ્થિતિ</th><th className="th"></th></tr>
            </thead>
            <tbody>
              {(reportees?.data?.direct || []).map((m) => (
                <tr key={m._id} className="row">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={m.profilePhoto} name={`${m.firstName} ${m.lastName}`} size="xs" />
                      <span><span className="block font-medium">{m.firstName} {m.lastName}</span><span className="block text-xs text-slate-400">{m.employeeId}</span></span>
                    </div>
                  </td>
                  <td className="td">{m.designation?.title || '—'}</td>
                  <td className="td"><Badge value={m.employmentStatus} /></td>
                  <td className="td text-right"><Link to={`/employees/${m._id}`} className="btn-ghost btn-xs">જુઓ</Link></td>
                </tr>
              ))}
              {(reportees?.data?.direct || []).length === 0 && <tr><td className="td" colSpan={4}><EmptyState title="કોઈ સીધો રિપોર્ટી નથી" /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'notes' && (
        <Card>
          <CardHeader
            title="આંતરિક નોંધ" subtitle="HR ટીમ માટે ખાનગી" icon={FileText}
            action={can('employees:update') && <Button size="xs" icon={Plus} onClick={() => setNoteOpen(true)}>નોંધ ઉમેરો</Button>}
          />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(e.notes || []).length === 0 && <EmptyState title="કોઈ નોંધ નથી" />}
            {(e.notes || []).map((n, i) => (
              <div key={n._id || i} className="px-4 py-3">
                <p className="text-sm text-slate-700 dark:text-slate-200">{n.text}</p>
                <p className="mt-1 text-xs text-slate-400">{n.createdBy?.name || 'HR'} · {fmtDateTime(n.createdAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <EmployeeForm open={editOpen} onClose={() => setEditOpen(false)} employee={e} canCreateLogin={false} />

      <Modal
        open={docOpen} onClose={() => setDocOpen(false)} title="દસ્તાવેજ ઉમેરો" subtitle="PDF, JPG અથવા PNG · મહત્તમ 10 MB"
        footer={<><Button variant="secondary" onClick={() => setDocOpen(false)}>રદ</Button><Button loading={addDocument.isPending} disabled={!docForm.file || !docForm.title} onClick={() => addDocument.mutate()}>અપલોડ કરો</Button></>}
      >
        <div className="space-y-4">
          <Input label="શીર્ષક" required value={docForm.title} onChange={(ev) => setDocForm({ ...docForm, title: ev.target.value })} />
          <Select label="પ્રકાર" options={DOC_TYPES} value={docForm.type} onChange={(ev) => setDocForm({ ...docForm, type: ev.target.value })} />
          <Input label="સમાપ્તિ તારીખ (વૈકલ્પિક)" type="date" value={docForm.expiryDate} onChange={(ev) => setDocForm({ ...docForm, expiryDate: ev.target.value })} />
          <input
            type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) return toast.error('ફાઇલ 10 MB થી મોટી છે');
              if (!/\.(pdf|jpe?g|png|docx?)$/i.test(file.name)) return toast.error('આ ફાઇલ પ્રકાર માન્ય નથી');
              setDocForm({ ...docForm, file });
            }}
            className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700 dark:file:bg-brand-500/10 dark:file:text-brand-300"
          />
        </div>
      </Modal>

      <Modal
        open={photoOpen} onClose={() => setPhotoOpen(false)} title="પ્રોફાઇલ ફોટો" size="sm"
        footer={<><Button variant="secondary" onClick={() => setPhotoOpen(false)}>રદ</Button><Button loading={uploadPhoto.isPending} disabled={!photoFile} onClick={() => uploadPhoto.mutate()}>અપલોડ</Button></>}
      >
        <input
          type="file" accept="image/jpeg,image/png,image/webp"
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) return toast.error('ફોટો 2 MB થી મોટો છે');
            setPhotoFile(file);
          }}
          className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700 dark:file:bg-brand-500/10 dark:file:text-brand-300"
        />
      </Modal>

      <Modal
        open={noteOpen} onClose={() => setNoteOpen(false)} title="આંતરિક નોંધ ઉમેરો" size="sm"
        footer={<><Button variant="secondary" onClick={() => setNoteOpen(false)}>રદ</Button><Button loading={addNote.isPending} disabled={!noteText.trim()} onClick={() => addNote.mutate()}>ઉમેરો</Button></>}
      >
        <Textarea rows={4} value={noteText} onChange={(ev) => setNoteText(ev.target.value)} placeholder="નોંધ લખો…" />
      </Modal>

      <ConfirmDialog
        open={confirmDeactivate}
        title="કર્મચારી નિષ્ક્રિય કરો?"
        message="એકાઉન્ટ નિષ્ક્રિય થશે અને લોગિન બ્લોક થશે. રેકોર્ડ સચવાય રહેશે."
        confirmLabel="નિષ્ક્રિય કરો"
        loading={deactivate.isPending}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() => deactivate.mutate()}
      />
    </div>
  );
}

function Row({ label: l, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500 dark:text-slate-400">{l}</span>
      <span className="truncate font-medium text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

void assetApi; void Checkbox; void X;
