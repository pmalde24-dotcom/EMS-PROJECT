import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, CalendarPlus, Info } from 'lucide-react';
import { leaveApi, leaveTypeApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, PageHeader, Progress, Select, Skeleton, TableWrap, Textarea } from '../../components/ui';
import { fmtDate, fmtDateInput, label, relativeTime } from '../../lib/utils';

export default function MyLeave() {
  const qc = useQueryClient();
  const year = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    leaveType: '', startDate: fmtDateInput(), endDate: fmtDateInput(), isHalfDay: false,
    halfDaySession: 'first_half', reason: '', contactDuringLeave: '', handoverTo: '',
  });

  const { data: balances, isLoading } = useQuery({ queryKey: ['leave', 'balances', 'me', year], queryFn: () => leaveApi.myBalances({ year }) });
  const { data: requests, isLoading: reqLoading } = useQuery({ queryKey: ['leave', 'me', 'requests'], queryFn: () => leaveApi.list({ mine: 'true', limit: 20 }) });
  const { data: types } = useQuery({ queryKey: ['leave', 'types', 'active'], queryFn: () => leaveTypeApi.list({ limit: 50, isActive: true }) });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300 }) });

  const apply = useMutation({
    mutationFn: (body) => leaveApi.apply(body),
    onSuccess: (res) => {
      toast.success(res.message || 'રજા વિનંતી મોકલાઈ');
      qc.invalidateQueries({ queryKey: ['leave'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
      setForm({ ...form, reason: '' });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const cancel = useMutation({
    mutationFn: (id) => leaveApi.cancel(id, { reason: 'Cancelled by employee' }),
    onSuccess: () => { toast.success('વિનંતી રદ થઈ'); qc.invalidateQueries({ queryKey: ['leave'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const bs = balances?.data?.balances || [];
  const rows = requests?.data || [];
  const days = Math.max(0, Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1);
  const selectedType = (types?.data || []).find((t) => t._id === form.leaveType);

  return (
    <div>
      <PageHeader
        title="મારી રજાઓ"
        subtitle="બેલેન્સ, અરજી અને વિનંતીની સ્થિતિ"
        actions={<Button icon={CalendarPlus} onClick={() => setOpen(true)}>નવી રજા અરજી</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <Card key={i} className="card-pad"><Skeleton className="h-16 w-full" /></Card>)
          : bs.length === 0 ? <Card className="card-pad sm:col-span-2"><EmptyState title="આ વર્ષ માટે રજા બેલેન્સ ઉપલબ્ધ નથી" /></Card>
            : bs.map((b) => (
              <Card key={b._id} className="card-pad">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{b.leaveType?.name}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{b.available ?? 0}<span className="text-xs font-normal text-slate-500"> દિવસ ઉપલબ્ધ</span></p>
                    <p className="mt-1 text-[11px] text-slate-500">ફાળવેલ {b.allocated ?? 0} · વપરાયેલ {b.used ?? 0} · બાકી {b.pending ?? 0}</p>
                  </div>
                  <span className="h-3 w-3 rounded-full" style={{ background: b.leaveType?.color || '#4f46e5' }} />
                </div>
                <Progress className="mt-3" value={b.allocated ? ((b.used || 0) / b.allocated) * 100 : 0} />
                {b.leaveType?.paid === false && <p className="mt-1 text-[11px] text-amber-600">અવેતન રજા</p>}
              </Card>
            ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="મારી વિનંતીઓ" subtitle="તાજેતરની 20 અરજીઓ" icon={CalendarDays} />
          {reqLoading ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> : rows.length === 0 ? (
            <EmptyState title="કોઈ રજા વિનંતી નથી" action={<Button size="xs" onClick={() => setOpen(true)}>પહેલી અરજી કરો</Button>} />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">પ્રકાર</th><th className="th">થી → સુધી</th><th className="th">દિવસ</th>
                  <th className="th">સ્થિતિ</th><th className="th">અરજી</th><th className="th text-right">ક્રિયા</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="row">
                    <td className="td">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType?.color || '#4f46e5' }} />
                        <span className="font-medium">{r.leaveType?.name}</span>
                      </span>
                      {r.reason && <p className="max-w-xs truncate text-xs text-slate-500">{r.reason}</p>}
                    </td>
                    <td className="td text-xs">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}{r.isHalfDay ? ' (અડધો દિવસ)' : ''}</td>
                    <td className="td">{r.totalDays}</td>
                    <td className="td">
                      <Badge value={r.status} />
                      {r.approvals?.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">સ્તર {r.currentLevel}/{r.approvals.length}</p>
                      )}
                    </td>
                    <td className="td text-xs text-slate-500">{relativeTime(r.appliedAt || r.createdAt)}</td>
                    <td className="td text-right">
                      {['pending', 'manager_approved'].includes(r.status) && (
                        <Button size="xs" variant="ghost" onClick={() => cancel.mutate(r._id)} loading={cancel.isPending}>રદ કરો</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="રજા પોલિસી" subtitle="કંપનીના નિયમો" icon={Info} />
          <div className="space-y-3 p-4 text-sm text-slate-600 dark:text-slate-300">
            {(types?.data || []).map((t) => (
              <div key={t._id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{t.name}</p>
                  <span className="text-xs font-medium text-brand-600">{t.annualQuota} દિવસ/વર્ષ</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t.paid ? 'વેતન સાથે' : 'અવેતન'} · {t.allowHalfDay ? 'અડધો દિવસ માન્ય' : 'પૂર્ણ દિવસ'} ·
                  મંજૂરી સ્તર: {t.approvalLevels || 1} · નોટિસ: {t.minNoticeDays || 0} દિવસ
                </p>
                {t.requiresDocument && <p className="mt-1 text-[11px] text-amber-600">દસ્તાવેજ જરૂરી ({t.requiresDocumentAfterDays || 0}+ દિવસથી)</p>}
              </div>
            ))}
            {(types?.data || []).length === 0 && <EmptyState />}
          </div>
        </Card>
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)}
        title="રજા અરજી કરો" subtitle="બધી વિગત ભરો — મંજૂરી સ્તર પ્રમાણે પ્રક્રિયા થશે"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button>
            <Button
              loading={apply.isPending}
              disabled={!form.leaveType || form.reason.length < 5}
              onClick={() => apply.mutate({
                leaveType: form.leaveType, startDate: form.startDate, endDate: form.endDate,
                isHalfDay: form.isHalfDay, halfDaySession: form.isHalfDay ? form.halfDaySession : undefined,
                reason: form.reason, contactDuringLeave: form.contactDuringLeave || undefined,
                handoverTo: form.handoverTo || undefined,
              })}
            >અરજી મોકલો</Button>
          </>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="રજા પ્રકાર" required placeholder="પસંદ કરો" wrapperClassName="sm:col-span-2"
            options={(types?.data || []).map((t) => ({ value: t._id, label: `${t.name} (ઉપલબ્ધ ${(bs.find((b) => b.leaveType?._id === t._id)?.available) ?? 0} દિવસ)` }))}
            value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
          />
          <Input label="થી" type="date" required value={form.startDate} min={fmtDateInput()} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })} />
          <Input label="સુધી" type="date" required value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <Select
            label="અડધો દિવસ?" options={[{ value: 'false', label: 'ના — પૂર્ણ દિવસ' }, { value: 'true', label: 'હા' }]}
            value={String(form.isHalfDay)} onChange={(e) => setForm({ ...form, isHalfDay: e.target.value === 'true' })}
          />
          {form.isHalfDay && (
            <Select
              label="સત્ર" options={[{ value: 'first_half', label: 'પહેલો ભાગ' }, { value: 'second_half', label: 'બીજો ભાગ' }]}
              value={form.halfDaySession} onChange={(e) => setForm({ ...form, halfDaySession: e.target.value })}
            />
          )}
          <Select
            label="કામ સોંપો (વૈકલ્પિક)" placeholder="પસંદ કરો"
            options={(employees?.data || []).map((m) => ({ value: m._id, label: `${m.firstName} ${m.lastName}` }))}
            value={form.handoverTo} onChange={(e) => setForm({ ...form, handoverTo: e.target.value })}
          />
          <Input label="રજા દરમિયાન સંપર્ક" value={form.contactDuringLeave} onChange={(e) => setForm({ ...form, contactDuringLeave: e.target.value })} placeholder="+91…" />
          <Textarea label="કારણ" required wrapperClassName="sm:col-span-2" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="કારણ લખો (ઓછામાં ઓછા 5 અક્ષર)…" />

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60 sm:col-span-2">
            <p className="flex items-center justify-between">
              <span className="text-slate-500">કુલ દિવસ</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{form.isHalfDay ? 0.5 : days} દિવસ</span>
            </p>
            {selectedType && (
              <p className="mt-1 text-xs text-slate-500">
                {selectedType.name}: {selectedType.paid ? 'વેતન સાથે' : 'અવેતન'} · મંજૂરી {selectedType.approvalLevels || 1} સ્તર
                {selectedType.requiresDocument ? ' · દસ્તાવેજ જરૂરી થઈ શકે' : ''}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
