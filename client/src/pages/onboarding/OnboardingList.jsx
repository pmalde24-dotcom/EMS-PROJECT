import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarCheck, Eye, Plus, UserPlus, Users } from 'lucide-react';
import { onboardingApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination,
  Progress, SearchInput, Select, StatCard, TableSkeleton, TableWrap,
} from '../../components/ui';
import { fmtDate } from '../../lib/utils';

export default function OnboardingList() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['onboarding'], onboardingApi.list, { limit: 20 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', templateId: '', startDate: '', targetCompletionDate: '', buddy: '' });

  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, includeInactive: true }) });
  const { data: templates } = useQuery({ queryKey: ['onboarding', 'templates'], queryFn: onboardingApi.templates, enabled: open });

  const start = useMutation({
    mutationFn: (payload) => onboardingApi.start(payload),
    onSuccess: () => { toast.success('ઓનબોર્ડિંગ શરૂ થયું'); qc.invalidateQueries({ queryKey: ['onboarding'] }); setOpen(false); setForm({ employeeId: '', templateId: '', startDate: '', targetCompletionDate: '', buddy: '' }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows;
  const active = rows.filter((r) => ['in_progress', 'awaiting_verification'].includes(r.status)).length;

  return (
    <div>
      <PageHeader
        title="ઓનબોર્ડિંગ"
        subtitle="નવા કર્મચારીઓની જોડાણ પ્રક્રિયા — ટાસ્ક, દસ્તાવેજ, એસેટ અને ઓરિએન્ટેશન"
        actions={can('onboarding:create') && <Button icon={Plus} onClick={() => setOpen(true)}>નવું ઓનબોર્ડિંગ</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="કુલ ઓનબોર્ડિંગ" value={list.meta?.total ?? '—'} icon={UserPlus} tone="brand" />
        <StatCard label="ચાલુ પ્રક્રિયા" value={active} icon={CalendarCheck} tone="amber" />
        <StatCard label="પૂર્ણ થયેલ" value={rows.filter((r) => r.status === 'completed').length} icon={Users} tone="emerald" />
      </div>

      <Card>
        <CardHeader title="ઓનબોર્ડિંગ યાદી" icon={UserPlus} action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="શોધો…" className="w-full sm:w-56" />} />
        <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Select wrapperClassName="w-full sm:w-52" placeholder="બધી સ્થિતિ" options={['not_started', 'in_progress', 'awaiting_verification', 'completed', 'cancelled'].map((s) => ({ value: s, label: s }))} value={list.params.status || ''} onChange={(e) => list.patch({ status: e.target.value || undefined })} />
        </div>

        {list.isLoading ? <TableSkeleton rows={6} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ ઓનબોર્ડિંગ રેકોર્ડ નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">કર્મચારી</th><th className="th">શરૂઆત</th><th className="th">લક્ષ્ય તારીખ</th><th className="th">ટાસ્ક પ્રગતિ</th>
                  <th className="th">દસ્તાવેજ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const tasks = r.tasks || [];
                  const done = tasks.filter((t) => t.status === 'completed').length;
                  const docs = r.documents || [];
                  const verified = docs.filter((d) => d.status === 'verified').length;
                  return (
                    <tr key={r._id} className="row">
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={r.employee?.profilePhoto} name={`${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`} size="xs" />
                          <span>
                            <span className="block font-medium">{r.employee?.firstName} {r.employee?.lastName}</span>
                            <span className="block text-xs text-slate-400">{r.employee?.employeeId} · {r.employee?.designation?.title || ''}</span>
                          </span>
                        </div>
                      </td>
                      <td className="td">{fmtDate(r.startDate)}</td>
                      <td className="td">{fmtDate(r.targetCompletionDate)}</td>
                      <td className="td">
                        <div className="min-w-40">
                          <Progress value={tasks.length ? (done / tasks.length) * 100 : 0} showLabel />
                          <p className="mt-0.5 text-[11px] text-slate-400">{done}/{tasks.length} ટાસ્ક પૂર્ણ</p>
                        </div>
                      </td>
                      <td className="td text-xs">{verified}/{docs.length} ચકાસાયેલ</td>
                      <td className="td"><Badge value={r.status} /></td>
                      <td className="td text-right"><Link to={`/onboarding/${r._id}`} className="btn-ghost btn-xs"><Eye className="h-3.5 w-3.5" /></Link></td>
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
        title="નવું ઓનબોર્ડિંગ શરૂ કરો" subtitle="ટેમ્પલેટ પસંદ ન કરો તો વિભાગ/હોદ્દા પ્રમાણે ડિફોલ્ટ વપરાશે"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={start.isPending} disabled={!form.employeeId} onClick={() => start.mutate({ ...form, templateId: form.templateId || undefined, startDate: form.startDate || undefined, targetCompletionDate: form.targetCompletionDate || undefined, buddy: form.buddy || undefined })}>શરૂ કરો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="કર્મચારી" required placeholder="પસંદ કરો" wrapperClassName="sm:col-span-2" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` }))} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
          <Select label="ટેમ્પલેટ (વૈકલ્પિક)" placeholder="ડિફોલ્ટ" options={(templates?.data || []).map((t) => ({ value: t._id, label: t.name }))} value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })} />
          <Select label="બડી (વૈકલ્પિક)" placeholder="પસંદ કરો" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName}` }))} value={form.buddy} onChange={(e) => setForm({ ...form, buddy: e.target.value })} />
          <Input label="શરૂઆતની તારીખ" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Input label="લક્ષ્ય પૂર્ણતા તારીખ" type="date" value={form.targetCompletionDate} onChange={(e) => setForm({ ...form, targetCompletionDate: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
