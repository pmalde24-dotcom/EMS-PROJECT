import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Boxes, Plus, RotateCcw, ShieldCheck, Trash2, UserPlus, Wrench } from 'lucide-react';
import { assetApi, employeeApi, departmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Pagination, SearchInput, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { currency, fmtDate, fmtDateInput, label } from '../../lib/utils';

const CATEGORIES = ['laptop', 'desktop', 'monitor', 'mobile', 'tablet', 'keyboard', 'mouse', 'headset', 'printer', 'access_card', 'sim_card', 'furniture', 'vehicle', 'network_device', 'software_license', 'other'];
const CONDITIONS = ['new', 'good', 'fair', 'poor', 'damaged'];

export default function AssetRegister() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useList(['assets'], assetApi.list, { limit: 20, sort: '-createdAt' });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [returnFor, setReturnFor] = useState(null);
  const [maintFor, setMaintFor] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [assign, setAssign] = useState({ employeeId: '', expectedReturnDate: '', conditionAtAssignment: 'good', note: '' });
  const [form, setForm] = useState(emptyAsset());

  const { data: stats } = useQuery({ queryKey: ['assets', 'stats'], queryFn: assetApi.stats });
  const { data: detailData } = useQuery({ queryKey: ['asset', detail?._id], queryFn: () => assetApi.get(detail._id), enabled: !!detail });
  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }), enabled: !!assignFor });
  const { data: departments } = useQuery({ queryKey: ['departments', 'options'], queryFn: () => departmentApi.list({ limit: 100 }), enabled: open });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['assets'] });

  const save = useMutation({
    mutationFn: (payload) => (editing ? assetApi.update(editing._id, payload) : assetApi.create(payload)),
    onSuccess: () => { toast.success(editing ? 'સંપત્તિ અપડેટ થઈ' : 'સંપત્તિ નોંધાઈ'); invalidate(); setOpen(false); setEditing(null); setForm(emptyAsset()); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const assignMut = useMutation({
    mutationFn: ({ id, payload }) => assetApi.assign(id, payload),
    onSuccess: () => { toast.success('સંપત્તિ સોંપાઈ'); invalidate(); setAssignFor(null); setAssign({ employeeId: '', expectedReturnDate: '', conditionAtAssignment: 'good', note: '' }); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const returnMut = useMutation({
    mutationFn: (payload) => assetApi.returnAsset(returnFor.assignmentId, payload),
    onSuccess: () => { toast.success('સંપત્તિ પરત મળી'); invalidate(); setReturnFor(null); setDetail(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const maintMut = useMutation({
    mutationFn: (payload) => assetApi.maintenance(maintFor._id, payload),
    onSuccess: () => { toast.success('મેન્ટેનન્સ નોંધાયું'); invalidate(); setMaintFor(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id) => assetApi.remove(id),
    onSuccess: () => { toast.success('સંપત્તિ રિટાયર થઈ'); invalidate(); setConfirmDel(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows || [];
  const s = stats?.data || {};

  function openEdit(a) {
    setEditing(a);
    setForm({
      name: a.name, assetId: a.assetId, category: a.category, brand: a.brand || '', model: a.model || '', serialNumber: a.serialNumber || '',
      imei: a.imei || '', specifications: a.specifications || '', purchaseDate: a.purchaseDate ? a.purchaseDate.slice(0, 10) : '',
      purchasePrice: a.purchasePrice || 0, vendor: a.vendor || '', warrantyExpiry: a.warrantyExpiry ? a.warrantyExpiry.slice(0, 10) : '',
      condition: a.condition || 'good', status: a.status, location: a.location || '', department: a.department?._id || a.department || '',
      accessories: (a.accessories || []).join(', '), notes: a.notes || '', isReturnable: a.isReturnable !== false,
    });
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="સંપત્તિ રજિસ્ટર"
        subtitle="કંપનીની સંપત્તિ, સોંપણી, વોરંટી અને મેન્ટેનન્સ"
        actions={(
          <>
            <a href="/api/assets?export=csv" className="btn-secondary">CSV એક્સપોર્ટ</a>
            {can('assets:create') && <Button icon={Plus} onClick={() => { setEditing(null); setForm(emptyAsset()); setOpen(true); }}>નવી સંપત્તિ</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ સંપત્તિ" value={s.totalAssets ?? rows.length} icon={Boxes} tone="brand" />
        <StatCard label="કુલ મૂલ્ય" value={currency(s.totalValue || 0)} icon={ShieldCheck} tone="emerald" />
        <StatCard label="વોરંટી નજીક છે" value={s.expiringWarranty ?? 0} sub="60 દિવસમાં" icon={AlertTriangle} tone="amber" />
        <StatCard label="મેન્ટેનન્સમાં" value={s.inMaintenance ?? 0} icon={Wrench} tone="rose" />
      </div>

      <Card>
        <CardHeader
          title="સંપત્તિ યાદી" subtitle={list.meta ? `કુલ ${list.meta.total} સંપત્તિ` : ''} icon={Boxes}
          action={(
            <div className="flex flex-wrap gap-2">
              <SearchInput value={list.searchInput} onChange={list.setSearchInput} onSubmit={list.submitSearch} placeholder="નામ / સીરિયલ / બ્રાન્ડ…" className="w-full sm:w-56" />
              <Select wrapperClassName="w-40" placeholder="કેટેગરી" options={CATEGORIES.map((x) => ({ value: x, label: label(x) }))} value={list.params.category || ''} onChange={(e) => list.patch({ category: e.target.value || undefined })} />
              <Select wrapperClassName="w-40" placeholder="સ્થિતિ" options={['available', 'assigned', 'maintenance', 'retired', 'lost', 'damaged'].map((x) => ({ value: x, label: label(x) }))} value={list.params.status || ''} onChange={(e) => list.patch({ status: e.target.value || undefined })} />
            </div>
          )}
        />
        {list.isLoading ? <TableSkeleton rows={8} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ સંપત્તિ નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">સંપત્તિ</th><th className="th">કેટેગરી</th><th className="th">ધારક</th><th className="th">ખરીદ / વોરંટી</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a._id} className="row">
                    <td className="td">
                      <button className="text-left font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100" onClick={() => setDetail(a)}>{a.name}</button>
                      <p className="text-xs text-slate-400">{a.assetId} · {a.brand || '—'} {a.model || ''}</p>
                    </td>
                    <td className="td text-xs">{label(a.category)}<span className="block text-slate-400">{label(a.condition)}</span></td>
                    <td className="td text-xs">{a.currentHolder ? `${a.currentHolder.firstName} ${a.currentHolder.lastName}` : <span className="text-slate-400">ઉપલબ્ધ</span>}{a.department?.name ? <span className="block text-slate-400">{a.department.name}</span> : null}</td>
                    <td className="td text-xs">{fmtDate(a.purchaseDate)}<span className={`block ${a.warrantyExpiry && new Date(a.warrantyExpiry) < new Date() ? 'text-rose-500' : 'text-slate-400'}`}>વોરંટી: {fmtDate(a.warrantyExpiry)}</span></td>
                    <td className="td"><Badge value={a.status} /></td>
                    <td className="td">
                      <div className="flex flex-wrap justify-end gap-1">
                        {can('assets:update') && a.status === 'available' && <Button size="xs" variant="secondary" icon={UserPlus} onClick={() => setAssignFor(a)}>સોંપો</Button>}
                        {a.status === 'assigned' && <Button size="xs" variant="secondary" icon={RotateCcw} onClick={() => setDetail(a)}>ધારક વિગત / પરત</Button>}
                        {can('assets:update') && <Button size="xs" variant="ghost" icon={Wrench} onClick={() => setMaintFor(a)}>મેન્ટેનન્સ</Button>}
                        {can('assets:update') && <button className="btn-ghost btn-xs" onClick={() => openEdit(a)}>સંપાદિત</button>}
                        {can('assets:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirmDel(a)}><Trash2 className="h-3.5 w-3.5" /></button>}
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

      {/* Create / edit asset */}
      <Modal
        open={open} onClose={() => { setOpen(false); setEditing(null); }} size="lg" title={editing ? 'સંપત્તિ સંપાદિત કરો' : 'નવી સંપત્તિ નોંધો'}
        footer={<><Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); }}>રદ</Button><Button loading={save.isPending} disabled={!form.name || !form.category} onClick={() => save.mutate({ ...form, purchasePrice: Number(form.purchasePrice || 0), assetId: form.assetId || undefined, purchaseDate: form.purchaseDate || undefined, warrantyExpiry: form.warrantyExpiry || undefined, department: form.department || null, accessories: form.accessories.split(',').map((x) => x.trim()).filter(Boolean) })}>સાચવો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="નામ" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="સંપત્તિ ID" placeholder="સ્વયં બનશે" value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} />
          <Select label="કેટેગરી" required options={CATEGORIES.map((x) => ({ value: x, label: label(x) }))} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Select label="સ્થિતિ" options={['available', 'maintenance', 'retired', 'lost', 'damaged'].map((x) => ({ value: x, label: label(x) }))} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <Input label="બ્રાન્ડ" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <Input label="મોડલ" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <Input label="સીરિયલ નંબર" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          <Input label="IMEI" value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} />
          <Input label="ખરીદ તારીખ" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
          <Input label="ખરીદ કિંમત (₹)" type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
          <Input label="વેન્ડર" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          <Input label="વોરંટી સમાપ્તિ" type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} />
          <Select label="ડિપાર્ટમેન્ટ" placeholder="કોઈ નહીં" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <Input label="સ્થળ" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Input label="એક્સેસરીઝ (કોમાથી)" wrapperClassName="sm:col-span-2" value={form.accessories} onChange={(e) => setForm({ ...form, accessories: e.target.value })} />
          <Textarea label="સ્પેસિફિકેશન / નોંધ" wrapperClassName="sm:col-span-2" rows={2} value={form.specifications} onChange={(e) => setForm({ ...form, specifications: e.target.value })} />
          <Checkbox label="પરત કરવા યોગ્ય" checked={form.isReturnable} onChange={(e) => setForm({ ...form, isReturnable: e.target.checked })} />
        </div>
      </Modal>

      {/* Asset detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.name} subtitle={detail?.assetId}>
        <div className="space-y-4">
          {detail && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Info l="કેટેગરી" v={label(detail.category)} />
              <Info l="સ્થિતિ" v={label(detail.status)} />
              <Info l="કન્ડિશન" v={label(detail.condition)} />
              <Info l="ખરીદ કિંમત" v={currency(detail.purchasePrice || 0)} />
              <Info l="વોરંટી" v={fmtDate(detail.warrantyExpiry)} />
              <Info l="સ્થળ" v={detail.location || '—'} />
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">સોંપણી ઇતિહાસ</p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {(detailData?.data?.history || []).map((h) => (
                <div key={h._id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{h.employee?.firstName} {h.employee?.lastName}</p>
                    <p className="text-xs text-slate-400">{fmtDate(h.assignedAt)} → {h.returnedAt ? fmtDate(h.returnedAt) : 'ચાલુ'}{h.acknowledgement?.signed ? ' · સ્વીકૃતિ' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge value={h.status} />
                    {h.status === 'assigned' && can('assets:update') && (
                      <Button size="xs" variant="secondary" onClick={() => setReturnFor({ asset: detail, assignmentId: h._id })}>પરત લો</Button>
                    )}
                  </div>
                </div>
              ))}
              {!(detailData?.data?.history || []).length && <div className="px-3 py-3"><EmptyState title="ઇતિહાસ ખાલી છે" /></div>}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">મેન્ટેનન્સ રેકોર્ડ</p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {(detailData?.data?.maintenance || []).map((m) => (
                <div key={m._id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{label(m.type)}</p>
                    <p className="text-xs text-slate-400">{fmtDate(m.reportedAt)} · {m.description || ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium">{currency(m.cost || 0)}</p>
                    <Badge value={m.status} />
                  </div>
                </div>
              ))}
              {!(detailData?.data?.maintenance || []).length && <div className="px-3 py-3"><EmptyState title="મેન્ટેનન્સ રેકોર્ડ નથી" /></div>}
            </div>
          </div>
        </div>
      </Modal>

      {/* Assign */}
      <Modal
        open={!!assignFor} onClose={() => setAssignFor(null)} size="sm" title="સંપત્તિ સોંપો" subtitle={assignFor?.name}
        footer={<><Button variant="secondary" onClick={() => setAssignFor(null)}>રદ</Button><Button loading={assignMut.isPending} disabled={!assign.employeeId} onClick={() => assignMut.mutate({ id: assignFor._id, payload: { ...assign, expectedReturnDate: assign.expectedReturnDate || undefined } })}>સોંપો</Button></>}
      >
        <div className="space-y-4">
          <Select label="કર્મચારી" required placeholder="પસંદ કરો" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` }))} value={assign.employeeId} onChange={(e) => setAssign({ ...assign, employeeId: e.target.value })} />
          <Input label="પરત તારીખ (વૈકલ્પિક)" type="date" value={assign.expectedReturnDate} onChange={(e) => setAssign({ ...assign, expectedReturnDate: e.target.value })} />
          <Select label="સોંપણી સમયે કન્ડિશન" options={CONDITIONS.map((x) => ({ value: x, label: label(x) }))} value={assign.conditionAtAssignment} onChange={(e) => setAssign({ ...assign, conditionAtAssignment: e.target.value })} />
          <Textarea label="નોંધ" rows={2} value={assign.note} onChange={(e) => setAssign({ ...assign, note: e.target.value })} />
        </div>
      </Modal>

      {/* Return */}
      <Modal
        open={!!returnFor} onClose={() => setReturnFor(null)} size="sm" title="સંપત્તિ પરત લો" subtitle={returnFor?.asset?.name}
        footer={<><Button variant="secondary" onClick={() => setReturnFor(null)}>રદ</Button><Button loading={returnMut.isPending} onClick={() => returnMut.mutate(returnFor.payload)}>પરત લો</Button></>}
      >
        {returnFor && (
          <ReturnForm init={returnFor} onChange={(p) => setReturnFor({ ...returnFor, payload: p })} />
        )}
      </Modal>

      {/* Maintenance */}
      <Modal
        open={!!maintFor} onClose={() => setMaintFor(null)} size="sm" title="મેન્ટેનન્સ નોંધાવો" subtitle={maintFor?.name}
        footer={<><Button variant="secondary" onClick={() => setMaintFor(null)}>રદ</Button><Button loading={maintMut.isPending} onClick={() => maintMut.mutate(maintFor.payload || { type: 'service', description: 'Scheduled service', cost: 0, vendor: '', status: 'in_progress' })}>નોંધાવો</Button></>}
      >
        {maintFor && <MaintForm onChange={(p) => setMaintFor({ ...maintFor, payload: p })} />}
      </Modal>

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={() => remove.mutate(confirmDel._id)} loading={remove.isPending}
        title="સંપત્તિ રિટાયર કરવી?" message={confirmDel ? `${confirmDel.name} (${confirmDel.assetId}) રિટાયર કરવામાં આવશે.` : ''}
      />
    </div>
  );
}

function ReturnForm({ init, onChange }) {
  const [v, setV] = useState({ conditionAtReturn: 'good', returnNotes: '', damage: null });
  return (
    <div className="space-y-4">
      <Select label="પરત સમયે કન્ડિશન" options={CONDITIONS.map((x) => ({ value: x, label: label(x) }))} value={v.conditionAtReturn} onChange={(e) => { const n = { ...v, conditionAtReturn: e.target.value }; setV(n); onChange(n); }} />
      <Textarea label="નોંધ" rows={2} value={v.returnNotes} onChange={(e) => { const n = { ...v, returnNotes: e.target.value }; setV(n); onChange(n); }} />
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={!!v.damage} onChange={(e) => { const n = { ...v, damage: e.target.checked ? { description: '', cost: 0, recoveredFromEmployee: false } : null }; setV(n); onChange(n); }} />
        નુકસાન નોંધાવો
      </label>
      {v.damage && (
        <div className="space-y-3 rounded-lg border border-rose-200 p-3 dark:border-rose-500/40">
          <Textarea label="નુકસાન વર્ણન" required rows={2} value={v.damage.description} onChange={(e) => { const n = { ...v, damage: { ...v.damage, description: e.target.value } }; setV(n); onChange(n); }} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="અંદાજિત ખર્ચ (₹)" type="number" value={v.damage.cost} onChange={(e) => { const n = { ...v, damage: { ...v.damage, cost: Number(e.target.value) } }; setV(n); onChange(n); }} />
            <label className="mt-6 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={v.damage.recoveredFromEmployee} onChange={(e) => { const n = { ...v, damage: { ...v.damage, recoveredFromEmployee: e.target.checked } }; setV(n); onChange(n); }} />
              કર્મચારી પાસેથી વસૂલ
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function MaintForm({ onChange }) {
  const [v, setV] = useState({ type: 'service', description: '', cost: 0, vendor: '', status: 'in_progress', scheduledDate: fmtDateInput() });
  const set = (n) => { setV(n); onChange(n); };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select label="પ્રકાર" options={['repair', 'service', 'upgrade', 'inspection', 'replacement'].map((x) => ({ value: x, label: label(x) }))} value={v.type} onChange={(e) => set({ ...v, type: e.target.value })} />
      <Select label="સ્થિતિ" options={['scheduled', 'in_progress', 'completed', 'cancelled'].map((x) => ({ value: x, label: label(x) }))} value={v.status} onChange={(e) => set({ ...v, status: e.target.value })} />
      <Input label="તારીખ" type="date" value={v.scheduledDate} onChange={(e) => set({ ...v, scheduledDate: e.target.value })} />
      <Input label="ખર્ચ (₹)" type="number" value={v.cost} onChange={(e) => set({ ...v, cost: Number(e.target.value) })} />
      <Input label="વેન્ડર" wrapperClassName="sm:col-span-2" value={v.vendor} onChange={(e) => set({ ...v, vendor: e.target.value })} />
      <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2" rows={2} value={v.description} onChange={(e) => set({ ...v, description: e.target.value })} />
    </div>
  );
}

function emptyAsset() {
  return { name: '', assetId: '', category: 'laptop', brand: '', model: '', serialNumber: '', imei: '', specifications: '', purchaseDate: '', purchasePrice: 0, vendor: '', warrantyExpiry: '', condition: 'good', status: 'available', location: '', department: '', accessories: '', notes: '', isReturnable: true };
}

function Info({ l, v }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{v}</p>
    </div>
  );
}
