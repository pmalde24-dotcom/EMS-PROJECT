import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Filter, GripVertical, TrendingUp, Users } from 'lucide-react';
import { recruitmentApi, departmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Badge, Card, CardHeader, ErrorState, PageHeader, Select, Skeleton, StatCard } from '../../components/ui';
import { currency, label, relativeTime } from '../../lib/utils';

const STAGES = ['applied', 'screening', 'shortlisted', 'interview_scheduled', 'selected', 'offer_sent', 'hired', 'rejected'];

export default function Pipeline() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [jobId, setJobId] = useState('');
  const [dragItem, setDragItem] = useState(null);
  const [hoverStage, setHoverStage] = useState(null);

  const { data: jobs } = useQuery({ queryKey: ['recruitment', 'jobs', 'options'], queryFn: () => recruitmentApi.jobs({ limit: 100, status: 'open' }) });
  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });
  const { data: report } = useQuery({ queryKey: ['recruitment', 'report'], queryFn: recruitmentApi.report });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['recruitment', 'pipeline', jobId],
    queryFn: () => recruitmentApi.pipeline({ job: jobId || undefined }),
  });

  const moveStage = useMutation({
    mutationFn: ({ id, stage }) => recruitmentApi.changeStage(id, { stage, note: `Moved to ${stage} from Kanban board` }),
    onSuccess: () => { toast.success('તબક્કો બદલાયો'); qc.invalidateQueries({ queryKey: ['recruitment'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const board = data?.data?.board || {};
  const total = data?.data?.total || 0;
  const funnel = data?.data?.funnel || [];

  const onDrop = (stage) => {
    setHoverStage(null);
    if (!dragItem || dragItem.stage === stage) return;
    moveStage.mutate({ id: dragItem.id, stage });
    setDragItem(null);
  };

  return (
    <div>
      <PageHeader
        title="કેન્ડિડેટ પાઇપલાઇન"
        subtitle="કાનબાન બોર્ડ — કાર્ડ ખેંચીને તબક્કો બદલો (સર્વર પર તરત સેવ થાય છે)"
        actions={(
          <Select
            wrapperClassName="w-64" placeholder="બધી ખુલ્લી જોબ"
            options={(jobs?.data || []).map((j) => ({ value: j._id, label: `${j.title} (${j.jobCode})` }))}
            value={jobId} onChange={(e) => setJobId(e.target.value)}
          />
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ ઉમેદવાર" value={total} icon={Users} tone="brand" />
        <StatCard label="ઇન્ટરવ્યુ સ્ટેજ પર" value={(board.interview_scheduled?.length || 0) + (board.selected?.length || 0)} icon={CalendarClock} tone="amber" />
        <StatCard label="ઓફર મોકલાયેલ" value={board.offer_sent?.length || 0} icon={TrendingUp} tone="violet" />
        <StatCard label="નિમણૂક થયેલ" value={board.hired?.length || 0} icon={Users} tone="emerald" />
      </div>

      {funnel.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="રૂપાંતરણ ફનલ" subtitle="તબક્કાવાર ટકાવારી" icon={Filter} />
          <div className="flex flex-wrap items-end gap-3 p-4">
            {STAGES.filter((s) => !['rejected'].includes(s)).map((s) => {
              const f = funnel.find((x) => x.stage === s) || { count: 0, percent: 0 };
              return (
                <div key={s} className="min-w-24 flex-1">
                  <p className="text-xs text-slate-500">{label(s)}</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{f.count}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, f.percent || 0)}%` }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{f.percent || 0}%</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}</div>
      ) : isError ? <Card><ErrorState onRetry={refetch} /></Card> : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const items = board[stage] || [];
            return (
              <div
                key={stage}
                onDragOver={(e) => { e.preventDefault(); setHoverStage(stage); }}
                onDragLeave={() => setHoverStage(null)}
                onDrop={() => onDrop(stage)}
                className={`w-72 shrink-0 rounded-xl border p-2 transition ${hoverStage === stage ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10' : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40'}`}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label(stage)}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800">{items.length}</span>
                </div>
                <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
                  {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">કોઈ ઉમેદવાર નથી</p>}
                  {items.map((a) => (
                    <div
                      key={a._id}
                      draggable={can('recruitment:update')}
                      onDragStart={() => setDragItem({ id: a._id, stage })}
                      onDragEnd={() => { setDragItem(null); setHoverStage(null); }}
                      className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-card active:cursor-grabbing dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                        <div className="min-w-0 flex-1">
                          <Link to={`/recruitment/applications/${a._id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100">
                            {a.candidate?.firstName} {a.candidate?.lastName}
                          </Link>
                          <p className="truncate text-xs text-slate-500">{a.jobOpening?.title || ''}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <Badge value={a.source} label={label(a.source)} />
                            {a.candidate?.totalExperience ? <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{a.candidate.totalExperience} વર્ષ</span> : null}
                          </div>
                          <p className="mt-1.5 text-[11px] text-slate-400">
                            {a.appliedAt ? relativeTime(a.appliedAt) : ''}
                            {a.candidate?.expectedCtc ? ` · અપેક્ષા ${currency(a.candidate.expectedCtc)}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
