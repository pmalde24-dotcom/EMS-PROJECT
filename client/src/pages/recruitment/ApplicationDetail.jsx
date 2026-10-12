import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, Download, FileText, Mail, Phone, Send, Star, UserCheck, UserPlus } from 'lucide-react';
import { recruitmentApi, employeeApi, departmentApi, designationApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Skeleton,
  TableWrap, Textarea,
} from '../../components/ui';
import { currency, fmtDate, fmtDateTime, label } from '../../lib/utils';

const STAGES = ['applied', 'screening', 'shortlisted', 'interview_scheduled', 'selected', 'offer_sent', 'hired', 'rejected', 'withdrawn'];
const RECOMMENDATIONS = [{ value: 'strong_hire', label: 'ચોક્કસ હા' }, { value: 'hire', label: 'હા' }, { value: 'hold', label: 'અટકાવો' }, { value: 'no_hire', label: 'ના' }];

export default function ApplicationDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const [interview, setInterview] = useState({ name: 'Technical Round', type: 'technical', scheduledAt: '', durationMinutes: 45, mode: 'video', meetingLink: '', interviewers: [] });
  const [feedback, setFeedback] = useState({ overallRating: 4, recommendation: 'hire', strengths: '', concerns: '', comments: '', result: 'pass' });
  const [offer, setOffer] = useState({ ctc: '', joiningDate: '', notes: '', sendEmail: true });
  const [convert, setConvert] = useState({ department: '', designation: '', joiningDate: '', createLogin: true });

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['recruitment', 'application', id], queryFn: () => recruitmentApi.application(id), enabled: !!id });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300 }) });
  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });
  const { data: designations } = useQuery({ queryKey: ['designations', 'all'], queryFn: () => designationApi.list({ limit: 300 }) });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['recruitment'] }); };

  const scheduleInterview = useMutation({
    mutationFn: (payload) => recruitmentApi.scheduleInterview(id, payload),
    onSuccess: () => { toast.success('ઇન્ટરવ્યુ શેડ્યૂલ થયો'); invalidate(); setInterviewOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submitFeedback = useMutation({
    mutationFn: ({ interviewId, payload }) => recruitmentApi.interviewFeedback(id, interviewId, payload),
    onSuccess: () => { toast.success('ફીડબેક સબમિટ થયો'); invalidate(); setFeedbackFor(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const sendOffer = useMutation({
    mutationFn: (payload) => recruitmentApi.sendOffer(id, payload),
    onSuccess: () => { toast.success('ઓફર મોકલાઈ'); invalidate(); setOfferOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const convertCandidate = useMutation({
    mutationFn: (payload) => recruitmentApi.convert(id, payload),
    onSuccess: (res) => { toast.success('ઉમેદવાર કર્મચારીમાં રૂપાંતરિત થયો'); invalidate(); setConvertOpen(false); window.location.href = `/employees/${res.data?.employee?._id || res.data?.employee}`; },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !data?.data) return <Card><ErrorState onRetry={refetch} /></Card>;

  const a = data.data;
  const c = a.candidate || {};

  return (
    <div>
      <Link to="/recruitment/applications" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> અરજી યાદી
      </Link>

      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        subtitle={`${a.applicationNo} · ${a.jobOpening?.title || ''} (${a.jobOpening?.jobCode || ''}) · તબક્કો: ${label(a.stage)}`}
        actions={(
          <>
            {a.resume?.url && <a className="btn-secondary" href={a.resume.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> રિઝ્યુમે</a>}
            {a.offer?.status !== 'not_sent' && <a className="btn-secondary" href={recruitmentApi.offerPdfUrl(a._id)} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> ઓફર લેટર</a>}
            {can('recruitment:update') && <Button icon={CalendarClock} onClick={() => setInterviewOpen(true)}>ઇન્ટરવ્યુ શેડ્યૂલ</Button>}
            {can('recruitment:approve') && a.stage !== 'hired' && a.stage !== 'rejected' && (
              <Button variant="success" icon={Send} onClick={() => { setOffer({ ctc: c.expectedCtc || '', joiningDate: '', notes: '', sendEmail: true }); setOfferOpen(true); }}>ઓફર મોકલો</Button>
            )}
            {can('recruitment:update') && a.stage === 'hired' && <Button variant="success" icon={UserPlus} onClick={() => setConvertOpen(true)}>કર્મચારી બનાવો</Button>}
          </>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="ઉમેદવારની માહિતી" subtitle={`${label(a.source)} દ્વારા અરજી`} icon={UserCheck} action={<Badge value={a.stage} />} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Info label="ઇમેઇલ" value={c.email} icon={Mail} />
            <Info label="ફોન" value={c.phone || '—'} icon={Phone} />
            <Info label="કુલ અનુભવ" value={`${c.totalExperience ?? 0} વર્ષ`} />
            <Info label="વર્તમાન કંપની" value={c.currentCompany || '—'} />
            <Info label="વર્તમાન હોદ્દો" value={c.currentDesignation || '—'} />
            <Info label="વર્તમાન CTC" value={c.currentCtc ? currency(c.currentCtc) : '—'} />
            <Info label="અપેક્ષિત CTC" value={c.expectedCtc ? currency(c.expectedCtc) : '—'} />
            <Info label="નોટિસ પીરિયડ" value={c.noticePeriodDays ? `${c.noticePeriodDays} દિવસ` : '—'} />
            <Info label="લોકેશન" value={c.currentLocation || c.preferredLocation || '—'} />
            <Info label="અરજી તારીખ" value={fmtDate(a.appliedAt)} />
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase text-slate-400">સ્કિલ્સ</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(a.skills || []).length === 0 && <span className="text-xs text-slate-500">—</span>}
                {(a.skills || []).map((s) => <span key={s} className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{s}</span>)}
              </div>
            </div>
            {a.coverLetter && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase text-slate-400">કવર લેટર</p>
                <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{a.coverLetter}</p>
              </div>
            )}
            {(a.experience || []).length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase text-slate-400">કાર્ય અનુભવ</p>
                <div className="mt-1 space-y-2">
                  {a.experience.map((x, i) => (
                    <div key={i} className="rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                      <p className="font-medium text-slate-700 dark:text-slate-200">{x.title} @ {x.company}</p>
                      <p className="text-xs text-slate-500">{fmtDate(x.from)} – {fmtDate(x.to)}</p>
                      {x.description && <p className="mt-1 text-xs text-slate-500">{x.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="તબક્કાનો ઇતિહાસ" subtitle="કોણે, ક્યારે બદલ્યો" icon={CalendarClock} />
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(a.stageHistory || []).slice().reverse().map((h, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <Badge value={h.stage} />
                    <span className="text-[11px] text-slate-400">{fmtDateTime(h.at)}</span>
                  </div>
                  {h.note && <p className="mt-1 text-xs text-slate-500">{h.note}</p>}
                </div>
              ))}
              {(a.stageHistory || []).length === 0 && <EmptyState title="કોઈ ઇતિહાસ નથી" />}
            </div>
          </Card>

          <Card>
            <CardHeader title="ઓફર" subtitle={a.offer?.status ? label(a.offer.status) : 'મોકલાયેલ નથી'} icon={FileText} />
            <div className="space-y-2 p-4 text-sm">
              {a.offer?.status && a.offer.status !== 'not_sent' ? (
                <>
                  <Row l="CTC" v={currency(a.offer.ctc)} />
                  <Row l="જોડાવાની તારીખ" v={fmtDate(a.offer.joiningDate)} />
                  <Row l="મોકલ્યું" v={fmtDate(a.offer.sentAt)} />
                  <Row l="સ્થિતિ" v={<Badge value={a.offer.status} label={label(a.offer.status)} />} />
                  <p className="pt-2 text-[11px] text-slate-500">ઉમેદવાર પોતાના લિંકથી ઓફર સ્વીકારી/નકારી શકે છે.</p>
                </>
              ) : <p className="text-xs text-slate-500">હજી ઓફર મોકલાઈ નથી.</p>}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="ઇન્ટરવ્યુ" subtitle={`${(a.interviews || []).length} રાઉન્ડ`} icon={CalendarClock} />
        {(a.interviews || []).length === 0 ? <EmptyState title="કોઈ ઇન્ટરવ્યુ શેડ્યૂલ નથી" /> : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="th">રાઉન્ડ</th><th className="th">પ્રકાર</th><th className="th">સમય</th><th className="th">મોડ</th>
                <th className="th">ઇન્ટરવ્યુઅર</th><th className="th">સ્થિતિ</th><th className="th">ફીડબેક</th><th className="th text-right">ક્રિયાઓ</th>
              </tr>
            </thead>
            <tbody>
              {a.interviews.map((iv) => (
                <tr key={iv._id} className="row">
                  <td className="td font-medium">{iv.round}. {iv.name || label(iv.type)}</td>
                  <td className="td">{label(iv.type)}</td>
                  <td className="td">{fmtDateTime(iv.scheduledAt)}</td>
                  <td className="td">{label(iv.mode)}{iv.meetingLink ? <a className="ml-1 text-brand-600 hover:underline" href={iv.meetingLink} target="_blank" rel="noreferrer">લિંક</a> : null}</td>
                  <td className="td text-xs">{(iv.interviewers || []).map((p) => `${p.firstName || ''} ${p.lastName || ''}`).join(', ') || '—'}</td>
                  <td className="td"><Badge value={iv.status} /></td>
                  <td className="td text-xs">
                    {(iv.feedback || []).length === 0 ? <span className="text-slate-400">બાકી</span> : iv.feedback.map((f, i) => (
                      <div key={i} className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" />{f.overallRating} · {label(f.recommendation)}</div>
                    ))}
                  </td>
                  <td className="td text-right">
                    {can('recruitment:update') && iv.status === 'scheduled' && (
                      <Button size="xs" onClick={() => { setFeedbackFor(iv); setFeedback({ ...feedback, result: 'pass' }); }}>ફીડબેક</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={interviewOpen} onClose={() => setInterviewOpen(false)}
        title="ઇન્ટરવ્યુ શેડ્યૂલ કરો"
        footer={<><Button variant="secondary" onClick={() => setInterviewOpen(false)}>રદ</Button><Button loading={scheduleInterview.isPending} disabled={!interview.scheduledAt} onClick={() => scheduleInterview.mutate(interview)}>શેડ્યૂલ</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="નામ" value={interview.name} onChange={(e) => setInterview({ ...interview, name: e.target.value })} />
          <Select label="પ્રકાર" options={['screening', 'technical', 'managerial', 'hr', 'assignment', 'culture_fit'].map((t) => ({ value: t, label: label(t) }))} value={interview.type} onChange={(e) => setInterview({ ...interview, type: e.target.value })} />
          <Input label="તારીખ અને સમય" type="datetime-local" required value={interview.scheduledAt} onChange={(e) => setInterview({ ...interview, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          <Input label="સમયગાળો (મિનિટ)" type="number" value={interview.durationMinutes} onChange={(e) => setInterview({ ...interview, durationMinutes: Number(e.target.value) })} />
          <Select label="મોડ" options={[{ value: 'video', label: 'વિડિયો' }, { value: 'in_person', label: 'રૂબરૂ' }, { value: 'phone', label: 'ફોન' }]} value={interview.mode} onChange={(e) => setInterview({ ...interview, mode: e.target.value })} />
          <Input label="મીટિંગ લિંક" value={interview.meetingLink} onChange={(e) => setInterview({ ...interview, meetingLink: e.target.value })} placeholder="https://meet…" />
          <div className="sm:col-span-2">
            <label className="label">ઇન્ટરવ્યુઅર પસંદ કરો (એકથી વધુ)</label>
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2">
              {(employees?.data || []).map((emp) => (
                <label key={emp._id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300"
                    checked={interview.interviewers.includes(emp._id)}
                    onChange={(e) => setInterview({
                      ...interview,
                      interviewers: e.target.checked ? [...interview.interviewers, emp._id] : interview.interviewers.filter((x) => x !== emp._id),
                    })}
                  />
                  {emp.firstName} {emp.lastName} ({emp.employeeId})
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!feedbackFor} onClose={() => setFeedbackFor(null)} size="sm"
        title="ઇન્ટરવ્યુ ફીડબેક" subtitle={feedbackFor ? `રાઉન્ડ ${feedbackFor.round} · ${feedbackFor.name || label(feedbackFor.type)}` : ''}
        footer={<><Button variant="secondary" onClick={() => setFeedbackFor(null)}>રદ</Button><Button loading={submitFeedback.isPending} onClick={() => submitFeedback.mutate({ interviewId: feedbackFor._id, payload: feedback })}>સબમિટ</Button></>}
      >
        <div className="space-y-4">
          <Input label="એકંદર રેટિંગ (1-5)" type="number" min={1} max={5} value={feedback.overallRating} onChange={(e) => setFeedback({ ...feedback, overallRating: Number(e.target.value) })} />
          <Select label="ભલામણ" options={RECOMMENDATIONS} value={feedback.recommendation} onChange={(e) => setFeedback({ ...feedback, recommendation: e.target.value })} />
          <Select label="પરિણામ" options={[{ value: 'pass', label: 'પાસ' }, { value: 'fail', label: 'ફેલ' }, { value: 'on_hold', label: 'હોલ્ડ' }]} value={feedback.result} onChange={(e) => setFeedback({ ...feedback, result: e.target.value })} />
          <Textarea label="તાકાત" rows={2} value={feedback.strengths} onChange={(e) => setFeedback({ ...feedback, strengths: e.target.value })} />
          <Textarea label="ચિંતા" rows={2} value={feedback.concerns} onChange={(e) => setFeedback({ ...feedback, concerns: e.target.value })} />
          <Textarea label="ટિપ્પણી" rows={2} value={feedback.comments} onChange={(e) => setFeedback({ ...feedback, comments: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={offerOpen} onClose={() => setOfferOpen(false)} size="sm"
        title="ઓફર લેટર મોકલો"
        footer={<><Button variant="secondary" onClick={() => setOfferOpen(false)}>રદ</Button><Button loading={sendOffer.isPending} disabled={!offer.ctc || !offer.joiningDate} onClick={() => sendOffer.mutate({ ...offer, ctc: Number(offer.ctc) })}>ઓફર મોકલો</Button></>}
      >
        <div className="space-y-4">
          <Input label="વાર્ષિક CTC (₹)" type="number" required value={offer.ctc} onChange={(e) => setOffer({ ...offer, ctc: e.target.value })} />
          <Input label="જોડાવાની તારીખ" type="date" required value={offer.joiningDate} onChange={(e) => setOffer({ ...offer, joiningDate: e.target.value })} />
          <Textarea label="નોંધ" rows={2} value={offer.notes} onChange={(e) => setOffer({ ...offer, notes: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={offer.sendEmail} onChange={(e) => setOffer({ ...offer, sendEmail: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            ઉમેદવારને ઇમેઇલ પણ મોકલો
          </label>
        </div>
      </Modal>

      <Modal
        open={convertOpen} onClose={() => setConvertOpen(false)}
        title="ઉમેદવારને કર્મચારી બનાવો" subtitle="ઉમેદવારની માહિતી પરથી કર્મચારી રેકોર્ડ બનશે"
        footer={<><Button variant="secondary" onClick={() => setConvertOpen(false)}>રદ</Button><Button loading={convertCandidate.isPending} disabled={!convert.department || !convert.designation} onClick={() => convertCandidate.mutate(convert)}>કર્મચારી બનાવો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="ડિપાર્ટમેન્ટ" required placeholder="પસંદ કરો" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={convert.department} onChange={(e) => setConvert({ ...convert, department: e.target.value })} />
          <Select label="હોદ્દો" required placeholder="પસંદ કરો" options={(designations?.data || []).map((d) => ({ value: d._id, label: d.title }))} value={convert.designation} onChange={(e) => setConvert({ ...convert, designation: e.target.value })} />
          <Input label="જોડાવાની તારીખ" type="date" value={convert.joiningDate || (a.offer?.joiningDate ? new Date(a.offer.joiningDate).toISOString().slice(0, 10) : '')} onChange={(e) => setConvert({ ...convert, joiningDate: e.target.value })} />
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={convert.createLogin} onChange={(e) => setConvert({ ...convert, createLogin: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            લોગિન એકાઉન્ટ બનાવો
          </label>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label: l, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
        <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{value}</p>
      </div>
    </div>
  );
}

function Row({ l, v }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500 dark:text-slate-400">{l}</span>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{v}</span>
    </div>
  );
}
