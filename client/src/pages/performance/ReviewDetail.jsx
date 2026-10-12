import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Award, CheckCircle2, ClipboardList, History, Send, Star, UserCheck, Users } from 'lucide-react';
import { performanceApi, designationApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Progress, Select, Skeleton, Tabs, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateTime, label } from '../../lib/utils';

const SCALE = [1, 2, 3, 4, 5];

export default function ReviewDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { employeeId, can, role } = useAuth();
  const [tab, setTab] = useState('overview');

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['performance', 'review', id], queryFn: () => performanceApi.review(id), enabled: !!id });
  const { data: designations } = useQuery({ queryKey: ['designations', 'options'], queryFn: () => designationApi.list({ limit: 200 }) });

  const [self, setSelf] = useState({ comments: '', achievements: '', challenges: '', goalsReview: '', overallSelfRating: 3, ratings: [] });
  const [mgr, setMgr] = useState({ comments: '', strengths: '', improvements: '', overallRating: 3, promotionRecommended: false, recommendedDesignation: '', incrementRecommended: 0, ratings: [] });
  const [hr, setHr] = useState({ comments: '', finalRating: 3, calibratedRating: '', hikePercent: 0, release: true });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['performance'] }); };

  const submitSelf = useMutation({
    mutationFn: (payload) => performanceApi.selfAssessment(id, payload),
    onSuccess: () => { toast.success('સ્વ-મૂલ્યાંકન સબમિટ થયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submitMgr = useMutation({
    mutationFn: (payload) => performanceApi.managerAssessment(id, payload),
    onSuccess: () => { toast.success('મેનેજર મૂલ્યાંકન સબમિટ થયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submitHr = useMutation({
    mutationFn: (payload) => performanceApi.hrReview(id, payload),
    onSuccess: () => { toast.success('HR સમીક્ષા સાચવાઈ'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const review = data?.data;
  const competencies = useMemo(() => review?.template?.competencies || [], [review]);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !review) return <Card><ErrorState onRetry={refetch} /></Card>;

  const isSelf = String(review.employee?._id) === String(employeeId);
  const canSelf = isSelf && ['self_pending', 'draft'].includes(review.status) && !review.selfAssessment?.submitted;
  const canManager = !isSelf && (can('performance:update') || can('performance:approve')) && !review.managerAssessment?.submitted && !['completed', 'released'].includes(review.status);
  const canHr = can('performance:approve') && ['hr_pending', 'completed'].includes(review.status);

  return (
    <div>
      <Link to={role === 'employee' ? '/performance/my-reviews' : '/performance/reviews'} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> સમીક્ષા યાદી
      </Link>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{review.employee?.firstName} {review.employee?.lastName}</h1>
            <p className="text-sm text-slate-500">{review.employee?.employeeId} · ચક્ર {review.cycle} ({label(review.cycleType)}) · {fmtDate(review.periodStart)} → {fmtDate(review.periodEnd)}</p>
          </div>
          <Badge value={review.status} size="md" />
        </div>
      </Card>

      <Tabs
        className="mb-4" active={tab} onChange={setTab}
        tabs={[
          { value: 'overview', label: 'સારાંશ' },
          { value: 'self', label: 'સ્વ-મૂલ્યાંકન', count: review.selfAssessment?.ratings?.length || 0 },
          { value: 'manager', label: 'મેનેજર મૂલ્યાંકન' },
          { value: 'hr', label: 'HR સમીક્ષા' },
          { value: 'history', label: 'ઇતિહાસ' },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="મૂલ્યાંકન સારાંશ" icon={Award} />
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <Box l="સ્વ-રેટિંગ" v={review.selfAssessment?.overallSelfRating ? `${review.selfAssessment.overallSelfRating}/5` : '—'} />
              <Box l="મેનેજર રેટિંગ" v={review.managerAssessment?.overallRating ? `${review.managerAssessment.overallRating}/5` : '—'} />
              <Box l="અંતિમ રેટિંગ" v={review.finalRating ? `${review.finalRating}/5` : '—'} />
            </div>
            <div className="space-y-3 px-4 pb-4">
              <Row l="સમીક્ષક" v={review.reviewer ? `${review.reviewer.firstName} ${review.reviewer.lastName}` : '—'} />
              <Row l="HR સમીક્ષક" v={review.hrReviewer ? `${review.hrReviewer.firstName} ${review.hrReviewer.lastName}` : '—'} />
              <Row l="પ્રમોશન ભલામણ" v={review.promotionEligible ? 'હા' : 'ના'} />
              <Row l="સૂચિત વધારો" v={review.hikePercent ? `${review.hikePercent}%` : '—'} />
              <Row l="રિલીઝ તારીખ" v={review.releasedAt ? fmtDateTime(review.releasedAt) : '—'} />
            </div>
            {review.managerAssessment?.strengths && (
              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase text-slate-400">તાકાત</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{review.managerAssessment.strengths}</p>
              </div>
            )}
            {review.managerAssessment?.improvements && (
              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase text-slate-400">સુધારણા ક્ષેત્રો</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{review.managerAssessment.improvements}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="રેટિંગ સ્કેલ" subtitle={`${review.ratingScale?.min ?? 1} – ${review.ratingScale?.max ?? 5}`} icon={Star} />
            <div className="space-y-2 p-4 text-sm text-slate-600 dark:text-slate-300">
              {(review.ratingScale?.labels || []).map((l, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span>{i + 1}</span><span className="text-xs">{l}</span>
                </div>
              ))}
              {!review.ratingScale?.labels?.length && <p className="text-xs text-slate-400">ડિફોલ્ટ 1-5 સ્કેલ</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'self' && (
        <Card>
          <CardHeader
            title="સ્વ-મૂલ્યાંકન" icon={UserCheck}
            subtitle={review.selfAssessment?.submitted ? `સબમિટ: ${fmtDateTime(review.selfAssessment.submittedAt)}` : 'તમારી જાતનું મૂલ્યાંકન ભરો'}
          />
          {review.selfAssessment?.submitted ? (
            <div className="space-y-4 p-4">
              {(review.selfAssessment.ratings || []).map((r, i) => <RatingRow key={i} r={r} />)}
              <Box l="સિદ્ધિઓ" v={review.selfAssessment.achievements || '—'} />
              <Box l="પડકારો" v={review.selfAssessment.challenges || '—'} />
              <Box l="ટિપ્પણી" v={review.selfAssessment.comments || '—'} />
            </div>
          ) : canSelf ? (
            <div className="space-y-4 p-4">
              {(competencies.length ? competencies : [{ name: 'કુલ કામગીરી', weight: 1 }]).map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                  <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{c.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SCALE.map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          const next = [...self.ratings];
                          next[i] = { name: c.name, competency: c.name, rating: v, weight: c.weight || 1 };
                          setSelf({ ...self, ratings: next });
                        }}
                        className={`h-9 w-9 rounded-lg text-sm font-medium transition ${self.ratings[i]?.rating === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
                      >{v}</button>
                    ))}
                  </div>
                </div>
              ))}
              <Textarea label="સિદ્ધિઓ" rows={3} value={self.achievements} onChange={(e) => setSelf({ ...self, achievements: e.target.value })} />
              <Textarea label="પડકારો" rows={3} value={self.challenges} onChange={(e) => setSelf({ ...self, challenges: e.target.value })} />
              <Textarea label="લક્ષ્ય સમીક્ષા" rows={2} value={self.goalsReview} onChange={(e) => setSelf({ ...self, goalsReview: e.target.value })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="કુલ સ્વ-રેટિંગ" options={SCALE.map((v) => ({ value: String(v), label: `${v} / 5` }))} value={String(self.overallSelfRating)} onChange={(e) => setSelf({ ...self, overallSelfRating: Number(e.target.value) })} />
                <Textarea label="ટિપ્પણી" rows={2} value={self.comments} onChange={(e) => setSelf({ ...self, comments: e.target.value })} />
              </div>
              <Button icon={Send} loading={submitSelf.isPending} onClick={() => submitSelf.mutate({ ...self, overallSelfRating: Number(self.overallSelfRating), ratings: self.ratings.filter(Boolean) })}>સ્વ-મૂલ્યાંકન સબમિટ કરો</Button>
            </div>
          ) : (
            <EmptyState title="સ્વ-મૂલ્યાંકન બાકી નથી" message="તમે આ સમીક્ષા માટે સ્વ-મૂલ્યાંકન સબમિટ કરી શકતા નથી." />
          )}
        </Card>
      )}

      {tab === 'manager' && (
        <Card>
          <CardHeader
            title="મેનેજર મૂલ્યાંકન" icon={Users}
            subtitle={review.managerAssessment?.submitted ? `સબમિટ: ${fmtDateTime(review.managerAssessment.submittedAt)}` : 'મેનેજર તરીકે મૂલ્યાંકન ભરો'}
          />
          {review.managerAssessment?.submitted ? (
            <div className="space-y-4 p-4">
              {(review.managerAssessment.ratings || []).map((r, i) => <RatingRow key={i} r={r} />)}
              <Box l="તાકાત" v={review.managerAssessment.strengths || '—'} />
              <Box l="સુધારણા" v={review.managerAssessment.improvements || '—'} />
              <Box l="ટિપ્પણી" v={review.managerAssessment.comments || '—'} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Box l="કુલ રેટિંગ" v={`${review.managerAssessment.overallRating || '—'} / 5`} />
                <Box l="પ્રમોશન ભલામણ" v={review.managerAssessment.promotionRecommended ? 'હા' : 'ના'} />
                <Box l="સૂચિત વધારો" v={review.managerAssessment.incrementRecommended ? `${review.managerAssessment.incrementRecommended}%` : '—'} />
              </div>
            </div>
          ) : canManager ? (
            <div className="space-y-4 p-4">
              {(competencies.length ? competencies : [{ name: 'કુલ કામગીરી', weight: 1 }]).map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                  <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{c.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SCALE.map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          const next = [...mgr.ratings];
                          next[i] = { name: c.name, competency: c.name, rating: v, weight: c.weight || 1 };
                          setMgr({ ...mgr, ratings: next });
                        }}
                        className={`h-9 w-9 rounded-lg text-sm font-medium transition ${mgr.ratings[i]?.rating === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
                      >{v}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                <Textarea label="તાકાત" rows={2} value={mgr.strengths} onChange={(e) => setMgr({ ...mgr, strengths: e.target.value })} />
                <Textarea label="સુધારણા ક્ષેત્રો" rows={2} value={mgr.improvements} onChange={(e) => setMgr({ ...mgr, improvements: e.target.value })} />
              </div>
              <Textarea label="ટિપ્પણી" rows={2} value={mgr.comments} onChange={(e) => setMgr({ ...mgr, comments: e.target.value })} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Select label="કુલ રેટિંગ" options={SCALE.map((v) => ({ value: String(v), label: `${v} / 5` }))} value={String(mgr.overallRating)} onChange={(e) => setMgr({ ...mgr, overallRating: Number(e.target.value) })} />
                <Input label="સૂચિત વધારો (%)" type="number" value={mgr.incrementRecommended} onChange={(e) => setMgr({ ...mgr, incrementRecommended: Number(e.target.value) })} />
                <Select label="સૂચિત હોદ્દો" placeholder="કોઈ નહીં" options={(designations?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={mgr.recommendedDesignation} onChange={(e) => setMgr({ ...mgr, recommendedDesignation: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={mgr.promotionRecommended} onChange={(e) => setMgr({ ...mgr, promotionRecommended: e.target.checked })} />
                પ્રમોશન માટે ભલામણ કરો
              </label>
              <Button icon={Send} loading={submitMgr.isPending} onClick={() => submitMgr.mutate({ ...mgr, overallRating: Number(mgr.overallRating), recommendedDesignation: mgr.recommendedDesignation || null, ratings: mgr.ratings.filter(Boolean) })}>મૂલ્યાંકન સબમિટ કરો</Button>
            </div>
          ) : (
            <EmptyState title="મેનેજર મૂલ્યાંકન બાકી નથી" message={review.managerAssessment?.submitted ? '' : 'આ સમીક્ષા હાલ મેનેજર મૂલ્યાંકન માટે ખુલ્લી નથી.'} />
          )}
        </Card>
      )}

      {tab === 'hr' && (
        <Card>
          <CardHeader
            title="HR સમીક્ષા અને અંતિમ નિર્ણય" icon={CheckCircle2}
            subtitle={review.hrAssessment?.submitted ? `HR સમીક્ષા: ${fmtDateTime(review.hrAssessment.submittedAt)}` : 'અંતિમ રેટિંગ નક્કી કરો અને કર્મચારીને રિલીઝ કરો'}
          />
          {review.hrAssessment?.submitted ? (
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <Box l="અંતિમ રેટિંગ" v={review.finalRating ? `${review.finalRating} / 5` : '—'} />
              <Box l="કેલિબ્રેટેડ રેટિંગ" v={review.hrAssessment.calibratedRating || '—'} />
              <Box l="વધારો" v={review.hikePercent ? `${review.hikePercent}%` : '—'} />
              <div className="sm:col-span-3"><Box l="ટિપ્પણી" v={review.hrAssessment.comments || '—'} /></div>
            </div>
          ) : canHr ? (
            <div className="space-y-4 p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="અંતિમ રેટિંગ (1-5)" type="number" min={1} max={5} value={hr.finalRating} onChange={(e) => setHr({ ...hr, finalRating: Number(e.target.value) })} />
                <Input label="કેલિબ્રેટેડ રેટિંગ" type="number" min={1} max={5} value={hr.calibratedRating} onChange={(e) => setHr({ ...hr, calibratedRating: e.target.value })} />
                <Input label="વધારો (%)" type="number" value={hr.hikePercent} onChange={(e) => setHr({ ...hr, hikePercent: Number(e.target.value) })} />
              </div>
              <Textarea label="HR ટિપ્પણી" rows={3} value={hr.comments} onChange={(e) => setHr({ ...hr, comments: e.target.value })} />
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={hr.release} onChange={(e) => setHr({ ...hr, release: e.target.checked })} />
                કર્મચારીને રિલીઝ કરો (સમીક્ષા જોવા મળશે)
              </label>
              <Button variant="success" icon={Send} loading={submitHr.isPending} onClick={() => submitHr.mutate({ ...hr, finalRating: Number(hr.finalRating), calibratedRating: hr.calibratedRating ? Number(hr.calibratedRating) : undefined, hikePercent: Number(hr.hikePercent) })}>સાચવો અને {hr.release ? 'રિલીઝ કરો' : 'પૂર્ણ કરો'}</Button>
            </div>
          ) : (
            <EmptyState title="HR સમીક્ષા બાકી નથી" message={review.hrAssessment?.submitted ? '' : 'સમીક્ષા હાલ HR સમીક્ષા તબક્કામાં નથી.'} />
          )}
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <CardHeader title="ઓડિટ ઇતિહાસ" icon={History} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(review.auditTrail || []).slice().reverse().map((a, i) => (
              <div key={i} className="px-4 py-2.5">
                <p className="text-sm text-slate-700 dark:text-slate-200">{label(a.action)}{a.note ? ` — ${a.note}` : ''}</p>
                <p className="text-xs text-slate-400">{fmtDateTime(a.at)}</p>
              </div>
            ))}
            {!(review.auditTrail || []).length && <EmptyState />}
          </div>
        </Card>
      )}
    </div>
  );
}

function RatingRow({ r }) {
  const pct = ((r.rating || 0) / 5) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-300">{r.name || r.competency}</span>
        <span className="font-medium">{r.rating} / 5</span>
      </div>
      <Progress className="mt-1" value={pct} />
      {r.comment && <p className="mt-1 text-xs text-slate-500">{r.comment}</p>}
    </div>
  );
}

function Box({ l, v }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm font-medium text-slate-700 dark:text-slate-200">{v}</p>
    </div>
  );
}

function Row({ l, v }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-slate-100 pb-2 text-sm dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{l}</span>
      <span className="font-medium text-slate-700 dark:text-slate-200">{v}</span>
    </div>
  );
}
