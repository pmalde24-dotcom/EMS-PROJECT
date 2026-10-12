import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, Check, Download, Eye, Filter, X } from 'lucide-react';
import { leaveApi, leaveTypeApi, employeeApi, departmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, Pagination, SearchInput,
  Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateTime, label } from '../../lib/utils';

const STATUSES = ['pending', 'manager_approved', 'hr_approved', 'approved', 'rejected', 'cancelled'].map((s) => ({ value: s, label: label(s) }));

export default function LeaveRequests() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['leave', 'requests'], leaveApi.list, { limit: 20, year: new Date().getFullYear() });
  const [detail, setDetail] = useState(null);
  const [decide, setDecide] = useState(null);
  const [comment, setComment] = useState('');

  const { data: types } = useQuery({ queryKey: ['leave', 'types', 'all'], queryFn: () => leaveTypeApi.list({ limit: 50 }) });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300 }) });
  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision, comment: c }) => (decision === 'approved' ? leaveApi.approve(id, { comment: c }) : leaveApi.reject(id, { comment: c })),
    onSuccess: () => {
      toast.success('નિર્ણય સાચવાયો');
      qc.invalidateQueries({ queryKey: ['leave'] });
      setDecide(null); setComment('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows;
  const pending = rows.filter((r) => ['pending', 'manager_approved'].includes(r.status)).length;

  return (
    <div>
      <PageHeader
        title="રજા વિનંતીઓ"
        subtitle="તમામ કર્મચારીઓની રજા અરજીઓ — સ્થિતિ, મંજૂરી સ્તર અને ઇતિહાસ"
        actions={<a href="/api/leave/requests?export=csv&limit=1000" className="btn-secondary"><Download className="h-4 w-4" /> CSV એક્સપોર્ટ</a>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="કુલ વિનંતી" value={list.meta?.total ?? '—'} icon={CalendarDays} tone="brand" />
        <StatCard label="આ પેજ પર બાકી" value={pending} icon={Filter} tone="amber" />
        <StatCard label="મંજૂર (પેજ)" value={rows.filter((r) => ['approved', 'hr_approved'].includes(r.status)).length} icon={Check} tone="emerald" />
      </div>

      <Card>
        <CardHeader
          title="વિનંતી યાદી" icon={Filter}
          action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="કારણ શોધો…" className="w-full sm:w-64" />}
        />
        <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Select wrapperClassName="w-full sm:w-56" placeholder="બધા કર્મચારી" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` }))} value={list.params.employee || ''} onChange={(e) => list.patch({ employee: e.target.value || undefined })} />
          <Select wrapperClassName="w-full sm:w-44" placeholder="બધા પ્રકાર" options={(types?.data || []).map((t) => ({ value: t._id, label: t.name }))} value={list.params.leaveType || ''} onChange={(e) => list.patch({ leaveType: e.target.value || undefined })} />
          <Select wrapperClassName="w-full sm:w-44" placeholder="બધી સ્થિતિ" options={STATUSES} value={list.params.status || ''} onChange={(e) => list.patch({ status: e.target.value || undefined })} />
          <Select wrapperClassName="w-full sm:w-40" placeholder="વર્ષ" options={[2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }))} value={String(list.params.year || '')} onChange={(e) => list.patch({ year: e.target.value || undefined })} />
        </div>

        {list.isLoading ? <TableSkeleton rows={8} cols={7} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ રજા વિનંતી મળી નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">કર્મચારી</th><th className="th">પ્રકાર</th><th className="th">સમયગાળો</th><th className="th">દિવસ</th>
                  <th className="th">સ્થિતિ</th><th className="th">સ્તર</th><th className="th">અરજી સમય</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="row">
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={r.employee?.profilePhoto} name={`${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`} size="xs" />
                        <span>
                          <span className="block font-medium">{r.employee?.firstName} {r.employee?.lastName}</span>
                          <span className="block text-xs text-slate-400">{r.employee?.employeeId}</span>
                        </span>
                      </div>
                    </td>
                    <td className="td">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType?.color || '#4f46e5' }} />
                        {r.leaveType?.name}
                      </span>
                    </td>
                    <td className="td text-xs">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}{r.isHalfDay ? ' (½)' : ''}</td>
                    <td className="td">{r.totalDays}</td>
                    <td className="td"><Badge value={r.status} /></td>
                    <td className="td text-xs text-slate-500">{r.currentLevel || 1}/{r.approvals?.length || 1}</td>
                    <td className="td text-xs text-slate-500">{fmtDateTime(r.appliedAt || r.createdAt)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost btn-xs" onClick={() => setDetail(r)}><Eye className="h-3.5 w-3.5" /></button>
                        {r.canAct && can('leave:approve') && (
                          <>
                            <Button size="xs" variant="success" icon={Check} onClick={() => { setDecide({ ...r, decision: 'approved' }); setComment(''); }}>મંજૂર</Button>
                            <Button size="xs" variant="danger" icon={X} onClick={() => { setDecide({ ...r, decision: 'rejected' }); setComment(''); }}>નકારો</Button>
                          </>
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

      <Modal open={!!detail} onClose={() => setDetail(null)} title="રજા વિનંતી વિગત" subtitle={detail ? `${detail.employee?.firstName} ${detail.employee?.lastName} · ${detail.leaveType?.name}` : ''}>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="સ્થિતિ" value={<Badge value={detail.status} />} />
              <Info label="કુલ દિવસ" value={detail.totalDays} />
              <Info label="થી" value={fmtDate(detail.startDate)} />
              <Info label="સુધી" value={fmtDate(detail.endDate)} />
              <Info label="અડધો દિવસ" value={detail.isHalfDay ? 'હા' : 'ના'} />
              <Info label="અરજી સમય" value={fmtDateTime(detail.appliedAt || detail.createdAt)} />
              <Info label="રજા દરમિયાન સંપર્ક" value={detail.contactDuringLeave || '—'} />
              <Info label="કામ સોંપાયું" value={detail.handoverTo?.firstName ? `${detail.handoverTo.firstName} ${detail.handoverTo.lastName}` : '—'} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">કારણ</p>
              <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{detail.reason}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">મંજૂરી પ્રવાહ</p>
              <div className="mt-2 space-y-2">
                {(detail.approvals || []).map((a, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      સ્તર {a.level} · {label(a.role)}{a.approver?.firstName ? ` — ${a.approver.firstName} ${a.approver.lastName}` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      {a.comment && <span className="max-w-xs truncate text-[11px] text-slate-400">{a.comment}</span>}
                      <Badge value={a.status === 'pending' ? 'pending' : a.status === 'approved' ? 'approved' : 'rejected'} label={a.status === 'pending' ? 'બાકી' : a.status === 'approved' ? 'મંજૂર' : 'નકારેલ'} />
                    </span>
                  </div>
                ))}
                {(detail.approvals || []).length === 0 && <p className="text-xs text-slate-500">કોઈ મંજૂરી સ્તર નથી</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!decide} onClose={() => setDecide(null)} size="sm"
        title={decide?.decision === 'approved' ? 'રજા મંજૂર કરો' : 'રજા નકારો'}
        subtitle={decide ? `${decide.employee?.firstName} ${decide.employee?.lastName} · ${decide.totalDays} દિવસ` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDecide(null)}>રદ</Button>
            <Button variant={decide?.decision === 'approved' ? 'success' : 'danger'} loading={decideMutation.isPending}
              disabled={decide?.decision === 'rejected' && comment.length < 3}
              onClick={() => decideMutation.mutate({ id: decide._id, decision: decide.decision, comment })}>પુષ્ટિ કરો</Button>
          </>
        )}
      >
        <Textarea label={decide?.decision === 'rejected' ? 'નકારવાનું કારણ (ફરજિયાત)' : 'ટિપ્પણી (વૈકલ્પિક)'} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </div>
  );
}

function Info({ label: l, value }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
      <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
