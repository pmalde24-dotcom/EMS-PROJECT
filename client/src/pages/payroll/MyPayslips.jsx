import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileSpreadsheet, Wallet } from 'lucide-react';
import { payrollApi } from '../../api/endpoints';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, StatCard, TableSkeleton, TableWrap } from '../../components/ui';
import { currency, fmtDate, monthName } from '../../lib/utils';

export default function MyPayslips() {
  const [selected, setSelected] = useState(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll', 'payslips', 'me'],
    queryFn: () => payrollApi.payslips({ limit: 36 }),
  });

  const rows = data?.data || [];
  const latest = rows[0];
  const ytdNet = rows.filter((r) => r.year === new Date().getFullYear()).reduce((s, r) => s + (r.netPay || 0), 0);

  return (
    <div>
      <PageHeader
        title="મારા પે-સ્લિપ"
        subtitle="માસિક પગાર સ્લિપ જુઓ અને PDF ડાઉનલોડ કરો"
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="છેલ્લો નેટ પગાર" value={latest ? currency(latest.netPay) : '—'} sub={latest ? `${monthName(latest.month)} ${latest.year}` : 'પે-સ્લિપ ઉપલબ્ધ નથી'} icon={Wallet} tone="brand" />
        <StatCard label="આ વર્ષની કુલ આવક" value={currency(ytdNet)} sub={`${rows.filter((r) => r.year === new Date().getFullYear()).length} પે-સ્લિપ`} icon={FileSpreadsheet} tone="emerald" />
        <StatCard label="કુલ પે-સ્લિપ" value={rows.length} icon={FileSpreadsheet} tone="violet" />
      </div>

      <Card>
        <CardHeader title="પે-સ્લિપ ઇતિહાસ" subtitle="તાજેતરથી જૂની" icon={FileSpreadsheet} />
        {isLoading ? <TableSkeleton rows={6} cols={6} /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ પે-સ્લિપ ઉપલબ્ધ નથી" message="પગારપત્રક રન પ્રોસેસ થયા પછી પે-સ્લિપ દેખાશે." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="th">સમયગાળો</th><th className="th">કામ કરેલા દિવસ</th><th className="th">ગ્રોસ</th>
                <th className="th">કપાત</th><th className="th">નેટ પગાર</th><th className="th">ચુકવણી</th><th className="th text-right">ક્રિયાઓ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p._id} className="row">
                  <td className="td font-medium">{monthName(p.month)} {p.year}</td>
                  <td className="td">{p.paidDays ?? '—'} / {p.workingDays ?? '—'}{p.lopDays ? <span className="ml-1 text-xs text-rose-600">({p.lopDays} LOP)</span> : null}</td>
                  <td className="td">{currency(p.grossEarnings)}</td>
                  <td className="td text-rose-600">-{currency(p.totalDeductions)}</td>
                  <td className="td font-semibold text-slate-900 dark:text-white">{currency(p.netPay)}</td>
                  <td className="td"><Badge value={p.paymentStatus === 'paid' ? 'paid' : 'pending'} label={p.paymentStatus === 'paid' ? 'ચૂકવાયેલ' : 'બાકી'} /></td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost btn-xs" onClick={() => setSelected(p)}><Eye className="h-3.5 w-3.5" /></button>
                      <a className="btn-ghost btn-xs" href={payrollApi.payslipPdfUrl(p._id)} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /></a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={!!selected} onClose={() => setSelected(null)} size="md"
        title={`પે-સ્લિપ — ${selected ? `${monthName(selected.month)} ${selected.year}` : ''}`}
        subtitle={selected ? `કામ કરેલા દિવસ: ${selected.paidDays}/${selected.workingDays} · બેંક: XXXX${selected.bankLast4 || ''}` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>બંધ કરો</Button>
            <a className="btn-primary" href={payrollApi.payslipPdfUrl(selected?._id)} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> PDF ડાઉનલોડ</a>
          </>
        )}
      >
        {selected && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">આવક (Earnings)</p>
              <div className="space-y-1">
                {(selected.earnings || []).map((e, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-dashed border-slate-100 py-1.5 text-sm dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-300">{e.name}</span>
                    <span className="font-medium">{currency(e.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 text-sm font-semibold">
                  <span>ગ્રોસ</span><span>{currency(selected.grossEarnings)}</span>
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">કપાત (Deductions)</p>
              <div className="space-y-1">
                {(selected.deductions || []).map((d, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-dashed border-slate-100 py-1.5 text-sm dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-300">{d.name}</span>
                    <span className="font-medium text-rose-600">-{currency(d.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 text-sm font-semibold">
                  <span>કુલ કપાત</span><span className="text-rose-600">-{currency(selected.totalDeductions)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-500/10 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-brand-700 dark:text-brand-300">ચૂકવવાનો નેટ પગાર</span>
                <span className="text-xl font-semibold text-brand-800 dark:text-brand-200">{currency(selected.netPay)}</span>
              </div>
              <p className="mt-1 text-xs text-brand-600 dark:text-brand-300">
                {selected.bonus ? `બોનસ: ${currency(selected.bonus)} · ` : ''}
                {selected.overtimeAmount ? `ઓવરટાઇમ: ${currency(selected.overtimeAmount)} · ` : ''}
                {selected.reimbursementTotal ? `રિમ્બર્સમેન્ટ: ${currency(selected.reimbursementTotal)} · ` : ''}
                ચુકવણી: {selected.paidOn ? fmtDate(selected.paidOn) : 'બાકી'}
              </p>
            </div>
            {selected.employerContributions?.length > 0 && (
              <div className="sm:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-400">એમ્પ્લોયર યોગદાન (CTC)</p>
                <div className="space-y-1">
                  {selected.employerContributions.map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{e.name}</span><span>{currency(e.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 text-sm font-semibold"><span>માસિક CTC</span><span>{currency(selected.ctcMonthly)}</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
