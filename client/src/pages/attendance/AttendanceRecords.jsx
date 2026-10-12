import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarCheck, ClipboardCheck, Download, Filter, Pencil, RefreshCw, Timer, TrendingUp } from 'lucide-react';
import { attendanceApi, departmentApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination,
  SearchInput, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateInput, fmtTime, hours, label, monthName } from '../../lib/utils';

const STATUS_OPTIONS = ['present', 'absent', 'half_day', 'late', 'early_exit', 'on_leave', 'holiday', 'weekly_off', 'work_from_home', 'od']
  .map((s) => ({ value: s, label: label(s) }));

export default function AttendanceRecords() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const list = useList(['attendance', 'records'], attendanceApi.list, { limit: 20, sort: '-date' });

  const [adjustOpen, setAdjustOpen] = useState(null);
  const [adjust, setAdjust] = useState({ checkIn: '', checkOut: '', status: 'present', note: '' });
  const [deptReport, setDeptReport] = useState(false);

  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300 }) });
  const { data: deptData, isLoading: deptLoading } = useQuery({
    queryKey: ['attendance', 'reports', 'department', year, month],
    queryFn: () => attendanceApi.departmentReport({ year, month }),
    enabled: deptReport,
  });

  const adjustMutation = useMutation({
    mutationFn: (payload) => attendanceApi.adjust(payload),
    onSuccess: () => {
      toast.success('હાજરી સુધારાઈ');
      qc.invalidateQueries({ queryKey: ['attendance'] });
      setAdjustOpen(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const markAbsent = useMutation({
    mutationFn: (body) => attendanceApi.markAbsent(body),
    onSuccess: (res) => { toast.success(res?.message || `ગેરહાજર નોંધાયા: ${res?.data?.markedAbsent ?? 0}`); qc.invalidateQueries({ queryKey: ['attendance'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const openAdjust = (row) => {
    setAdjustOpen(row);
    setAdjust({
      checkIn: row.checkIn ? row.checkIn.slice(0, 16) : '',
      checkOut: row.checkOut ? row.checkOut.slice(0, 16) : '',
      status: row.status || 'present',
      note: '',
    });
  };

  const rows = list.rows;
  const presentToday = rows.filter((r) => ['present', 'late', 'work_from_home', 'early_exit'].includes(r.status)).length;
  const totalOt = rows.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
  const avgWorked = rows.length ? Math.round(rows.reduce((s, r) => s + (r.workedMinutes || 0), 0) / rows.length) : 0;

  return (
    <div>
      <PageHeader
        title="હાજરી રેકોર્ડ"
        subtitle="તમામ કર્મચારીઓની હાજરી — ફિલ્ટર, સુધારો અને રિપોર્ટ"
        actions={(
          <>
            <a href={`/api/attendance?export=csv&limit=2000&from=${year}-${String(month).padStart(2, '0')}-01`} className="btn-secondary"><Download className="h-4 w-4" /> CSV</a>
            {can('attendance:update') && (
              <Button variant="secondary" icon={RefreshCw} loading={markAbsent.isPending} onClick={() => markAbsent.mutate({ date: fmtDateInput() })}>
                આજની ગેરહાજરી માર્ક કરો
              </Button>
            )}
            <Button variant={deptReport ? 'primary' : 'secondary'} icon={TrendingUp} onClick={() => setDeptReport((v) => !v)}>ડિપાર્ટમેન્ટ રિપોર્ટ</Button>
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="રેકોર્ડ (પેજ)" value={list.meta?.total ?? '—'} icon={CalendarCheck} tone="brand" />
        <StatCard label="આ પેજ પર હાજર" value={presentToday} icon={ClipboardCheck} tone="emerald" />
        <StatCard label="સરેરાશ કામ સમય" value={hours(avgWorked)} icon={Timer} tone="violet" />
        <StatCard label="કુલ ઓવરટાઇમ (પેજ)" value={hours(totalOt)} icon={TrendingUp} tone="amber" />
      </div>

      {deptReport && (
        <Card className="mb-4">
          <CardHeader
            title="ડિપાર્ટમેન્ટ મુજબ હાજરી" subtitle={`${monthName(month)} ${year}`} icon={TrendingUp}
            action={<span className="text-xs text-slate-500">{deptData?.data?.summary ? `કુલ ${deptData.data.summary.totalRecords} રેકોર્ડ` : ''}</span>}
          />
          {deptLoading ? <TableSkeleton rows={5} cols={6} /> : (
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">ડિપાર્ટમેન્ટ</th><th className="th">કુલ રેકોર્ડ</th><th className="th">હાજર</th>
                  <th className="th">ગેરહાજર</th><th className="th">રજા</th><th className="th">મોડા</th><th className="th">હાજરી %</th>
                </tr>
              </thead>
              <tbody>
                {(deptData?.data?.rows || []).map((r) => (
                  <tr key={r.department || r.name} className="row">
                    <td className="td font-medium">{r.department || r.name}</td>
                    <td className="td">{r.total ?? r.records}</td>
                    <td className="td">{r.present}</td>
                    <td className="td text-rose-600">{r.absent}</td>
                    <td className="td text-amber-600">{r.onLeave ?? 0}</td>
                    <td className="td">{r.late ?? 0}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.percent ?? r.attendancePercent ?? 0}%</span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <span className="block h-full bg-brand-600" style={{ width: `${r.percent ?? r.attendancePercent ?? 0}%` }} />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {(deptData?.data?.rows || []).length === 0 && <tr><td className="td" colSpan={7}><EmptyState /></td></tr>}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      <Card>
        <CardHeader
          title="રેકોર્ડ યાદી" icon={Filter}
          action={(
            <form onSubmit={list.submitSearch} className="flex flex-wrap gap-2">
              <SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="કર્મચારી શોધો…" className="w-full sm:w-56" />
              <Button type="submit" variant="secondary" size="xs">શોધો</Button>
            </form>
          )}
        />

        <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Select
            wrapperClassName="w-full sm:w-52" placeholder="બધા કર્મચારી"
            options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` }))}
            value={list.params.employee || ''} onChange={(e) => list.patch({ employee: e.target.value || undefined })}
          />
          <Select
            wrapperClassName="w-full sm:w-48" placeholder="બધા ડિપાર્ટમેન્ટ"
            options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))}
            value={list.params.department || ''} onChange={(e) => list.patch({ department: e.target.value || undefined })}
          />
          <Select
            wrapperClassName="w-full sm:w-44" placeholder="બધી સ્થિતિ" options={STATUS_OPTIONS}
            value={list.params.status || ''} onChange={(e) => list.patch({ status: e.target.value || undefined })}
          />
          <Input wrapperClassName="w-full sm:w-40" type="date" value={list.params.from || ''} onChange={(e) => list.patch({ from: e.target.value || undefined })} />
          <Input wrapperClassName="w-full sm:w-40" type="date" value={list.params.to || ''} onChange={(e) => list.patch({ to: e.target.value || undefined })} />
        </div>

        {list.isLoading ? <TableSkeleton rows={8} cols={7} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ હાજરી રેકોર્ડ મળ્યો નથી" message="તારીખ શ્રેણી કે ફિલ્ટર બદલો." />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">કર્મચારી</th><th className="th">તારીખ</th><th className="th">ઇન</th><th className="th">આઉટ</th>
                  <th className="th">કામ</th><th className="th">મોડું/OT</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
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
                    <td className="td">{fmtDate(r.date)}</td>
                    <td className="td">{r.checkIn ? fmtTime(r.checkIn) : '—'}</td>
                    <td className="td">{r.checkOut ? fmtTime(r.checkOut) : '—'}</td>
                    <td className="td">{r.workedMinutes ? hours(r.workedMinutes) : '—'}</td>
                    <td className="td text-xs">
                      {r.lateMinutes ? <span className="text-amber-600">{r.lateMinutes} મિ મોડું</span> : null}
                      {r.overtimeMinutes ? <span className="ml-1 text-brand-600">{r.overtimeMinutes} મિ OT</span> : null}
                      {!r.lateMinutes && !r.overtimeMinutes ? '—' : null}
                    </td>
                    <td className="td">
                      <div className="flex flex-col items-start gap-1">
                        <Badge value={r.status} />
                        {r.corrections?.some((c) => c.status === 'pending') && <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">સુધારો બાકી</span>}
                      </div>
                    </td>
                    <td className="td text-right">
                      {can('attendance:update') && <button className="btn-ghost btn-xs" onClick={() => openAdjust(r)}><Pencil className="h-3.5 w-3.5" /></button>}
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
        open={!!adjustOpen} onClose={() => setAdjustOpen(null)} size="sm"
        title="હાજરી સુધારો" subtitle={adjustOpen ? `${adjustOpen.employee?.firstName} ${adjustOpen.employee?.lastName} · ${fmtDate(adjustOpen.date)}` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAdjustOpen(null)}>રદ</Button>
            <Button
              loading={adjustMutation.isPending}
              onClick={() => adjustMutation.mutate({
                attendanceId: adjustOpen._id,
                checkIn: adjust.checkIn ? new Date(adjust.checkIn).toISOString() : undefined,
                checkOut: adjust.checkOut ? new Date(adjust.checkOut).toISOString() : undefined,
                status: adjust.status,
                note: adjust.note || 'Manual adjustment by admin',
              })}
            >સાચવો</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input label="પંચ-ઇન" type="datetime-local" value={adjust.checkIn} onChange={(e) => setAdjust({ ...adjust, checkIn: e.target.value })} />
          <Input label="પંચ-આઉટ" type="datetime-local" value={adjust.checkOut} onChange={(e) => setAdjust({ ...adjust, checkOut: e.target.value })} />
          <Select label="સ્થિતિ" options={STATUS_OPTIONS} value={adjust.status} onChange={(e) => setAdjust({ ...adjust, status: e.target.value })} />
          <Textarea label="કારણ" rows={2} value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
