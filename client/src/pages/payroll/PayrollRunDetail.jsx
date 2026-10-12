import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Download, Lock, Play, Users, Wallet } from 'lucide-react';
import { payrollApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, SearchInput, Skeleton,
  StatCard, TableWrap, Pagination,
} from '../../components/ui';
import { currency, fmtDateTime, label, monthName } from '../../lib/utils';

export default function PayrollRunDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 15;

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['payroll', 'run', id], queryFn: () => payrollApi.run(id), enabled: !!id });

  const act = useMutation({
    mutationFn: ({ action }) => (action === 'approve' ? payrollApi.approveRun(id, {}) : action === 'process' ? payrollApi.processRun(id, {}) : action === 'lock' ? payrollApi.lockRun(id, {}) : payrollApi.markPaid(id, {})),
    onSuccess: (res) => { toast.success(res?.message || 'ક્રિયા પૂર્ણ'); qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const run = data?.data?.run;
  const slips = data?.data?.payslips || [];
  const filtered = slips.filter((s) => {
    if (!q) return true;
    const t = `${s.employee?.firstName} ${s.employee?.lastName} ${s.employee?.employeeId}`.toLowerCase();
    return t.includes(q.toLowerCase());
  });
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !run) return <Card><ErrorState onRetry={refetch} /></Card>;

  return (
    <div>
      <Link to="/payroll/runs" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> પેરોલ રન યાદી
      </Link>

      <PageHeader
        title={`${monthName(run.month)} ${run.year} — પેરોલ રન`}
        subtitle={`${run.period}${run.department?.name ? ` · ${run.department.name}` : ' · બધા ડિપાર્ટમેન્ટ'} · સ્થિતિ: ${label(run.status)}`}
        actions={(
          <>
            <a className="btn-secondary" href={`/api/payroll/reports/salary-register?export=csv&period=${run.period}`}><Download className="h-4 w-4" /> સેલેરી રજિસ્ટર</a>
            {['draft', 'pending_approval'].includes(run.status) && can('payroll:approve') && <Button variant="success" icon={CheckCircle2} onClick={() => act.mutate({ action: 'approve' })}>મંજૂર કરો</Button>}
            {run.status === 'approved' && can('payroll:update') && <Button icon={Play} onClick={() => act.mutate({ action: 'process' })}>પ્રોસેસ કરો</Button>}
            {run.status === 'processed' && can('payroll:update') && <Button variant="secondary" icon={Lock} onClick={() => act.mutate({ action: 'lock' })}>લોક કરો</Button>}
            {['processed', 'locked'].includes(run.status) && can('payroll:update') && <Button variant="success" onClick={() => act.mutate({ action: 'markPaid' })}>ચૂકવાયું માર્ક કરો</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="કર્મચારી" value={run.totalEmployees} icon={Users} tone="brand" />
        <StatCard label="કુલ ગ્રોસ" value={currency(run.totalGross)} icon={Wallet} tone="emerald" />
        <StatCard label="કુલ કપાત" value={currency(run.totalDeductions)} icon={Wallet} tone="rose" />
        <StatCard label="કુલ નેટ" value={currency(run.totalNet)} icon={Wallet} tone="violet" />
        <StatCard label="એમ્પ્લોયર ખર્ચ" value={currency(run.totalEmployerCost)} icon={Wallet} tone="cyan" />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader
            title="પે-સ્લિપ યાદી" subtitle={`${filtered.length} પે-સ્લિપ`} icon={Wallet}
            action={<SearchInput value={q} onChange={setQ} placeholder="કર્મચારી શોધો…" className="w-full sm:w-56" />}
          />
          {slips.length === 0 ? <EmptyState title="કોઈ પે-સ્લિપ નથી" /> : (
            <>
              <TableWrap>
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="th">કર્મચારી</th><th className="th">દિવસ (પેઇડ/કુલ)</th><th className="th">ગ્રોસ</th>
                    <th className="th">કપાત</th><th className="th">નેટ</th><th className="th">ચુકવણી</th><th className="th text-right">પે-સ્લિપ</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s._id} className="row">
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={`${s.employee?.firstName || ''} ${s.employee?.lastName || ''}`} size="xs" />
                          <span>
                            <span className="block font-medium">{s.employee?.firstName} {s.employee?.lastName}</span>
                            <span className="block text-xs text-slate-400">{s.employee?.employeeId}</span>
                          </span>
                        </div>
                      </td>
                      <td className="td">{s.paidDays}/{s.workingDays}{s.lopDays ? <span className="ml-1 text-xs text-rose-600">-{s.lopDays} LOP</span> : null}</td>
                      <td className="td">{currency(s.grossEarnings)}</td>
                      <td className="td text-rose-600">-{currency(s.totalDeductions)}</td>
                      <td className="td font-semibold">{currency(s.netPay)}</td>
                      <td className="td"><Badge value={s.paymentStatus === 'paid' ? 'paid' : 'pending'} label={s.paymentStatus === 'paid' ? 'ચૂકવાયેલ' : 'બાકી'} /></td>
                      <td className="td text-right"><a className="btn-ghost btn-xs" href={payrollApi.payslipPdfUrl(s._id)} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /></a></td>
                    </tr>
                  ))}
                  {paged.length === 0 && <tr><td className="td" colSpan={7}><EmptyState title="કોઈ પે-સ્લિપ મળી નથી" /></td></tr>}
                </tbody>
              </TableWrap>
              <Pagination meta={{ page, pages: Math.max(1, Math.ceil(filtered.length / perPage)), total: filtered.length, limit: perPage }} onPage={setPage} />
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="રન વિગત" subtitle="ઓડિટ પ્રવાહ" icon={CheckCircle2} />
          <div className="space-y-3 p-4 text-sm">
            <Row l="સ્થિતિ" v={<Badge value={run.status} />} />
            <Row l="સમયગાળો" v={run.period} />
            <Row l="બનાવનાર" v={`${run.generatedBy?.name || '—'} · ${fmtDateTime(run.generatedAt)}`} />
            <Row l="મંજૂર કરનાર" v={run.approvedBy?.name ? `${run.approvedBy.name} · ${fmtDateTime(run.approvedAt)}` : '—'} />
            <Row l="પ્રોસેસ કરનાર" v={run.processedBy?.name ? `${run.processedBy.name} · ${fmtDateTime(run.processedAt)}` : '—'} />
            <Row l="ચુકવણી સમય" v={run.paidAt ? fmtDateTime(run.paidAt) : '—'} />
            {run.notes && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{run.notes}</p>}
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">ઓડિટ ટ્રેલ</p>
              <div className="space-y-1.5">
                {(run.auditTrail || []).slice().reverse().map((a, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{a.action}</span>
                    <span className="block text-slate-400">{fmtDateTime(a.createdAt)}{a.note ? ` · ${a.note}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ l, v }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500 dark:text-slate-400">{l}</span>
      <span className="text-right text-xs font-medium text-slate-700 dark:text-slate-200">{v}</span>
    </div>
  );
}
