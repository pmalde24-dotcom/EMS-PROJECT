import { useQuery } from '@tanstack/react-query';
import { Banknote, History, TrendingUp, Wallet } from 'lucide-react';
import { payrollApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton, StatCard, TableWrap } from '../../components/ui';
import { currency, fmtDate, monthName } from '../../lib/utils';

export default function MySalary() {
  const { employeeId } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll', 'structure', employeeId],
    queryFn: () => payrollApi.structureFor(employeeId),
    enabled: !!employeeId,
  });
  const { data: revisions } = useQuery({
    queryKey: ['payroll', 'revisions', employeeId],
    queryFn: () => payrollApi.revisions({ employee: employeeId, limit: 50 }),
    enabled: !!employeeId,
  });

  const s = data?.data?.structure;
  const history = data?.data?.history || [];
  const revs = revisions?.data || [];

  if (!employeeId) {
    return <Card><EmptyState title="તમારું લોગિન કર્મચારી રેકોર્ડ સાથે જોડાયેલું નથી" message="સેલેરી સ્ટ્રક્ચર જોવા માટે HR નો સંપર્ક કરો." /></Card>;
  }

  const earnings = s ? [
    { name: 'બેઝિક', amount: s.basic }, { name: 'HRA', amount: s.hra },
    { name: 'સ્પેશિયલ એલાઉન્સ', amount: s.specialAllowance }, { name: 'કન્વેયન્સ', amount: s.conveyance },
    { name: 'મેડિકલ એલાઉન્સ', amount: s.medicalAllowance }, { name: 'LTA', amount: s.lta },
    ...(s.otherAllowances || []).map((o) => ({ name: o.name, amount: o.amount })),
  ].filter((e) => e.amount) : [];

  return (
    <div>
      <PageHeader title="મારો પગાર" subtitle="સેલેરી સ્ટ્રક્ચર, ઘટકો અને રિવિઝન ઇતિહાસ" />

      {isLoading ? <Skeleton className="h-64 w-full" /> : isError || !s ? (
        <Card><EmptyState icon={Wallet} title="કોઈ સક્રિય સેલેરી સ્ટ્રક્ચર મળ્યું નથી" message="HR દ્વારા સ્ટ્રક્ચર સેટ કરાયા પછી તે અહીં દેખાશે." onRetry={refetch} /></Card>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="વાર્ષિક CTC" value={currency(s.ctcAnnual)} sub="એમ્પ્લોયર ખર્ચ સહિત" icon={Banknote} tone="brand" />
            <StatCard label="માસિક ગ્રોસ" value={currency(s.grossMonthly)} icon={Wallet} tone="emerald" />
            <StatCard label="માસિક બેઝિક" value={currency(s.basic)} sub={`HRA: ${currency(s.hra)}`} icon={Wallet} tone="violet" />
            <StatCard label="અમલથી" value={fmtDate(s.effectiveFrom)} sub={s.effectiveTo ? `સુધી: ${fmtDate(s.effectiveTo)}` : 'ચાલુ'} icon={History} tone="amber" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="માસિક આવક ઘટકો" subtitle="ગ્રોસ સ્ટ્રક્ચર" icon={TrendingUp} />
              <div className="space-y-1 p-4">
                {earnings.map((e) => (
                  <div key={e.name} className="flex items-center justify-between border-b border-dashed border-slate-100 py-2 text-sm dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-300">{e.name}</span>
                    <span className="font-medium">{currency(e.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 text-sm font-semibold">
                  <span>કુલ માસિક ગ્રોસ</span><span>{currency(s.grossMonthly)}</span>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="એમ્પ્લોયર યોગદાન" subtitle="CTC નો ભાગ" icon={Banknote} />
              <div className="space-y-1 p-4">
                {(s.employerContributions || []).length === 0 && <EmptyState title="કોઈ યોગદાન નથી" />}
                {(s.employerContributions || []).map((c) => (
                  <div key={c.name} className="flex items-center justify-between border-b border-dashed border-slate-100 py-2 text-sm dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-300">{c.name}</span><span className="font-medium">{currency(c.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="માનક કપાત" subtitle="સ્ટ્રક્ચરમાં નિશ્ચિત" icon={Wallet} />
              <div className="space-y-1 p-4">
                {(s.standardDeductions || []).length === 0 && <EmptyState title="કોઈ માનક કપાત નથી" />}
                {(s.standardDeductions || []).map((c) => (
                  <div key={c.name} className="flex items-center justify-between border-b border-dashed border-slate-100 py-2 text-sm dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-300">{c.name}</span><span className="font-medium text-rose-600">-{currency(c.amount)}</span>
                  </div>
                ))}
                <p className="pt-3 text-[11px] text-slate-500">કર અને વૈધાનિક કપાતના દર કંપની સેટિંગમાંથી લેવાય છે — કોડમાં હાર્ડકોડ કરેલા નથી.</p>
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="સ્ટ્રક્ચર ઇતિહાસ" subtitle="અગાઉના વર્ઝન" icon={History} />
              <TableWrap>
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><th className="th">અમલથી</th><th className="th">CTC</th><th className="th">ગ્રોસ</th><th className="th">સ્થિતિ</th><th className="th">પ્રકાર</th></tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h._id} className="row">
                      <td className="td">{fmtDate(h.effectiveFrom)}{h.effectiveTo ? ` → ${fmtDate(h.effectiveTo)}` : ''}</td>
                      <td className="td">{currency(h.ctcAnnual)}</td>
                      <td className="td">{currency(h.grossMonthly)}</td>
                      <td className="td"><Badge value={h.status === 'active' ? 'active' : 'inactive'} label={h.status === 'active' ? 'સક્રિય' : 'જૂનું'} /></td>
                      <td className="td text-xs">{h.revision || '—'}</td>
                    </tr>
                  ))}
                  {history.length === 0 && <tr><td className="td" colSpan={5}><EmptyState /></td></tr>}
                </tbody>
              </TableWrap>
            </Card>

            <Card>
              <CardHeader title="પગાર વધારો / રિવિઝન" subtitle="મંજૂર થયેલા ફેરફાર" icon={TrendingUp} />
              <TableWrap>
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><th className="th">અમલથી</th><th className="th">પહેલાં</th><th className="th">પછી</th><th className="th">વધારો</th><th className="th">પ્રકાર</th></tr>
                </thead>
                <tbody>
                  {revs.map((r) => (
                    <tr key={r._id} className="row">
                      <td className="td">{fmtDate(r.effectiveFrom)}</td>
                      <td className="td">{currency(r.previousGross)}</td>
                      <td className="td font-medium">{currency(r.newGross)}</td>
                      <td className="td">
                        <span className={r.incrementPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {r.incrementPercent >= 0 ? '+' : ''}{r.incrementPercent ?? 0}%
                        </span>
                      </td>
                      <td className="td text-xs">{r.revisionType || '—'}</td>
                    </tr>
                  ))}
                  {revs.length === 0 && <tr><td className="td" colSpan={5}><EmptyState /></td></tr>}
                </tbody>
              </TableWrap>
            </Card>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            છેલ્લે અપડેટ: {s.updatedAt ? monthName(new Date(s.updatedAt).getMonth() + 1) + ' ' + new Date(s.updatedAt).getFullYear() : '—'} ·
            પગારની માહિતી માત્ર અધિકૃત ભૂમિકા અને સંબંધિત કર્મચારી પોતે જોઈ શકે છે.
          </p>
        </>
      )}
    </div>
  );
}
