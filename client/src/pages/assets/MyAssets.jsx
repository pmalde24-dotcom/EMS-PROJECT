import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Boxes, CheckCircle2, Package, ShieldCheck } from 'lucide-react';
import { assetApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import {
  Badge as BadgeUI, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, TableWrap,
} from '../../components/ui';
import { currency, fmtDate, label } from '../../lib/utils';

export default function MyAssets() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['assets', 'my-assets'], queryFn: assetApi.myAssets });

  const ack = useMutation({
    mutationFn: (assignmentId) => assetApi.acknowledge(assignmentId),
    onSuccess: () => { toast.success('સ્વીકૃતિ નોંધાઈ'); qc.invalidateQueries({ queryKey: ['assets'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = data?.data || [];
  const active = rows.filter((r) => r.status === 'assigned');
  const value = active.reduce((s, r) => s + (r.asset?.purchasePrice || 0), 0);
  const pending = active.filter((r) => !r.acknowledgement?.signed);

  return (
    <div>
      <PageHeader title="મારી સંપત્તિ" subtitle="તમને સોંપાયેલી કંપનીની સંપત્તિ, સ્વીકૃતિ અને ઇતિહાસ" />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="હાલની સંપત્તિ" value={active.length} icon={Boxes} tone="brand" />
        <StatCard label="કુલ મૂલ્ય" value={currency(value)} icon={ShieldCheck} tone="emerald" />
        <StatCard label="સ્વીકૃતિ બાકી" value={pending.length} icon={Package} tone="amber" />
        <StatCard label="પરત કરેલી" value={rows.length - active.length} icon={CheckCircle2} tone="violet" />
      </div>

      <Card>
        <CardHeader title="સોંપાયેલી સંપત્તિ" subtitle={`${rows.length} રેકોર્ડ`} icon={Boxes} />
        {isLoading ? <Skeleton className="m-4 h-40" /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="તમને કોઈ સંપત્તિ સોંપાઈ નથી" />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">સંપત્તિ</th><th className="th">કેટેગરી</th><th className="th">સોંપાઈ</th><th className="th">અપેક્ષિત પરત</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="row">
                  <td className="td">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{r.asset?.name || '—'}</p>
                    <p className="text-xs text-slate-400">{r.asset?.assetId} · {r.asset?.brand} {r.asset?.model}</p>
                  </td>
                  <td className="td text-xs">{label(r.asset?.category)}</td>
                  <td className="td text-xs">{fmtDate(r.assignedAt)}</td>
                  <td className="td text-xs">{r.expectedReturnDate ? fmtDate(r.expectedReturnDate) : '—'}</td>
                  <td className="td">
                    <BadgeUI value={r.status} />
                    {r.acknowledgement?.signed
                      ? <p className="mt-0.5 text-[11px] text-emerald-600">સ્વીકૃતિ {fmtDate(r.acknowledgement.signedAt)}</p>
                      : <p className="mt-0.5 text-[11px] text-amber-600">સ્વીકૃતિ બાકી</p>}
                  </td>
                  <td className="td text-right">
                    {r.status === 'assigned' && !r.acknowledgement?.signed && (
                      <Button size="xs" variant="success" loading={ack.isPending} onClick={() => ack.mutate(r._id)}>સ્વીકૃતિ આપો</Button>
                    )}
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
