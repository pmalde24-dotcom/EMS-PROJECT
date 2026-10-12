import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Award, ClipboardList, Target, TrendingUp } from 'lucide-react';
import { performanceApi } from '../../api/endpoints';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, TableWrap } from '../../components/ui';
import { fmtDate, label } from '../../lib/utils';

export default function MyReviews() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['performance', 'reviews', 'mine'], queryFn: () => performanceApi.reviews({ mine: 'true', limit: 50 }) });
  const { data: goals } = useQuery({ queryKey: ['performance', 'goals', 'mine'], queryFn: () => performanceApi.goals({ mine: 'true' }) });

  const rows = data?.data || [];
  const goalRows = goals?.data || [];
  const released = rows.filter((r) => r.status === 'released');
  const avg = released.length ? (released.reduce((s, r) => s + (r.finalRating || 0), 0) / released.length).toFixed(1) : '—';
  const latest = released[0];
  const goalAvg = goalRows.length ? Math.round(goalRows.reduce((s, g) => s + (g.progressPercent || 0), 0) / goalRows.length) : 0;

  return (
    <div>
      <PageHeader
        title="મારી કામગીરી સમીક્ષા"
        subtitle="સ્વ-મૂલ્યાંકન ભરો, મેનેજર મૂલ્યાંકન જુઓ અને લક્ષ્યો ટ્રેક કરો"
        actions={<Link to="/performance/goals" className="btn-secondary">મારા લક્ષ્યો</Link>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ સમીક્ષા" value={rows.length} icon={ClipboardList} tone="brand" />
        <StatCard label="રિલીઝ થયેલી" value={released.length} icon={Award} tone="emerald" />
        <StatCard label="સરેરાશ રેટિંગ" value={avg === '—' ? '—' : `${avg} / 5`} icon={TrendingUp} tone="violet" />
        <StatCard label="લક્ષ્ય પ્રગતિ" value={`${goalAvg}%`} sub={`${goalRows.length} લક્ષ્ય`} icon={Target} tone="amber" />
      </div>

      {latest && (
        <Card className="mb-4">
          <CardHeader title={`તાજેતરની રિલીઝ — ${latest.cycle}`} subtitle={`અંતિમ રેટિંગ: ${latest.finalRating || '—'} / 5`} icon={Award} />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <Box l="મેનેજર રેટિંગ" v={latest.managerAssessment?.overallRating || '—'} />
            <Box l="સ્વ-રેટિંગ" v={latest.selfAssessment?.overallSelfRating || '—'} />
            <Box l="કુલ વધારો" v={latest.hikePercent ? `${latest.hikePercent}%` : '—'} />
          </div>
          {latest.finalComments && <p className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-300">{latest.finalComments}</p>}
        </Card>
      )}

      <Card>
        <CardHeader title="મારી સમીક્ષાઓ" subtitle={`${rows.length} રેકોર્ડ`} icon={ClipboardList} />
        {isLoading ? <Skeleton className="m-4 h-40" /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ સમીક્ષા નથી" message="તમારા HR તરફથી સમીક્ષા ચક્ર શરૂ થાય પછી અહીં દેખાશે." />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">ચક્ર</th><th className="th">પ્રકાર</th><th className="th">સમીક્ષક</th><th className="th">અંતિમ રેટિંગ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="row">
                  <td className="td font-medium">{r.cycle}<span className="block text-xs text-slate-400">{fmtDate(r.periodStart)} → {fmtDate(r.periodEnd)}</span></td>
                  <td className="td">{label(r.cycleType)}</td>
                  <td className="td text-xs">{r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : '—'}</td>
                  <td className="td">{r.finalRating ? `${r.finalRating} / 5` : '—'}</td>
                  <td className="td"><Badge value={r.status} /></td>
                  <td className="td text-right">
                    <Link to={`/performance/reviews/${r._id}`} className="btn-ghost btn-xs">
                      {r.status === 'self_pending' ? 'સ્વ-મૂલ્યાંકન ભરો' : 'જુઓ'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

function Box({ l, v }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-200">{v}</p>
    </div>
  );
}
