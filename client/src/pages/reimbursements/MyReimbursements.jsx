import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Plus, Receipt, Trash2, TrendingUp } from 'lucide-react';
import { reimbursementApi, projectApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Pagination, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { currency, fmtDate, fmtDateInput, label } from '../../lib/utils';

const CATEGORIES = ['travel', 'accommodation', 'food', 'fuel', 'internet', 'mobile', 'medical', 'training', 'client_entertainment', 'office_supplies', 'relocation', 'other'];

export default function MyReimbursements() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['reimbursements', 'me'], reimbursementApi.list, { limit: 20 });
  const [open, setOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [form, setForm] = useState({ category: 'travel', title: '', description: '', amount: '', expenseDate: fmtDateInput(), project: '' });

  const { data: stats } = useQuery({ queryKey: ['reimbursements', 'stats'], queryFn: () => reimbursementApi.stats({}) });
  const { data: projects } = useQuery({ queryKey: ['projects', 'options'], queryFn: () => projectApi.list({ limit: 100 }) });

  const create = useMutation({
    mutationFn: (body) => reimbursementApi.create(body),
    onSuccess: () => { toast.success('ખર્ચ ક્લેમ સબમિટ થયો'); qc.invalidateQueries({ queryKey: ['reimbursements'] }); setOpen(false); setForm({ ...form, title: '', description: '', amount: '' }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const cancel = useMutation({
    mutationFn: (id) => reimbursementApi.cancel(id),
    onSuccess: () => { toast.success('ક્લેમ રદ થયો'); qc.invalidateQueries({ queryKey: ['reimbursements'] }); setConfirmCancel(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows;
  const s = stats?.data || {};

  return (
    <div>
      <PageHeader
        title="ખર્ચ ક્લેમ (રિમ્બર્સમેન્ટ)"
        subtitle="પ્રવાસ, ભોજન, ઇન્ટરનેટ કે અન્ય ખર્ચની ભરપાઈ માટે ક્લેમ સબમિટ કરો"
        actions={can('reimbursements:create') && <Button icon={Plus} onClick={() => setOpen(true)}>નવો ક્લેમ</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ ક્લેમ" value={s.total ?? list.meta?.total ?? '—'} icon={Receipt} tone="brand" />
        <StatCard label="બાકી રકમ" value={currency(s.pendingAmount ?? 0)} sub={`${s.pending ?? 0} ક્લેમ મંજૂરી બાકી`} icon={Clock} tone="amber" />
        <StatCard label="મંજૂર રકમ" value={currency(s.approvedAmount ?? 0)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="ચૂકવાયેલ રકમ" value={currency(s.paidAmount ?? 0)} sub={`${s.paid ?? 0} ક્લેમ પૂર્ણ`} icon={TrendingUp} tone="violet" />
      </div>

      <Card>
        <CardHeader title="મારા ક્લેમ" subtitle="તાજેતરના" icon={Receipt} />
        {list.isLoading ? <TableSkeleton rows={6} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ ખર્ચ ક્લેમ નથી" message="«નવો ક્લેમ» દબાવીને પહેલો ક્લેમ સબમિટ કરો." />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">ક્લેમ નં.</th><th className="th">શીર્ષક</th><th className="th">શ્રેણી</th><th className="th">ખર્ચ તારીખ</th>
                  <th className="th">રકમ</th><th className="th">મંજૂર રકમ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="row">
                    <td className="td font-mono text-xs">{r.claimNo}</td>
                    <td className="td">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{r.title}</p>
                      {r.description && <p className="max-w-xs truncate text-xs text-slate-500">{r.description}</p>}
                    </td>
                    <td className="td">{label(r.category)}</td>
                    <td className="td">{fmtDate(r.expenseDate)}</td>
                    <td className="td font-medium">{currency(r.amount)}</td>
                    <td className="td">{r.approvedAmount ? currency(r.approvedAmount) : '—'}</td>
                    <td className="td">
                      <Badge value={r.status} />
                      {r.rejectionReason && <p className="mt-1 max-w-xs text-[11px] text-rose-600">{r.rejectionReason}</p>}
                    </td>
                    <td className="td text-right">
                      {['draft', 'pending'].includes(r.status) && (
                        <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirmCancel(r)}><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
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
        open={open} onClose={() => setOpen(false)}
        title="નવો ખર્ચ ક્લેમ" subtitle="રસીદ/બિલ અપલોડ કરવાની સુવિધા ક્લેમ વિગતમાં છે"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={create.isPending} disabled={!form.title || !form.amount} onClick={() => create.mutate({ ...form, amount: Number(form.amount), project: form.project || undefined })}>સબમિટ કરો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="શ્રેણી" options={CATEGORIES.map((c) => ({ value: c, label: label(c) }))} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Input label="રકમ (₹)" type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input label="શીર્ષક" required wrapperClassName="sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ઉદા: ક્લાયન્ટ મીટિંગ મુસાફરી" />
          <Input label="ખર્ચની તારીખ" type="date" required value={form.expenseDate} max={fmtDateInput()} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
          <Select label="પ્રોજેક્ટ (વૈકલ્પિક)" placeholder="કોઈ નહીં" options={(projects?.data || []).map((p) => ({ value: p._id, label: p.name }))} value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} />
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 sm:col-span-2">
            મંજૂરી પ્રક્રિયા: મેનેજર → HR/ફાઇનાન્સ. મંજૂર થયેલી રકમ પગારપત્રક સાથે ચૂકવાય છે.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmCancel} title="ક્લેમ રદ કરો?"
        message={confirmCancel ? `«${confirmCancel.title}» (${currency(confirmCancel.amount)}) રદ થશે.` : ''}
        loading={cancel.isPending} onClose={() => setConfirmCancel(null)} onConfirm={() => cancel.mutate(confirmCancel._id)}
      />
    </div>
  );
}
