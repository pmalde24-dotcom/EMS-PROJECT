import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, LogOut, Plus, UserMinus, Users } from 'lucide-react';
import { offboardingApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination,
  Progress, SearchInput, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateInput, label } from '../../lib/utils';

const REASONS = ['better_opportunity', 'higher_studies', 'relocation', 'health', 'family', 'compensation', 'work_environment', 'career_change', 'termination', 'retirement', 'absconding', 'other'];

export default function OffboardingList() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['offboarding'], offboardingApi.list, { limit: 20 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', resignationDate: fmtDateInput(), lastWorkingDay: '', reason: 'better_opportunity', reasonDetails: '', noticePeriodDays: 30 });

  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, includeInactive: true }) });

  const submit = useMutation({
    mutationFn: (payload) => offboardingApi.submit(payload),
    onSuccess: () => { toast.success('રાજીનામું નોંધાયું'); qc.invalidateQueries({ queryKey: ['offboarding'] }); setOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }) => offboardingApi.decide(id, { decision, comment: 'Reviewed by HR' }),
    onSuccess: (_, v) => { toast.success(v.decision === 'approved' ? 'મંજૂર થયું' : 'નકારાયું'); qc.invalidateQueries({ queryKey: ['offboarding'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows;

  return (
    <div>
      <PageHeader
        title="ઓફબોર્ડિંગ"
        subtitle="રાજીનામું, નોટિસ પીરિયડ, એસેટ રિટર્ન, એક્સેસ રિવોક અને ફાઇનલ સેટલમેન્ટ"
        actions={can('offboarding:create') && <Button icon={Plus} onClick={() => setOpen(true)}>રાજીનામું નોંધો</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="કુલ ઓફબોર્ડિંગ" value={list.meta?.total ?? '—'} icon={LogOut} tone="brand" />
        <StatCard label="ચાલુ પ્રક્રિયા" value={rows.filter((r) => ['submitted', 'approved', 'in_progress'].includes(r.status)).length} icon={UserMinus} tone="amber" />
        <StatCard label="પૂર્ણ" value={rows.filter((r) => r.status === 'completed').length} icon={Users} tone="emerald" />
      </div>

      <Card>
        <CardHeader title="ઓફબોર્ડિંગ યાદી" icon={LogOut} action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="શોધો…" className="w-full sm:w-56" />} />
        <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Select wrapperClassName="w-full sm:w-52" placeholder="બધી સ્થિતિ" options={['submitted', 'approved', 'in_progress', 'completed', 'rejected', 'withdrawn'].map((s) => ({ value: s, label: label(s) }))} value={list.params.status || ''} onChange={(e) => list.patch({ status: e.target.value || undefined })} />
          <Select wrapperClassName="w-full sm:w-56" placeholder="બધા કારણો" options={REASONS.map((r) => ({ value: r, label: label(r) }))} value={list.params.reason || ''} onChange={(e) => list.patch({ reason: e.target.value || undefined })} />
        </div>

        {list.isLoading ? <TableSkeleton rows={6} cols={7} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ ઓફબોર્ડિંગ રેકોર્ડ નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">કર્મચારી</th><th className="th">રાજીનામું</th><th className="th">છેલ્લો દિવસ</th><th className="th">નોટિસ</th>
                  <th className="th">પ્રક્રિયા પ્રગતિ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const tasks = r.tasks || [];
                  const done = tasks.filter((t) => t.status === 'completed').length;
                  return (
                    <tr key={r._id} className="row">
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={r.employee?.profilePhoto} name={`${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`} size="xs" />
                          <span>
                            <span className="block font-medium">{r.employee?.firstName} {r.employee?.lastName}</span>
                            <span className="block text-xs text-slate-400">{r.employee?.employeeId} · {label(r.reason)}</span>
                          </span>
                        </div>
                      </td>
                      <td className="td">{fmtDate(r.resignationDate)}</td>
                      <td className="td">{fmtDate(r.lastWorkingDay)}</td>
                      <td className="td text-xs">
                        {r.noticePeriodDays} દિવસ જરૂરી<span className="block text-slate-400">{r.noticeServedDays} પૂરા{r.noticeShortfallDays ? ` · ${r.noticeShortfallDays} ઓછા` : ''}</span>
                      </td>
                      <td className="td"><div className="min-w-32"><Progress value={tasks.length ? (done / tasks.length) * 100 : 0} showLabel /></div></td>
                      <td className="td"><Badge value={r.status} /></td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          <Link to={`/offboarding/${r._id}`} className="btn-ghost btn-xs"><Eye className="h-3.5 w-3.5" /></Link>
                          {can('offboarding:approve') && ['submitted'].includes(r.status) && (
                            <>
                              <Button size="xs" variant="success" onClick={() => decide.mutate({ id: r._id, decision: 'approved' })}>મંજૂર</Button>
                              <Button size="xs" variant="danger" onClick={() => decide.mutate({ id: r._id, decision: 'rejected' })}>નકારો</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination meta={list.meta} onPage={list.setPage} />
          </>
        )}
      </Card>

      <Modal
        open={open} onClose={() => setOpen(false)}
        title="રાજીનામું / ઓફબોર્ડિંગ શરૂ કરો" subtitle="નોટિસ પીરિયડ કર્મચારીના રેકોર્ડ પ્રમાણે ગણાશે"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={submit.isPending} disabled={!form.employeeId || !form.lastWorkingDay} onClick={() => submit.mutate(form)}>સબમિટ કરો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="કર્મચારી" required placeholder="પસંદ કરો" wrapperClassName="sm:col-span-2" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` }))} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
          <Input label="રાજીનામાની તારીખ" type="date" required value={form.resignationDate} onChange={(e) => setForm({ ...form, resignationDate: e.target.value })} />
          <Input label="છેલ્લો કામકાજનો દિવસ" type="date" required value={form.lastWorkingDay} min={form.resignationDate} onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })} />
          <Select label="કારણ" options={REASONS.map((r) => ({ value: r, label: label(r) }))} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Input label="નોટિસ પીરિયડ (દિવસ)" type="number" value={form.noticePeriodDays} onChange={(e) => setForm({ ...form, noticePeriodDays: Number(e.target.value) })} />
          <Textarea label="વિગતવાર કારણ" wrapperClassName="sm:col-span-2" rows={3} value={form.reasonDetails} onChange={(e) => setForm({ ...form, reasonDetails: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
