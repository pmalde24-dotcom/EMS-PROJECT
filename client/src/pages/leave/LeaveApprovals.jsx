import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ClipboardList, Download, X } from 'lucide-react';
import { leaveApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, TableSkeleton,
  TableWrap, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateTime, relativeTime } from '../../lib/utils';

export default function LeaveApprovals() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [action, setAction] = useState(null);
  const [comment, setComment] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['leave', 'pending-approvals'],
    queryFn: leaveApi.pendingApprovals,
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, comment: c }) => (decision === 'approved' ? leaveApi.approve(id, { comment: c }) : leaveApi.reject(id, { comment: c })),
    onSuccess: (res, vars) => {
      toast.success(res?.message || (vars.decision === 'approved' ? 'રજા મંજૂર થઈ' : 'રજા નકારાઈ'));
      qc.invalidateQueries({ queryKey: ['leave'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setAction(null); setComment('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = data?.data || [];

  return (
    <div>
      <PageHeader
        title="રજા મંજૂરી ઇનબોક્સ"
        subtitle="પ્રત્યેક વિનંતી બહુ-સ્તરીય પ્રક્રિયામાંથી પસાર થાય છે (મેનેજર → HR)"
        actions={(
          <>
            <a href="/api/leave/requests?export=csv&status=pending" className="btn-secondary"><Download className="h-4 w-4" /> CSV</a>
            <Button variant="secondary" onClick={() => refetch()}>રિફ્રેશ</Button>
          </>
        )}
      />

      <Card>
        <CardHeader title="બાકી રજા વિનંતીઓ" subtitle={`${rows.length} વિનંતી`} icon={ClipboardList} />
        {isLoading ? <TableSkeleton rows={6} cols={6} /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ બાકી વિનંતી નથી" message="તમામ રજા વિનંતીઓ પર નિર્ણય લેવાઈ ગયો છે." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="th">કર્મચારી</th><th className="th">પ્રકાર</th><th className="th">સમયગાળો</th><th className="th">દિવસ</th>
                <th className="th">કારણ</th><th className="th">મંજૂરી સ્તર</th><th className="th">અરજી</th><th className="th text-right">ક્રિયાઓ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="row">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={r.employee?.profilePhoto} name={`${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`} size="xs" />
                      <span>
                        <span className="block font-medium">{r.employee?.firstName} {r.employee?.lastName}</span>
                        <span className="block text-xs text-slate-400">{r.employee?.employeeId} · {r.employee?.department?.name || ''}</span>
                      </span>
                    </div>
                  </td>
                  <td className="td">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType?.color || '#4f46e5' }} />
                      {r.leaveType?.name}
                    </span>
                  </td>
                  <td className="td text-xs">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</td>
                  <td className="td">{r.totalDays}</td>
                  <td className="td max-w-xs whitespace-normal text-xs text-slate-600 dark:text-slate-300">{r.reason}</td>
                  <td className="td">
                    <Badge value={r.status} />
                    <p className="mt-1 text-[11px] text-slate-400">સ્તર {r.currentLevel} / {r.approvals?.length || 1}</p>
                  </td>
                  <td className="td text-xs text-slate-500">{relativeTime(r.appliedAt || r.createdAt)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Button size="xs" variant="success" icon={Check} onClick={() => { setAction({ ...r, decision: 'approved' }); setComment(''); }}>મંજૂર</Button>
                      <Button size="xs" variant="danger" icon={X} onClick={() => { setAction({ ...r, decision: 'rejected' }); setComment(''); }}>નકારો</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={!!action} onClose={() => setAction(null)} size="sm"
        title={action?.decision === 'approved' ? 'રજા મંજૂર કરો' : 'રજા નકારો'}
        subtitle={action ? `${action.employee?.firstName} ${action.employee?.lastName} · ${action.leaveType?.name} · ${action.totalDays} દિવસ` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAction(null)}>રદ</Button>
            <Button
              variant={action?.decision === 'approved' ? 'success' : 'danger'}
              loading={decide.isPending}
              disabled={!can('leave:approve') || (action?.decision === 'rejected' && comment.length < 3)}
              onClick={() => decide.mutate({ id: action._id, decision: action.decision, comment })}
            >પુષ્ટિ કરો</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60">
            <p className="text-slate-600 dark:text-slate-300"><span className="font-medium">કારણ:</span> {action?.reason}</p>
            <p className="mt-1 text-xs text-slate-500">
              અરજી: {fmtDateTime(action?.appliedAt || action?.createdAt)} · સ્તર {action?.currentLevel}/{action?.approvals?.length || 1}
            </p>
            {action?.contactDuringLeave && <p className="mt-1 text-xs text-slate-500">રજા દરમિયાન સંપર્ક: {action.contactDuringLeave}</p>}
          </div>
          <Textarea
            label={action?.decision === 'rejected' ? 'નકારવાનું કારણ (ફરજિયાત)' : 'ટિપ્પણી (વૈકલ્પિક)'}
            rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
