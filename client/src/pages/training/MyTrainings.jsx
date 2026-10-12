import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, BookOpen, CheckCircle2, Clock, Download, GraduationCap, Send } from 'lucide-react';
import { trainingApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, Progress, Select, Skeleton, StatCard, TableWrap, Textarea } from '../../components/ui';
import { fmtDate, label } from '../../lib/utils';

export default function MyTrainings() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [fb, setFb] = useState({ overallRating: 4, contentRating: 4, trainerRating: 4, comments: '', wouldRecommend: true, suggestions: '' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['training', 'assignments', 'mine', status],
    queryFn: () => trainingApi.assignments({ mine: 'true', ...(status ? { status } : {}) }),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }) => trainingApi.updateAssignment(id, payload),
    onSuccess: () => { toast.success('અપડેટ થયું'); qc.invalidateQueries({ queryKey: ['training'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const sendFeedback = useMutation({
    mutationFn: ({ id, payload }) => trainingApi.feedback(id, payload),
    onSuccess: () => { toast.success('પ્રતિસાદ માટે આભાર!'); qc.invalidateQueries({ queryKey: ['training'] }); setFeedbackFor(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = data?.data || [];
  const completed = rows.filter((r) => r.status === 'completed').length;
  const certs = rows.filter((r) => r.certificate?.issued).length;
  const hours = rows.reduce((s, r) => s + (r.program?.durationHours || 0), 0);

  return (
    <div>
      <PageHeader title="મારી તાલીમો" subtitle="નોંધાયેલા તાલીમ કાર્યક્રમો, પ્રગતિ અને સર્ટિફિકેટ" />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ નોંધણી" value={rows.length} icon={GraduationCap} tone="brand" />
        <StatCard label="પૂર્ણ" value={completed} icon={CheckCircle2} tone="emerald" />
        <StatCard label="કુલ તાલીમ કલાક" value={hours} icon={Clock} tone="violet" />
        <StatCard label="સર્ટિફિકેટ" value={certs} icon={Award} tone="amber" />
      </div>

      <Card>
        <CardHeader
          title="તાલીમ યાદી" subtitle={`${rows.length} નોંધણી`} icon={BookOpen}
          action={<Select wrapperClassName="w-40" placeholder="બધી સ્થિતિ" options={['assigned', 'in_progress', 'completed', 'failed', 'no_show', 'cancelled'].map((x) => ({ value: x, label: label(x) }))} value={status} onChange={(e) => setStatus(e.target.value)} />}
        />
        {isLoading ? <Skeleton className="m-4 h-40" /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ તાલીમ નોંધાયેલી નથી" message="તમારા HR/મેનેજર તરફથી તાલીમ સોંપાય ત્યારે અહીં દેખાશે." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">કાર્યક્રમ</th><th className="th">સમય</th><th className="th">ડેડલાઇન</th><th className="th">પ્રગતિ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a._id} className="row">
                  <td className="td">
                    <Link to={`/training/programs/${a.program?._id}`} className="font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100">{a.program?.title}</Link>
                    <p className="text-xs text-slate-400">{label(a.program?.category)} · {a.program?.durationHours} કલાક{a.program?.certificateProvided ? ' · સર્ટિફિકેટ' : ''}</p>
                  </td>
                  <td className="td text-xs">{fmtDate(a.program?.startDate)} → {fmtDate(a.program?.endDate)}</td>
                  <td className="td text-xs">{fmtDate(a.dueDate)}</td>
                  <td className="td"><div className="min-w-24"><Progress value={a.progressPercent || 0} showLabel /></div></td>
                  <td className="td"><Badge value={a.status} />{a.score ? <p className="text-xs text-slate-400">સ્કોર {a.score}</p> : null}</td>
                  <td className="td">
                    <div className="flex flex-wrap justify-end gap-1">
                      {['assigned', 'in_progress'].includes(a.status) && (
                        <>
                          <Button size="xs" variant="secondary" onClick={() => update.mutate({ id: a._id, payload: { progressPercent: Math.min(100, (a.progressPercent || 0) + 25), status: 'in_progress' } })}>+25% પ્રગતિ</Button>
                          <Button size="xs" variant="success" onClick={() => update.mutate({ id: a._id, payload: { result: 'pass', score: a.score || 80, progressPercent: 100, completedAt: new Date().toISOString() } })}>પૂર્ણ કરો</Button>
                        </>
                      )}
                      {a.certificate?.issued && (
                        <a className="btn-ghost btn-xs" href={a.certificate.url} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /> સર્ટિફિકેટ</a>
                      )}
                      {!a.feedback?.submittedAt && ['completed', 'failed'].includes(a.status) && (
                        <Button size="xs" variant="secondary" onClick={() => setFeedbackFor(a)}>પ્રતિસાદ</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={!!feedbackFor} onClose={() => setFeedbackFor(null)} size="sm" title="તાલીમ પ્રતિસાદ" subtitle={feedbackFor?.program?.title}
        footer={<><Button variant="secondary" onClick={() => setFeedbackFor(null)}>રદ</Button><Button icon={Send} loading={sendFeedback.isPending} onClick={() => sendFeedback.mutate({ id: feedbackFor._id, payload: fb })}>સબમિટ કરો</Button></>}
      >
        <div className="space-y-4">
          <Select label="કુલ રેટિંગ" options={[5, 4, 3, 2, 1].map((v) => ({ value: String(v), label: `${v} — ${'★'.repeat(v)}` }))} value={String(fb.overallRating)} onChange={(e) => setFb({ ...fb, overallRating: Number(e.target.value) })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="સામગ્રી" options={[5, 4, 3, 2, 1].map((v) => ({ value: String(v), label: String(v) }))} value={String(fb.contentRating)} onChange={(e) => setFb({ ...fb, contentRating: Number(e.target.value) })} />
            <Select label="તાલીમ આપનાર" options={[5, 4, 3, 2, 1].map((v) => ({ value: String(v), label: String(v) }))} value={String(fb.trainerRating)} onChange={(e) => setFb({ ...fb, trainerRating: Number(e.target.value) })} />
          </div>
          <Textarea label="ટિપ્પણી" rows={2} value={fb.comments} onChange={(e) => setFb({ ...fb, comments: e.target.value })} />
          <Textarea label="સૂચનો" rows={2} value={fb.suggestions} onChange={(e) => setFb({ ...fb, suggestions: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={fb.wouldRecommend} onChange={(e) => setFb({ ...fb, wouldRecommend: e.target.checked })} />
            સહકર્મીઓને ભલામણ કરશો
          </label>
        </div>
      </Modal>
    </div>
  );
}
