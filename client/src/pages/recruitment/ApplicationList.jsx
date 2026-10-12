import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, FileText, Filter, Star, UserPlus } from 'lucide-react';
import { recruitmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, Pagination, SearchInput,
  Select, StatCard, TableSkeleton, TableWrap, Input, Textarea,
} from '../../components/ui';
import { currency, label, relativeTime } from '../../lib/utils';

const STAGES = ['applied', 'screening', 'shortlisted', 'interview_scheduled', 'selected', 'offer_sent', 'hired', 'rejected', 'withdrawn'];

export default function ApplicationList() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['recruitment', 'applications'], recruitmentApi.applications, { limit: 20, job: params.get('job') || undefined, sort: '-appliedAt' });
  const [stageModal, setStageModal] = useState(null);
  const [stageForm, setStageForm] = useState({ stage: '', note: '', rejectionReason: '' });

  const { data: jobs } = useQuery({ queryKey: ['recruitment', 'jobs', 'options'], queryFn: () => recruitmentApi.jobs({ limit: 100 }) });

  const changeStage = useMutation({
    mutationFn: ({ id, payload }) => recruitmentApi.changeStage(id, payload),
    onSuccess: () => { toast.success('તબક્કો અપડેટ થયો'); qc.invalidateQueries({ queryKey: ['recruitment'] }); setStageModal(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows;

  return (
    <div>
      <PageHeader
        title="કેન્ડિડેટ અરજીઓ"
        subtitle="બધા ઉમેદવારો, તેમનો તબક્કો, રેટિંગ અને રિઝ્યુમે"
        actions={<Link to="/recruitment/pipeline" className="btn-secondary">કાનબાન બોર્ડ</Link>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ અરજી" value={list.meta?.total ?? '—'} icon={UserPlus} tone="brand" />
        <StatCard label="ઇન્ટરવ્યુ સ્ટેજ" value={rows.filter((r) => r.stage === 'interview_scheduled').length} icon={Filter} tone="amber" />
        <StatCard label="ઓફર સ્ટેજ" value={rows.filter((r) => ['offer_sent', 'selected'].includes(r.stage)).length} icon={FileText} tone="violet" />
        <StatCard label="નિમણૂક" value={rows.filter((r) => r.stage === 'hired').length} icon={Eye} tone="emerald" />
      </div>

      <Card>
        <CardHeader title="અરજી યાદી" icon={Filter} action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="નામ, ઇમેઇલ, અરજી નં…" className="w-full sm:w-64" />} />
        <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Select wrapperClassName="w-full sm:w-64" placeholder="બધી જોબ" options={(jobs?.data || []).map((j) => ({ value: j._id, label: `${j.title} (${j.jobCode})` }))} value={list.params.job || ''} onChange={(e) => list.patch({ job: e.target.value || undefined })} />
          <Select wrapperClassName="w-full sm:w-52" placeholder="બધા તબક્કા" options={STAGES.map((s) => ({ value: s, label: label(s) }))} value={list.params.stage || ''} onChange={(e) => list.patch({ stage: e.target.value || undefined })} />
          <Select wrapperClassName="w-full sm:w-44" placeholder="બધા સ્રોત" options={['careers_page', 'referral', 'linkedin', 'job_portal', 'agency', 'walk_in', 'campus', 'other'].map((s) => ({ value: s, label: label(s) }))} value={list.params.source || ''} onChange={(e) => list.patch({ source: e.target.value || undefined })} />
        </div>

        {list.isLoading ? <TableSkeleton rows={8} cols={7} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ અરજી મળી નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">ઉમેદવાર</th><th className="th">જોબ</th><th className="th">અનુભવ</th><th className="th">અપેક્ષિત CTC</th>
                  <th className="th">સ્રોત</th><th className="th">તબક્કો</th><th className="th">રેટિંગ</th><th className="th">અરજી</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a._id} className="row">
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${a.candidate?.firstName || ''} ${a.candidate?.lastName || ''}`} size="xs" />
                        <span>
                          <Link to={`/recruitment/applications/${a._id}`} className="block font-medium hover:text-brand-600">{a.candidate?.firstName} {a.candidate?.lastName}</Link>
                          <span className="block text-xs text-slate-400">{a.candidate?.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="td"><p className="max-w-xs truncate">{a.jobOpening?.title || '—'}</p><p className="text-xs text-slate-400">{a.jobOpening?.jobCode}</p></td>
                    <td className="td">{a.candidate?.totalExperience ?? 0} વર્ષ</td>
                    <td className="td">{a.candidate?.expectedCtc ? currency(a.candidate.expectedCtc) : '—'}</td>
                    <td className="td"><Badge value={a.source} label={label(a.source)} /></td>
                    <td className="td"><Badge value={a.stage} /></td>
                    <td className="td">{a.rating ? <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" />{a.rating}</span> : '—'}</td>
                    <td className="td text-xs text-slate-500">{relativeTime(a.appliedAt)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Link to={`/recruitment/applications/${a._id}`} className="btn-ghost btn-xs"><Eye className="h-3.5 w-3.5" /></Link>
                        {can('recruitment:update') && (
                          <button className="btn-ghost btn-xs" onClick={() => { setStageModal(a); setStageForm({ stage: a.stage, note: '', rejectionReason: '' }); }}>તબક્કો</button>
                        )}
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
        open={!!stageModal} onClose={() => setStageModal(null)} size="sm"
        title="તબક્કો બદલો" subtitle={stageModal ? `${stageModal.candidate?.firstName} ${stageModal.candidate?.lastName} · ${stageModal.jobOpening?.title}` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setStageModal(null)}>રદ</Button>
            <Button
              loading={changeStage.isPending}
              disabled={stageForm.stage === stageModal?.stage || (stageForm.stage === 'rejected' && !stageForm.rejectionReason)}
              onClick={() => changeStage.mutate({ id: stageModal._id, payload: stageForm })}
            >બદલો</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Select label="નવો તબક્કો" options={STAGES.map((s) => ({ value: s, label: label(s) }))} value={stageForm.stage} onChange={(e) => setStageForm({ ...stageForm, stage: e.target.value })} />
          <Input label="નોંધ (વૈકલ્પિક)" value={stageForm.note} onChange={(e) => setStageForm({ ...stageForm, note: e.target.value })} />
          {stageForm.stage === 'rejected' && (
            <Textarea label="નકારવાનું કારણ" rows={2} value={stageForm.rejectionReason} onChange={(e) => setStageForm({ ...stageForm, rejectionReason: e.target.value })} />
          )}
        </div>
      </Modal>
    </div>
  );
}
