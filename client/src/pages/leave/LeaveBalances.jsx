import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Edit3, Scale, Users } from 'lucide-react';
import { leaveApi, leaveTypeApi, departmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Avatar, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Progress, Select,
  StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';

export default function LeaveBalances() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [department, setDepartment] = useState('');
  const [adjusting, setAdjusting] = useState(null);
  const [form, setForm] = useState({ allocated: 0, used: 0, reason: '' });

  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });
  const { data: types } = useQuery({ queryKey: ['leave', 'types', 'all'], queryFn: () => leaveTypeApi.list({ limit: 50 }) });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['leave', 'balances', year, department],
    queryFn: () => leaveApi.balances({ year, department: department || undefined, limit: 500 }),
  });

  const adjust = useMutation({
    mutationFn: (payload) => leaveApi.adjustBalance(payload),
    onSuccess: () => { toast.success('બેલેન્સ સુધારાયું'); qc.invalidateQueries({ queryKey: ['leave'] }); setAdjusting(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const allocate = useMutation({
    mutationFn: () => leaveApi.allocate({ year, carryForward: true }),
    onSuccess: (res) => { toast.success(res?.message || 'ફાળવણી પૂર્ણ'); qc.invalidateQueries({ queryKey: ['leave'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = data?.data || [];
  const totalAllocated = rows.reduce((s, r) => s + (r.allocated || 0), 0);
  const totalUsed = rows.reduce((s, r) => s + (r.used || 0), 0);
  const employees = new Set(rows.map((r) => r.employee?._id)).size;

  return (
    <div>
      <PageHeader
        title="રજા બેલેન્સ"
        subtitle="કર્મચારી મુજબ ફાળવેલ, વપરાયેલ અને ઉપલબ્ધ રજા"
        actions={(
          <>
            <a href={`/api/leave/balances?export=csv&year=${year}`} className="btn-secondary"><Download className="h-4 w-4" /> CSV</a>
            {can('leave:update') && <Button loading={allocate.isPending} onClick={() => allocate.mutate()}>ફાળવણી ચલાવો</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="કર્મચારી" value={employees} sub={`${rows.length} બેલેન્સ રેકોર્ડ`} icon={Users} tone="brand" />
        <StatCard label="કુલ ફાળવેલ દિવસ" value={totalAllocated} icon={Scale} tone="violet" />
        <StatCard label="કુલ વપરાયેલ દિવસ" value={totalUsed} sub={totalAllocated ? `${Math.round((totalUsed / totalAllocated) * 100)}% વપરાશ` : ''} icon={Scale} tone="amber" />
      </div>

      <Card>
        <CardHeader
          title="બેલેન્સ રેકોર્ડ" icon={Scale}
          action={(
            <div className="flex flex-wrap gap-2">
              <Select wrapperClassName="w-32" options={[2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }))} value={String(year)} onChange={(e) => setYear(Number(e.target.value))} />
              <Select wrapperClassName="w-52" placeholder="બધા ડિપાર્ટમેન્ટ" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
          )}
        />

        {isLoading ? <TableSkeleton rows={8} cols={7} /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ બેલેન્સ રેકોર્ડ નથી" message="«ફાળવણી ચલાવો» બટન દબાવીને આ વર્ષની રજાઓ ફાળવો." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="th">કર્મચારી</th><th className="th">પ્રકાર</th><th className="th">ફાળવેલ</th><th className="th">વપરાયેલ</th>
                <th className="th">બાકી (પેન્ડિંગ)</th><th className="th">ઉપલબ્ધ</th><th className="th">વપરાશ</th><th className="th text-right">ક્રિયાઓ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="row">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={`${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`} size="xs" />
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
                  <td className="td">{r.allocated ?? 0}</td>
                  <td className="td">{r.used ?? 0}</td>
                  <td className="td">{r.pending ?? 0}</td>
                  <td className="td font-semibold text-brand-700 dark:text-brand-300">{r.available ?? 0}</td>
                  <td className="td"><Progress value={r.allocated ? ((r.used || 0) / r.allocated) * 100 : 0} showLabel className="min-w-32" /></td>
                  <td className="td text-right">
                    {can('leave:update') && (
                      <button className="btn-ghost btn-xs" onClick={() => { setAdjusting(r); setForm({ allocated: r.allocated || 0, used: r.used || 0, reason: '' }); }}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={!!adjusting} onClose={() => setAdjusting(null)} size="sm"
        title="બેલેન્સ સુધારો"
        subtitle={adjusting ? `${adjusting.employee?.firstName} ${adjusting.employee?.lastName} · ${adjusting.leaveType?.name}` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAdjusting(null)}>રદ</Button>
            <Button
              loading={adjust.isPending}
              disabled={!form.reason}
              onClick={() => adjust.mutate({ employeeId: adjusting.employee?._id || adjusting.employee, leaveTypeId: adjusting.leaveType?._id || adjusting.leaveType, year, allocated: Number(form.allocated), used: Number(form.used), reason: form.reason })}
            >સાચવો</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="ફાળવેલ દિવસ" type="number" value={form.allocated} onChange={(e) => setForm({ ...form, allocated: e.target.value })} />
            <Input label="વપરાયેલ દિવસ" type="number" value={form.used} onChange={(e) => setForm({ ...form, used: e.target.value })} />
          </div>
          <Textarea label="કારણ (ફરજિયાત)" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="ઉદા: HR દ્વારા મેન્યુઅલ સમાયોજન…" />
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            દરેક સુધારો ઓડિટ લોગમાં નોંધાય છે.
          </p>
        </div>
      </Modal>
    </div>
  );
}
