import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Eye, Lock, Play, Plus, Trash2, Wallet } from 'lucide-react';
import { payrollApi, departmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Modal, PageHeader, Pagination, Select, StatCard, TableSkeleton, TableWrap, Textarea } from '../../components/ui';
import { currency, fmtDateTime, monthName } from '../../lib/utils';

export default function PayrollRuns() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const now = new Date();
  const list = useList(['payroll', 'runs'], payrollApi.runs, { limit: 20 });
  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ month: now.getMonth() + 1, year: now.getFullYear(), department: '', notes: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['payroll'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };

  const generate = useMutation({
    mutationFn: (payload) => payrollApi.generate(payload),
    onSuccess: (res) => {
      toast.success(res.message || 'પેરોલ જનરેટ થયું');
      if (res.data?.skipped?.length) toast.warning(`${res.data.skipped.length} કર્મચારી છોડાયા (સેલેરી સ્ટ્રક્ચર નથી)`);
      invalidate(); setGenOpen(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const act = useMutation({
    mutationFn: ({ id, action }) => (action === 'approve' ? payrollApi.approveRun(id, {}) : action === 'process' ? payrollApi.processRun(id, {}) : action === 'lock' ? payrollApi.lockRun(id, {}) : payrollApi.markPaid(id, {})),
    onSuccess: (res) => { toast.success(res?.message || 'ક્રિયા પૂર્ણ'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id) => payrollApi.deleteRun(id),
    onSuccess: () => { toast.success('ડ્રાફ્ટ રન દૂર કરાયો'); invalidate(); setConfirmDelete(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows;
  const latest = rows[0];

  return (
    <div>
      <PageHeader
        title="પેરોલ રન"
        subtitle="માસિક પગારપત્રક બનાવો, મંજૂર કરો, પ્રોસેસ કરો અને ચૂકવો"
        actions={can('payroll:create') && <Button icon={Plus} onClick={() => setGenOpen(true)}>નવો પેરોલ રન</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ રન" value={list.meta?.total ?? '—'} icon={Wallet} tone="brand" />
        <StatCard label="છેલ્લો કુલ નેટ" value={latest ? currency(latest.totalNet) : '—'} sub={latest ? `${monthName(latest.month)} ${latest.year}` : ''} icon={Wallet} tone="emerald" />
        <StatCard label="છેલ્લા રનના કર્મચારી" value={latest?.totalEmployees ?? '—'} icon={Wallet} tone="violet" />
        <StatCard label="છેલ્લી સ્થિતિ" value={latest ? latest.status : '—'} icon={CheckCircle2} tone="amber" />
      </div>

      <Card>
        <CardHeader title="રન ઇતિહાસ" subtitle="તાજેતરના થી જૂના" icon={Wallet} />
        {list.isLoading ? <TableSkeleton rows={6} cols={7} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ પેરોલ રન નથી" message="«નવો પેરોલ રન» દબાવીને આ મહિનાનો પગારપત્રક બનાવો." />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">સમયગાળો</th><th className="th">ડિપાર્ટમેન્ટ</th><th className="th">કર્મચારી</th><th className="th">ગ્રોસ</th>
                  <th className="th">કપાત</th><th className="th">નેટ</th><th className="th">સ્થિતિ</th><th className="th">બનાવ્યું</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="row">
                    <td className="td font-medium">
                      <Link to={`/payroll/runs/${r._id}`} className="hover:text-brand-600">{monthName(r.month)} {r.year}</Link>
                      <span className="block text-xs text-slate-400">{r.period}</span>
                    </td>
                    <td className="td">{r.department?.name || 'બધા'}</td>
                    <td className="td">{r.totalEmployees}</td>
                    <td className="td">{currency(r.totalGross)}</td>
                    <td className="td text-rose-600">-{currency(r.totalDeductions)}</td>
                    <td className="td font-semibold">{currency(r.totalNet)}</td>
                    <td className="td"><Badge value={r.status} /></td>
                    <td className="td text-xs text-slate-500">{r.generatedBy?.name || '—'}<span className="block">{fmtDateTime(r.generatedAt)}</span></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Link to={`/payroll/runs/${r._id}`} className="btn-ghost btn-xs"><Eye className="h-3.5 w-3.5" /></Link>
                        {['draft', 'pending_approval'].includes(r.status) && can('payroll:approve') && (
                          <Button size="xs" variant="success" icon={CheckCircle2} onClick={() => act.mutate({ id: r._id, action: 'approve' })}>મંજૂર</Button>
                        )}
                        {r.status === 'approved' && can('payroll:update') && (
                          <Button size="xs" icon={Play} onClick={() => act.mutate({ id: r._id, action: 'process' })}>પ્રોસેસ</Button>
                        )}
                        {r.status === 'processed' && can('payroll:update') && (
                          <Button size="xs" variant="secondary" icon={Lock} onClick={() => act.mutate({ id: r._id, action: 'lock' })}>લોક</Button>
                        )}
                        {['processed', 'locked'].includes(r.status) && can('payroll:update') && (
                          <Button size="xs" variant="success" onClick={() => act.mutate({ id: r._id, action: 'markPaid' })}>ચૂકવાયું</Button>
                        )}
                        {r.status === 'draft' && can('payroll:delete') && (
                          <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirmDelete(r)}><Trash2 className="h-3.5 w-3.5" /></button>
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
        open={genOpen} onClose={() => setGenOpen(false)} size="md"
        title="નવો પેરોલ રન બનાવો" subtitle="ડેટા હાજરી, રજા અને સેલેરી સ્ટ્રક્ચરમાંથી ગણાશે"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setGenOpen(false)}>રદ</Button>
            <Button loading={generate.isPending} onClick={() => generate.mutate({ ...gen, department: gen.department || null })}>જનરેટ કરો</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="મહિનો" options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }))} value={String(gen.month)} onChange={(e) => setGen({ ...gen, month: Number(e.target.value) })} />
            <Select label="વર્ષ" options={[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({ value: String(y), label: String(y) }))} value={String(gen.year)} onChange={(e) => setGen({ ...gen, year: Number(e.target.value) })} />
          </div>
          <Select label="ડિપાર્ટમેન્ટ (વૈકલ્પિક — ખાલી રાખો તો બધા)" placeholder="બધા કર્મચારી" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={gen.department} onChange={(e) => setGen({ ...gen, department: e.target.value })} />
          <Textarea label="નોંધ" rows={2} value={gen.notes} onChange={(e) => setGen({ ...gen, notes: e.target.value })} />
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            એક જ સમયગાળા માટે ફરી રન બનાવી શકાશે નહીં — પહેલાં ડ્રાફ્ટ રન દૂર કરો. LOP, ઓવરટાઇમ અને કર કંપની સેટિંગ મુજબ ગણાય છે.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete} title="ડ્રાફ્ટ રન દૂર કરો?"
        message={confirmDelete ? `${monthName(confirmDelete.month)} ${confirmDelete.year} નો ડ્રાફ્ટ રન અને તેની તમામ પે-સ્લિપ દૂર થશે.` : ''}
        loading={remove.isPending} onClose={() => setConfirmDelete(null)} onConfirm={() => remove.mutate(confirmDelete._id)}
      />
    </div>
  );
}
