import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { attendanceApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, TableSkeleton, TableWrap, Textarea } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../lib/utils';

export default function AttendanceCorrections() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [decide, setDecide] = useState(null);
  const [decision, setDecision] = useState('approved');
  const [note, setNote] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance', 'corrections', 'pending'],
    queryFn: attendanceApi.pendingCorrections,
  });

  const mutation = useMutation({
    mutationFn: ({ attendanceId, correctionId, decision: d, note: n }) => attendanceApi.decideCorrection(attendanceId, correctionId, { decision: d, note: n }),
    onSuccess: (_, vars) => {
      toast.success(vars.decision === 'approved' ? 'સુધારો મંજૂર થયો' : 'સુધારો નકારાયો');
      qc.invalidateQueries({ queryKey: ['attendance'] });
      setDecide(null); setNote('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = data?.data || [];

  return (
    <div>
      <PageHeader
        title="હાજરી સુધારા મંજૂરી"
        subtitle="કર્મચારીઓની સુધારા વિનંતીઓ — મંજૂર કરો કે નકારો"
        actions={<Button variant="secondary" onClick={() => refetch()}>રિફ્રેશ</Button>}
      />

      <Card>
        <CardHeader title="બાકી વિનંતીઓ" subtitle={`${rows.length} વિનંતી`} icon={ClipboardCheck} />
        {isLoading ? <TableSkeleton rows={6} cols={6} /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ બાકી સુધારા વિનંતી નથી" message="બધી વિનંતીઓ પર નિર્ણય લેવાઈ ગયો છે." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="th">કર્મચારી</th><th className="th">તારીખ</th><th className="th">પ્રસ્તાવિત</th>
                <th className="th">કારણ</th><th className="th">વિનંતી સમય</th><th className="th text-right">ક્રિયાઓ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.correction._id} className="row">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={`${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`} size="xs" />
                      <span>
                        <span className="block font-medium">{r.employee?.firstName} {r.employee?.lastName}</span>
                        <span className="block text-xs text-slate-400">{r.employee?.employeeId}</span>
                      </span>
                    </div>
                  </td>
                  <td className="td">{fmtDate(r.date)}</td>
                  <td className="td text-xs">
                    <div>ઇન: {r.correction.proposed?.checkIn ? fmtDateTime(r.correction.proposed.checkIn) : '—'}</div>
                    <div>આઉટ: {r.correction.proposed?.checkOut ? fmtDateTime(r.correction.proposed.checkOut) : '—'}</div>
                    {r.correction.proposed?.status && <Badge value={r.correction.proposed.status} className="mt-1" />}
                  </td>
                  <td className="td max-w-xs whitespace-normal text-xs text-slate-600 dark:text-slate-300">{r.correction.reason}</td>
                  <td className="td text-xs text-slate-500">{fmtDateTime(r.correction.requestedAt || r.correction.createdAt)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Button size="xs" variant="success" icon={Check} onClick={() => { setDecide(r); setDecision('approved'); }}>મંજૂર</Button>
                      <Button size="xs" variant="danger" icon={X} onClick={() => { setDecide(r); setDecision('rejected'); }}>નકારો</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={!!decide} onClose={() => setDecide(null)} size="sm"
        title={decision === 'approved' ? 'સુધારો મંજૂર કરો' : 'સુધારો નકારો'}
        subtitle={decide ? `${decide.employee?.firstName} ${decide.employee?.lastName} · ${fmtDate(decide.date)}` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDecide(null)}>રદ</Button>
            <Button
              variant={decision === 'approved' ? 'success' : 'danger'}
              loading={mutation.isPending}
              disabled={!can('attendance:approve')}
              onClick={() => mutation.mutate({ attendanceId: decide.attendanceId, correctionId: decide.correction._id, decision, note })}
            >
              {decision === 'approved' ? 'મંજૂર કરો' : 'નકારો'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{decide?.correction?.reason}</p>
          <Textarea label="નિર્ણયની નોંધ (વૈકલ્પિક)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <Input label="નિર્ણય" value={decision === 'approved' ? 'મંજૂર' : 'નકારેલ'} readOnly />
        </div>
      </Modal>
    </div>
  );
}
