import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Receipt, Wallet, X } from 'lucide-react';
import { reimbursementApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, StatCard, TableSkeleton,
  TableWrap, Textarea,
} from '../../components/ui';
import { currency, fmtDate, label } from '../../lib/utils';

export default function ReimbursementApprovals() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [action, setAction] = useState(null);
  const [form, setForm] = useState({ decision: 'approved', approvedAmount: '', comment: '' });

  const pendingQuery = useQuery({ queryKey: ['reimbursements', 'pending'], queryFn: reimbursementApi.pending });
  const allQuery = useQuery({ queryKey: ['reimbursements', 'recent'], queryFn: () => reimbursementApi.list({ limit: 20 }) });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['reimbursements'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };

  const decide = useMutation({
    mutationFn: (payload) => reimbursementApi.decide(action._id, payload),
    onSuccess: () => { toast.success('નિર્ણય સાચવાયો'); invalidate(); setAction(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const markPaid = useMutation({
    mutationFn: ({ id, reference }) => reimbursementApi.markPaid(id, { paymentReference: reference }),
    onSuccess: () => { toast.success('ચુકવાયેલ તરીકે નોંધાયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = pendingQuery.data?.data || [];
  const recent = allQuery.data?.data || [];
  const totalPending = rows.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div>
      <PageHeader
        title="ખર્ચ ક્લેમ મંજૂરી"
        subtitle="ટીમના ખર્ચ ક્લેમની સમીક્ષા — મંજૂર, નકાર કે રકમ સુધારો"
        actions={<Button variant="secondary" onClick={() => { pendingQuery.refetch(); allQuery.refetch(); }}>રિફ્રેશ</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="બાકી ક્લેમ" value={rows.length} icon={Receipt} tone="amber" />
        <StatCard label="બાકી કુલ રકમ" value={currency(totalPending)} icon={Wallet} tone="rose" />
        <StatCard label="મંજૂર (તાજેતરના)" value={recent.filter((r) => r.status === 'approved').length} icon={Check} tone="emerald" />
      </div>

      <Card>
        <CardHeader title="મંજૂરી બાકી" subtitle={`${rows.length} ક્લેમ`} icon={Receipt} />
        {pendingQuery.isLoading ? <TableSkeleton rows={5} cols={6} /> : pendingQuery.isError ? <ErrorState onRetry={pendingQuery.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ બાકી ક્લેમ નથી" message="બધા ક્લેમ પર નિર્ણય લેવાઈ ગયો છે." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="th">ક્લેમ નં.</th><th className="th">કર્મચારી</th><th className="th">શીર્ષક</th><th className="th">શ્રેણી</th>
                <th className="th">તારીખ</th><th className="th">રકમ</th><th className="th">સ્તર</th><th className="th text-right">ક્રિયાઓ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="row">
                  <td className="td font-mono text-xs">{r.claimNo}</td>
                  <td className="td">
                    <p className="font-medium">{r.employee?.firstName} {r.employee?.lastName}</p>
                    <p className="text-xs text-slate-400">{r.employee?.employeeId}</p>
                  </td>
                  <td className="td max-w-xs whitespace-normal">{r.title}</td>
                  <td className="td">{label(r.category)}</td>
                  <td className="td">{fmtDate(r.expenseDate)}</td>
                  <td className="td font-semibold">{currency(r.amount)}</td>
                  <td className="td text-xs text-slate-500">{r.currentLevel || 1}/{r.approvals?.length || 1}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Button size="xs" variant="success" icon={Check} onClick={() => { setAction({ ...r, mode: 'decide' }); setForm({ decision: 'approved', approvedAmount: r.amount, comment: '' }); }}>મંજૂર</Button>
                      <Button size="xs" variant="danger" icon={X} onClick={() => { setAction({ ...r, mode: 'decide' }); setForm({ decision: 'rejected', approvedAmount: '', comment: '' }); }}>નકારો</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="તાજેતરના નિર્ણયો" subtitle="છેલ્લા 20 ક્લેમ" icon={Wallet} />
        <TableWrap>
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="th">કર્મચારી</th><th className="th">શીર્ષક</th><th className="th">રકમ</th><th className="th">મંજૂર</th>
              <th className="th">સ્થિતિ</th><th className="th">ચુકવણી</th><th className="th text-right">ક્રિયાઓ</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r._id} className="row">
                <td className="td">{r.employee?.firstName} {r.employee?.lastName}</td>
                <td className="td max-w-xs whitespace-normal">{r.title} <span className="block text-xs text-slate-400">{label(r.category)} · {fmtDate(r.expenseDate)}</span></td>
                <td className="td">{currency(r.amount)}</td>
                <td className="td">{r.approvedAmount ? currency(r.approvedAmount) : '—'}</td>
                <td className="td"><Badge value={r.status} /></td>
                <td className="td text-xs">{r.paidAt ? `${fmtDate(r.paidAt)}${r.paymentReference ? ` · ${r.paymentReference}` : ''}` : '—'}</td>
                <td className="td text-right">
                  {r.status === 'approved' && can('reimbursements:update') && (
                    <Button size="xs" variant="secondary" icon={Wallet} onClick={() => markPaid.mutate({ id: r._id, reference: `TXN-${Date.now().toString().slice(-8)}` })}>ચૂકવાયું</Button>
                  )}
                </td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td className="td" colSpan={7}><EmptyState /></td></tr>}
          </tbody>
        </TableWrap>
      </Card>

      <Modal
        open={!!action} onClose={() => setAction(null)} size="sm"
        title={form.decision === 'approved' ? 'ક્લેમ મંજૂર કરો' : 'ક્લેમ નકારો'}
        subtitle={action ? `${action.employee?.firstName} ${action.employee?.lastName} · ${action.title}` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAction(null)}>રદ</Button>
            <Button
              variant={form.decision === 'approved' ? 'success' : 'danger'}
              loading={decide.isPending}
              disabled={form.decision === 'rejected' && form.comment.length < 3}
              onClick={() => decide.mutate({
                decision: form.decision,
                approvedAmount: form.decision === 'approved' ? Number(form.approvedAmount || action.amount) : undefined,
                comment: form.comment,
              })}
            >પુષ્ટિ કરો</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
            <p className="text-slate-600 dark:text-slate-300">{action?.description || action?.title}</p>
            <p className="mt-1 text-xs text-slate-500">દાવો: {currency(action?.amount)} · તારીખ: {fmtDate(action?.expenseDate)}</p>
          </div>
          {form.decision === 'approved' && (
            <Input label="મંજૂર રકમ (₹)" type="number" value={form.approvedAmount} onChange={(e) => setForm({ ...form, approvedAmount: e.target.value })} hint="સંપૂર્ણ રકમ ન મંજૂર કરવી હોય તો ઓછી રકમ લખો." />
          )}
          <Textarea label={form.decision === 'rejected' ? 'નકારવાનું કારણ (ફરજિયાત)' : 'ટિપ્પણી'} rows={2} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
