import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Download, Eye, Filter, Users } from 'lucide-react';
import { payrollApi, employeeApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, Pagination, SearchInput,
  Select, StatCard, TableSkeleton, TableWrap,
} from '../../components/ui';
import { currency, fmtDate, monthName } from '../../lib/utils';

export default function AllPayslips() {
  const now = new Date();
  const { hasRole } = useAuth();
  const list = useList(['payroll', 'payslips', 'all'], payrollApi.payslips, { limit: 20, year: now.getFullYear() });
  const [detail, setDetail] = useState(null);

  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300 }) });

  const rows = list.rows;
  const totalNet = rows.reduce((s, r) => s + (r.netPay || 0), 0);
  const paid = rows.filter((r) => r.paymentStatus === 'paid').length;

  return (
    <div>
      <PageHeader
        title="તમામ પે-સ્લિપ"
        subtitle="કંપનીના બધા કર્મચારીઓની પગાર સ્લિપ — શોધો, જુઓ અને PDF ડાઉનલોડ કરો"
        actions={hasRole('super_admin', 'hr_admin', 'hr_manager') && (
          <a className="btn-secondary" href="/api/payroll/reports/salary-register?export=csv"><Download className="h-4 w-4" /> સેલેરી રજિસ્ટર CSV</a>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="કુલ પે-સ્લિપ" value={list.meta?.total ?? '—'} icon={Banknote} tone="brand" />
        <StatCard label="આ પેજનો કુલ નેટ" value={currency(totalNet)} icon={Banknote} tone="emerald" />
        <StatCard label="ચૂકવાયેલ (પેજ)" value={`${paid}/${rows.length}`} icon={Users} tone="violet" />
      </div>

      <Card>
        <CardHeader
          title="પે-સ્લિપ યાદી" icon={Filter}
          action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="શોધો…" className="w-full sm:w-56" />}
        />
        <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Select wrapperClassName="w-full sm:w-52" placeholder="બધા કર્મચારી" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` }))} value={list.params.employee || ''} onChange={(e) => list.patch({ employee: e.target.value || undefined })} />
          <Select wrapperClassName="w-32" placeholder="વર્ષ" options={[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({ value: String(y), label: String(y) }))} value={String(list.params.year || '')} onChange={(e) => list.patch({ year: e.target.value || undefined })} />
          <Select wrapperClassName="w-40" placeholder="મહિનો" options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }))} value={String(list.params.month || '')} onChange={(e) => list.patch({ month: e.target.value || undefined })} />
          <Select wrapperClassName="w-40" placeholder="ચુકવણી સ્થિતિ" options={[{ value: 'pending', label: 'બાકી' }, { value: 'paid', label: 'ચૂકવાયેલ' }, { value: 'on_hold', label: 'હોલ્ડ' }]} value={list.params.paymentStatus || ''} onChange={(e) => list.patch({ paymentStatus: e.target.value || undefined })} />
        </div>

        {list.isLoading ? <TableSkeleton rows={8} cols={7} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ પે-સ્લિપ મળી નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">કર્મચારી</th><th className="th">સમયગાળો</th><th className="th">ગ્રોસ</th><th className="th">કપાત</th>
                  <th className="th">નેટ</th><th className="th">ચુકવણી</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p._id} className="row">
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${p.employee?.firstName || ''} ${p.employee?.lastName || ''}`} size="xs" />
                        <span>
                          <span className="block font-medium">{p.employee?.firstName} {p.employee?.lastName}</span>
                          <span className="block text-xs text-slate-400">{p.employee?.employeeId} · {p.employee?.department?.name || ''}</span>
                        </span>
                      </div>
                    </td>
                    <td className="td">{monthName(p.month)} {p.year}</td>
                    <td className="td">{currency(p.grossEarnings)}</td>
                    <td className="td text-rose-600">-{currency(p.totalDeductions)}</td>
                    <td className="td font-semibold">{currency(p.netPay)}</td>
                    <td className="td">
                      <Badge value={p.paymentStatus === 'paid' ? 'paid' : p.paymentStatus === 'on_hold' ? 'hold' : 'pending'} label={p.paymentStatus === 'paid' ? 'ચૂકવાયેલ' : p.paymentStatus === 'on_hold' ? 'હોલ્ડ' : 'બાકી'} />
                      {p.paidOn && <span className="block text-[11px] text-slate-400">{fmtDate(p.paidOn)}</span>}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost btn-xs" onClick={() => setDetail(p)}><Eye className="h-3.5 w-3.5" /></button>
                        <a className="btn-ghost btn-xs" href={payrollApi.payslipPdfUrl(p._id)} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /></a>
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
        open={!!detail} onClose={() => setDetail(null)}
        title={`પે-સ્લિપ — ${detail ? `${monthName(detail.month)} ${detail.year}` : ''}`}
        subtitle={detail ? `${detail.employee?.firstName} ${detail.employee?.lastName} · ${detail.employee?.employeeId}` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>બંધ કરો</Button>
            <a className="btn-primary" href={payrollApi.payslipPdfUrl(detail?._id)} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> PDF</a>
          </>
        )}
      >
        {detail && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">આવક</p>
              {(detail.earnings || []).map((e, i) => (
                <div key={i} className="flex justify-between border-b border-dashed border-slate-100 py-1.5 text-sm dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-300">{e.name}</span><span>{currency(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-sm font-semibold"><span>ગ્રોસ</span><span>{currency(detail.grossEarnings)}</span></div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">કપાત</p>
              {(detail.deductions || []).map((d, i) => (
                <div key={i} className="flex justify-between border-b border-dashed border-slate-100 py-1.5 text-sm dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-300">{d.name}</span><span className="text-rose-600">-{currency(d.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-sm font-semibold"><span>કુલ કપાત</span><span className="text-rose-600">-{currency(detail.totalDeductions)}</span></div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-500/10 sm:col-span-2">
              <span className="text-sm font-medium text-brand-700 dark:text-brand-300">નેટ પગાર</span>
              <span className="text-xl font-semibold text-brand-800 dark:text-brand-200">{currency(detail.netPay)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
