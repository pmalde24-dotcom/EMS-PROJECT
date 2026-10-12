import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IndianRupee, Plus, TrendingUp } from 'lucide-react';
import { payrollApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination,
  Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { currency, fmtDate, fmtDateInput } from '../../lib/utils';

const empty = {
  employee: '', effectiveFrom: fmtDateInput(), ctcAnnual: '', basic: '', hra: '', specialAllowance: '',
  conveyance: '', medicalAllowance: '', lta: '', revision: 'initial', revisionReason: '',
};

export default function SalaryStructures() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['payroll', 'structures'], payrollApi.structures, { limit: 20 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [detail, setDetail] = useState(null);
  const [extra, setExtra] = useState({ standardDeductions: [], employerContributions: [], otherAllowances: [] });

  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }) });

  const save = useMutation({
    mutationFn: (payload) => payrollApi.saveStructure(payload),
    onSuccess: () => {
      toast.success('સેલરી સ્ટ્રક્ચર સાચવાયું');
      qc.invalidateQueries({ queryKey: ['payroll'] });
      setOpen(false); setForm(empty); setExtra({ standardDeductions: [], employerContributions: [], otherAllowances: [] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const gross = ['basic', 'hra', 'specialAllowance', 'conveyance', 'medicalAllowance', 'lta'].reduce((s, k) => s + (Number(form[k]) || 0), 0)
    + extra.otherAllowances.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const addComponent = (key) => setExtra((x) => ({ ...x, [key]: [...x[key], { name: '', amount: 0 }] }));
  const setComponent = (key, i, field, val) => setExtra((x) => ({ ...x, [key]: x[key].map((c, idx) => (idx === i ? { ...c, [field]: val } : c)) }));
  const removeComponent = (key, i) => setExtra((x) => ({ ...x, [key]: x[key].filter((_, idx) => idx !== i) }));

  const rows = list.rows;

  return (
    <div>
      <PageHeader
        title="સેલેરી સ્ટ્રક્ચર"
        subtitle="કર્મચારી મુજબ CTC, ગ્રોસ અને ઘટકો — દરેક નવું સ્ટ્રક્ચર નવો રિવિઝન બનાવે છે"
        actions={can('payroll:update') && <Button icon={Plus} onClick={() => setOpen(true)}>નવું સ્ટ્રક્ચર</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="કુલ સ્ટ્રક્ચર" value={list.meta?.total ?? '—'} icon={IndianRupee} tone="brand" />
        <StatCard label="સક્રિય (પેજ)" value={rows.filter((r) => r.status === 'active').length} icon={TrendingUp} tone="emerald" />
        <StatCard label="સરેરાશ માસિક ગ્રોસ" value={currency(rows.length ? Math.round(rows.reduce((s, r) => s + (r.grossMonthly || 0), 0) / rows.length) : 0)} icon={IndianRupee} tone="violet" />
      </div>

      <Card>
        <CardHeader title="સ્ટ્રક્ચર યાદી" subtitle="તાજેતરના પ્રથમ" icon={IndianRupee} />
        {list.isLoading ? <TableSkeleton rows={6} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ સેલેરી સ્ટ્રક્ચર નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">કર્મચારી</th><th className="th">અમલથી</th><th className="th">વાર્ષિક CTC</th><th className="th">માસિક ગ્રોસ</th>
                  <th className="th">બેઝિક</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
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
                    <td className="td">{fmtDate(s.effectiveFrom)}{s.effectiveTo ? ` → ${fmtDate(s.effectiveTo)}` : ''}</td>
                    <td className="td">{currency(s.ctcAnnual)}</td>
                    <td className="td font-medium">{currency(s.grossMonthly)}</td>
                    <td className="td">{currency(s.basic)}</td>
                    <td className="td"><Badge value={s.status === 'active' ? 'active' : 'inactive'} label={s.status === 'active' ? 'સક્રિય' : s.status === 'superseded' ? 'જૂનું' : 'ડ્રાફ્ટ'} /></td>
                    <td className="td text-right"><button className="btn-ghost btn-xs" onClick={() => setDetail(s)}>વિગત</button></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={list.meta} onPage={list.setPage} />
          </>
        )}
      </Card>

      <Modal
        open={open} onClose={() => setOpen(false)} size="lg"
        title="સેલેરી સ્ટ્રક્ચર સેટ કરો"
        subtitle="નવું સ્ટ્રક્ચર અમલ તારીખથી લાગુ થશે અને રિવિઝન નોંધાશે"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={save.isPending} disabled={!form.employee || !form.basic} onClick={() => save.mutate({ ...form, ...extra })}>સાચવો</Button></>}
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="કર્મચારી" required placeholder="પસંદ કરો" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` }))} value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })} />
            <Input label="અમલથી તારીખ" type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
            <Input label="વાર્ષિક CTC (₹)" type="number" value={form.ctcAnnual} onChange={(e) => setForm({ ...form, ctcAnnual: e.target.value })} />
            <Input label="બેઝિક (માસિક ₹)" required type="number" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} />
            <Input label="HRA" type="number" value={form.hra} onChange={(e) => setForm({ ...form, hra: e.target.value })} />
            <Input label="સ્પેશિયલ એલાઉન્સ" type="number" value={form.specialAllowance} onChange={(e) => setForm({ ...form, specialAllowance: e.target.value })} />
            <Input label="કન્વેયન્સ" type="number" value={form.conveyance} onChange={(e) => setForm({ ...form, conveyance: e.target.value })} />
            <Input label="મેડિકલ એલાઉન્સ" type="number" value={form.medicalAllowance} onChange={(e) => setForm({ ...form, medicalAllowance: e.target.value })} />
            <Input label="LTA" type="number" value={form.lta} onChange={(e) => setForm({ ...form, lta: e.target.value })} />
            <Select label="રિવિઝન પ્રકાર" options={['initial', 'annual', 'promotion', 'increment', 'correction', 'adjustment'].map((r) => ({ value: r, label: r }))} value={form.revision} onChange={(e) => setForm({ ...form, revision: e.target.value })} />
            <Input label="રિવિઝન કારણ" wrapperClassName="sm:col-span-2 lg:col-span-2" value={form.revisionReason} onChange={(e) => setForm({ ...form, revisionReason: e.target.value })} />
          </div>

          {[
            { key: 'otherAllowances', title: 'અન્ય એલાઉન્સ' },
            { key: 'standardDeductions', title: 'માનક કપાત (PF, PT વગેરે)' },
            { key: 'employerContributions', title: 'એમ્પ્લોયર યોગદાન (CTC માં)' },
          ].map((group) => (
            <section key={group.key}>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group.title}</h4>
                <Button size="xs" variant="ghost" icon={Plus} onClick={() => addComponent(group.key)}>ઘટક ઉમેરો</Button>
              </div>
              <div className="space-y-2">
                {extra[group.key].map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Input wrapperClassName="flex-1" placeholder="ઘટકનું નામ" value={c.name} onChange={(e) => setComponent(group.key, i, 'name', e.target.value)} />
                    <Input wrapperClassName="w-32" type="number" placeholder="રકમ" value={c.amount} onChange={(e) => setComponent(group.key, i, 'amount', Number(e.target.value))} />
                    <button className="btn-ghost btn-xs text-rose-600" onClick={() => removeComponent(group.key, i)}>દૂર</button>
                  </div>
                ))}
                {extra[group.key].length === 0 && <p className="text-xs text-slate-400">કોઈ ઘટક ઉમેરાયો નથી</p>}
              </div>
            </section>
          ))}

          <div className="rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-500/10">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-brand-700 dark:text-brand-300">માસિક ગ્રોસ (સર્વર ગણતરી)</span>
              <span className="text-lg font-semibold text-brand-800 dark:text-brand-200">{currency(gross)}</span>
            </div>
            <p className="mt-1 text-[11px] text-brand-600 dark:text-brand-300">
              ગ્રોસ = બેઝિક + HRA + એલાઉન્સ + અન્ય આવક. કર/વૈધાનિક કપાત કંપની સેટિંગ (payrollSettings) માંથી લાગુ થાય છે.
            </p>
          </div>
          <Textarea label="નોંધ" rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="સ્ટ્રક્ચર વિગત" subtitle={detail ? `${detail.employee?.firstName} ${detail.employee?.lastName}` : ''}>
        {detail && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[['બેઝિક', detail.basic], ['HRA', detail.hra], ['સ્પેશિયલ એલાઉન્સ', detail.specialAllowance], ['કન્વેયન્સ', detail.conveyance], ['મેડિકલ', detail.medicalAllowance], ['LTA', detail.lta]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                <span className="text-slate-500">{k}</span><span className="font-medium">{currency(v)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60 sm:col-span-2">
              <span className="font-medium">માસિક ગ્રોસ</span><span className="font-semibold">{currency(detail.grossMonthly)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60 sm:col-span-2">
              <span className="font-medium">વાર્ષિક CTC</span><span className="font-semibold">{currency(detail.ctcAnnual)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
