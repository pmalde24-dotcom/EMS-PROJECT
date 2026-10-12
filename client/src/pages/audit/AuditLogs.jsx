
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Fingerprint, Info, ScrollText, ShieldCheck } from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { auditApi } from '../../api/endpoints';
import { useList } from '../../hooks/useList';
import { Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, Pagination, SearchInput, Select, Skeleton, StatCard, TableSkeleton, TableWrap } from '../../components/ui';
import { chartColors } from '../../hooks/useList';
import { fmtDateTime, label } from '../../lib/utils';

const AXIS = { stroke: '#94a3b8', fontSize: 12 };
const TOOLTIP = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 } };

const SEVERITY_TONE = { info: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', critical: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' };

export default function AuditLogs() {
  const list = useList(['audit'], auditApi.list, { limit: 25, sort: '-at' });
  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ['audit', 'stats'], queryFn: auditApi.stats });

  const rows = list.rows || [];
  const s = stats?.data || {};

  return (
    <div>
      <PageHeader
        title="ઓડિટ લોગ"
        subtitle="દરેક મહત્વપૂર્ણ ક્રિયાનો અપરિવર્તનીય રેકોર્ડ (ફક્ત વાંચવા માટે)"
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ એન્ટ્રી" value={list.meta?.total ?? '—'} icon={ScrollText} tone="brand" />
        <StatCard label="ક્રિટિકલ" value={(s.bySeverity || []).find((x) => x._id === 'critical')?.count ?? 0} icon={AlertTriangle} tone="rose" />
        <StatCard label="ચેતવણી" value={(s.bySeverity || []).find((x) => x._id === 'warning')?.count ?? 0} icon={Info} tone="amber" />
        <StatCard label="મોડ્યુલ" value={(s.byModule || []).length} icon={Activity} tone="violet" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="દૈનિક પ્રવૃત્તિ" subtitle="છેલ્લા દિવસોની એન્ટ્રી" icon={Activity} />
          {statsLoading ? <Skeleton className="m-4 h-56" /> : (
            <div className="px-2 py-4 sm:px-4" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.byDay || []}>
                  <defs>
                    <linearGradient id="auditFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} />
                  <YAxis tick={AXIS} />
                  <Tooltip {...TOOLTIP} />
                  <Area type="monotone" dataKey="count" stroke="#4f46e5" fill="url(#auditFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="મોડ્યુલ મુજબ" icon={ShieldCheck} />
          {statsLoading ? <Skeleton className="m-4 h-56" /> : (
            <div className="px-2 py-4 sm:px-4" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={(s.byModule || []).slice(0, 8).map((m) => ({ name: label(m._id), value: m.count }))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {(s.byModule || []).slice(0, 8).map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="ઓડિટ એન્ટ્રીઓ" subtitle={list.meta ? `કુલ ${list.meta.total} એન્ટ્રી` : ''} icon={Fingerprint}
          action={(
            <div className="flex flex-wrap gap-2">
              <SearchInput value={list.searchInput} onChange={list.setSearchInput} onSubmit={list.submitSearch} placeholder="ક્રિયા / વર્ણન શોધો…" className="w-full sm:w-56" />
              <Input wrapperClassName="w-40" type="date" value={list.params.from || ''} onChange={(e) => list.patch({ from: e.target.value || undefined })} />
              <Select wrapperClassName="w-40" placeholder="સિવિયરિટી" options={['info', 'warning', 'critical'].map((x) => ({ value: x, label: label(x) }))} value={list.params.severity || ''} onChange={(e) => list.patch({ severity: e.target.value || undefined })} />
              <Select wrapperClassName="w-40" placeholder="મોડ્યુલ" options={(s.byModule || []).map((m) => ({ value: m._id, label: label(m._id) }))} value={list.params.module || ''} onChange={(e) => list.patch({ module: e.target.value || undefined })} />
            </div>
          )}
        />
        {list.isLoading ? <TableSkeleton rows={10} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ ઓડિટ એન્ટ્રી નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">સમય</th><th className="th">કરનાર</th><th className="th">ક્રિયા</th><th className="th">મોડ્યુલ</th><th className="th">વર્ણન</th><th className="th">સિવિયરિટી</th></tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l._id} className="row">
                    <td className="td text-xs">{fmtDateTime(l.at || l.createdAt)}</td>
                    <td className="td text-xs">{l.actorName || '—'}<span className="block text-slate-400">{label(l.actorRole || '')}</span></td>
                    <td className="td text-xs font-medium">{label(l.action)}</td>
                    <td className="td text-xs">{label(l.module)}</td>
                    <td className="td max-w-md whitespace-normal text-xs text-slate-600 dark:text-slate-300">{l.description || '—'}</td>
                    <td className="td">
                      <span className={`badge ${SEVERITY_TONE[l.severity] || SEVERITY_TONE.info}`}>{label(l.severity)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={list.meta} onPage={list.setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
