import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, CheckCircle2, ClipboardList, Plus, Target, TrendingUp } from 'lucide-react';
import { performanceApi, departmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination, SearchInput, Select, StatCard, TableSkeleton, TableWrap } from '../../components/ui';
import { fmtDate, label } from '../../lib/utils';

export default function ReviewList() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['performance', 'reviews'], performanceApi.reviews, { limit: 20, sort: '-createdAt' });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cycle: '', cycleType: 'annual', periodStart: '', periodEnd: '', templateId: '', department: '' });

  const { data: summary } = useQuery({ queryKey: ['performance', 'summary'], queryFn: () => performanceApi.report({}) });
  const { data: templates } = useQuery({ queryKey: ['performance', 'templates'], queryFn: performanceApi.templates, enabled: open });
  const { data: departments } = useQuery({ queryKey: ['departments', 'options'], queryFn: () => departmentApi.list({ limit: 100 }), enabled: open });
  const { data: plans } = useQuery({ queryKey: ['performance', 'plans'], queryFn: performanceApi.plans });

  const bulk = useMutation({
    mutationFn: (payload) => performanceApi.createReviews(payload),
    onSuccess: (res) => {
      toast.success(res.message || 'સમીક્ષા ચક્ર શરૂ થયું');
      qc.invalidateQueries({ queryKey: ['performance'] });
      setOpen(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows || [];
  const s = summary?.data || {};

  return (
    <div>
      <PageHeader
        title="કામગીરી સમીક્ષા"
        subtitle="સમીક્ષા ચક્ર બનાવો, મૂલ્યાંકન ટ્રેક કરો અને રિલીઝ કરો"
        actions={(
          <>
            <Link to="/performance/my-reviews" className="btn-secondary">મારી સમીક્ષા</Link>
            {can('performance:create') && <Button icon={Plus} onClick={() => setOpen(true)}>નવું ચક્ર બનાવો</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ સમીક્ષા" value={(s.byStatus || []).reduce((a, x) => a + x.count, 0)} icon={ClipboardList} tone="brand" />
        <StatCard label="મૂલ્યાંકન બાકી" value={(s.byStatus || []).filter((x) => ['self_pending', 'manager_pending', 'hr_pending'].includes(x._id)).reduce((a, x) => a + x.count, 0)} icon={Target} tone="amber" />
        <StatCard label="પૂર્ણ / રિલીઝ" value={(s.byStatus || []).filter((x) => ['completed', 'released'].includes(x._id)).reduce((a, x) => a + x.count, 0)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="પ્રમોશન લાયક" value={s.promotionReady ?? 0} sub={`સરેરાશ રેટિંગ ${s.goalsStats?.avgProgress ? '' : ''}`} icon={Award} tone="violet" />
      </div>

      <Card>
        <CardHeader
          title="સમીક્ષા યાદી" subtitle={list.meta ? `કુલ ${list.meta.total} રેકોર્ડ` : ''} icon={ClipboardList}
          action={(
            <div className="flex flex-wrap gap-2">
              <SearchInput value={list.searchInput} onChange={list.setSearchInput} onSubmit={list.submitSearch} placeholder="ચક્ર શોધો…" className="w-full sm:w-52" />
              <Select wrapperClassName="w-40" placeholder="સ્થિતિ" options={['draft', 'self_pending', 'manager_pending', 'hr_pending', 'completed', 'released', 'cancelled'].map((x) => ({ value: x, label: label(x) }))} value={list.params.status || ''} onChange={(e) => list.patch({ status: e.target.value || undefined })} />
              <Select wrapperClassName="w-40" placeholder="પ્રકાર" options={['quarterly', 'half_yearly', 'annual', 'probation', 'special'].map((x) => ({ value: x, label: label(x) }))} value={list.params.cycleType || ''} onChange={(e) => list.patch({ cycleType: e.target.value || undefined })} />
            </div>
          )}
        />
        {list.isLoading ? <TableSkeleton rows={8} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ સમીક્ષા નથી" message="«નવું ચક્ર બનાવો» દબાવીને સમીક્ષા ચક્ર શરૂ કરો." />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">કર્મચારી</th><th className="th">ચક્ર</th><th className="th">સમીક્ષક</th><th className="th">સ્વ-રેટિંગ</th><th className="th">મેનેજર રેટિંગ</th><th className="th">અંતિમ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="row">
                    <td className="td">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{r.employee?.firstName} {r.employee?.lastName}</span>
                      <p className="text-xs text-slate-400">{r.employee?.employeeId}</p>
                    </td>
                    <td className="td text-xs">{r.cycle}<span className="block text-slate-400">{label(r.cycleType)}</span></td>
                    <td className="td text-xs">{r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : '—'}</td>
                    <td className="td">{r.selfAssessment?.overallSelfRating || '—'}</td>
                    <td className="td">{r.managerAssessment?.overallRating || '—'}</td>
                    <td className="td font-semibold">{r.finalRating || '—'}</td>
                    <td className="td"><Badge value={r.status} /></td>
                    <td className="td text-right"><Link to={`/performance/reviews/${r._id}`} className="btn-ghost btn-xs">જુઓ</Link></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={list.meta} onPage={list.setPage} />
          </>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="કામગીરી સુધારણા યોજનાઓ" subtitle={`${(plans?.data || []).length} યોજના`} icon={TrendingUp} />
        <TableWrap>
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr><th className="th">કર્મચારી</th><th className="th">પ્રકાર</th><th className="th">શીર્ષક</th><th className="th">સમયગાળો</th><th className="th">સ્થિતિ</th></tr>
          </thead>
          <tbody>
            {(plans?.data || []).map((p) => (
              <tr key={p._id} className="row">
                <td className="td">{p.employee?.firstName} {p.employee?.lastName}</td>
                <td className="td text-xs">{label(p.type)}</td>
                <td className="td">{p.title || p.reason}</td>
                <td className="td text-xs">{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</td>
                <td className="td"><Badge value={p.status} /></td>
              </tr>
            ))}
            {(plans?.data || []).length === 0 && <tr><td className="td" colSpan={5}><EmptyState title="કોઈ યોજના નથી" /></td></tr>}
          </tbody>
        </TableWrap>
      </Card>

      <Modal
        open={open} onClose={() => setOpen(false)} title="નવું સમીક્ષા ચક્ર"
        subtitle="પસંદ કરેલા ડિપાર્ટમેન્ટના બધા સક્રિય કર્મચારીઓ માટે સમીક્ષા બનાવાશે"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={bulk.isPending} disabled={!form.cycle} onClick={() => bulk.mutate({ ...form, templateId: form.templateId || undefined, department: form.department || undefined, periodStart: form.periodStart || undefined, periodEnd: form.periodEnd || undefined })}>ચક્ર શરૂ કરો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="ચક્રનું નામ" required placeholder="FY2026-H2" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })} />
          <Select label="પ્રકાર" options={['quarterly', 'half_yearly', 'annual', 'probation', 'special'].map((x) => ({ value: x, label: label(x) }))} value={form.cycleType} onChange={(e) => setForm({ ...form, cycleType: e.target.value })} />
          <Input label="સમયગાળો શરૂ" type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
          <Input label="સમયગાળો અંત" type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
          <Select label="ટેમ્પલેટ" placeholder="ડિફોલ્ટ" options={(templates?.data || []).map((t) => ({ value: t._id, label: t.name }))} value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })} />
          <Select label="ડિપાર્ટમેન્ટ" placeholder="બધા" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
