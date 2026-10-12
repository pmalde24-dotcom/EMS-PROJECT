import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Eye, Timer, XCircle } from 'lucide-react';
import { timesheetApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, Skeleton, StatCard,
  TableWrap, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../lib/utils';

export default function TimesheetApprovals() {
  const qc = useQueryClient();
  const [detail, setDetail] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['timesheets', 'pending'], queryFn: timesheetApi.pending });

  const decide = useMutation({
    mutationFn: ({ id, payload }) => timesheetApi.decide(id, payload),
    onSuccess: (res) => { toast.success(res.message || 'નિર્ણય નોંધાયો'); qc.invalidateQueries({ queryKey: ['timesheets'] }); setRejectFor(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const [comment, setComment] = useState('');

  const rows = data?.data || [];
  const totalHours = rows.reduce((s, r) => s + (r.totalHours || 0), 0);

  return (
    <div>
      <PageHeader
        title="ટાઇમશીટ મંજૂરી"
        subtitle="ટીમના સબમિટ કરેલા સાપ્તાહિક કલાક ચકાસો અને મંજૂર/નકાર કરો"
        actions={<a className="btn-secondary" href={`/api/timesheets/reports/summary?year=${new Date().getFullYear()}&export=csv`}>રિપોર્ટ CSV</a>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="મંજૂરી બાકી" value={rows.length} icon={Clock} tone="amber" />
        <StatCard label="કુલ કલાક" value={totalHours} icon={Timer} tone="brand" />
        <StatCard label="કર્મચારીઓ" value={new Set(rows.map((r) => r.employee?._id)).size} icon={CheckCircle2} tone="emerald" />
      </div>

      <Card>
        <CardHeader title="મંજૂરી બાકી ટાઇમશીટ" subtitle={`${rows.length} ટાઇમશીટ`} icon={Clock} />
        {isLoading ? <Skeleton className="m-4 h-40" /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="મંજૂરી બાકી નથી" message="બધી ટાઇમશીટ પર કાર્યવાહી થઈ ગઈ છે." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">કર્મચારી</th><th className="th">સપ્તાહ</th><th className="th">કુલ કલાક</th><th className="th">બિલેબલ</th><th className="th">સબમિટ</th><th className="th text-right">ક્રિયા</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t._id} className="row">
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <Avatar name={`${t.employee?.firstName || ''} ${t.employee?.lastName || ''}`} size="xs" />
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.employee?.firstName} {t.employee?.lastName}</p>
                        <p className="text-xs text-slate-400">{t.employee?.employeeId} · {t.employee?.department?.name || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="td text-xs">{fmtDate(t.weekStart)} → {fmtDate(t.weekEnd)}</td>
                  <td className="td font-medium">{t.totalHours ?? 0}</td>
                  <td className="td text-xs">{t.billableHours ?? 0}</td>
                  <td className="td text-xs">{fmtDateTime(t.submittedAt)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Button size="xs" variant="ghost" icon={Eye} onClick={() => setDetail(t)}>જુઓ</Button>
                      <Button size="xs" variant="success" icon={CheckCircle2} loading={decide.isPending} onClick={() => decide.mutate({ id: t._id, payload: { decision: 'approved' } })}>મંજૂર</Button>
                      <Button size="xs" variant="danger" icon={XCircle} onClick={() => { setRejectFor(t); setComment(''); }}>નકાર</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title="ટાઇમશીટ વિગત" subtitle={detail ? `${detail.employee?.firstName} ${detail.employee?.lastName} · ${fmtDate(detail.weekStart)} → ${fmtDate(detail.weekEnd)}` : ''}>
        {detail && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge value={detail.status} />
              <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">કુલ {detail.totalHours || 0} કલાક</span>
              <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">બિલેબલ {detail.billableHours || 0}</span>
              <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">ઓવરટાઇમ {detail.overtimeHours || 0}</span>
            </div>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">તારીખ</th><th className="th">પ્રોજેક્ટ / કાર્ય</th><th className="th">કલાક</th><th className="th">વર્ણન</th><th className="th">બિલેબલ</th></tr>
              </thead>
              <tbody>
                {(detail.entries || []).map((e) => (
                  <tr key={e._id} className="row">
                    <td className="td text-xs">{fmtDate(e.date)}</td>
                    <td className="td text-xs">{e.project?.name || '—'}<span className="block text-slate-400">{e.task?.title || ''}</span></td>
                    <td className="td">{e.hours}</td>
                    <td className="td max-w-xs whitespace-normal text-xs">{e.description}</td>
                    <td className="td text-xs">{e.billable ? 'હા' : 'ના'}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </>
        )}
      </Modal>

      <Modal
        open={!!rejectFor} onClose={() => setRejectFor(null)} size="sm" title="ટાઇમશીટ નકારવી"
        footer={<><Button variant="secondary" onClick={() => setRejectFor(null)}>રદ</Button><Button variant="danger" loading={decide.isPending} disabled={!comment} onClick={() => decide.mutate({ id: rejectFor._id, payload: { decision: 'rejected', comment } })}>નકારો</Button></>}
      >
        <Textarea label="નકારવાનું કારણ (ફરજિયાત)" rows={3} required value={comment} onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </div>
  );
}
