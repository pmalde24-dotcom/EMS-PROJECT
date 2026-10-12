import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar, CalendarOff, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { holidayApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Pagination, SearchInput, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { fmtDate, label, monthName } from '../../lib/utils';

const TYPES = [
  { value: 'public', label: 'જાહેર' }, { value: 'regional', label: 'પ્રાદેશિક' },
  { value: 'company', label: 'કંપની' }, { value: 'optional', label: 'વૈકલ્પિક' },
  { value: 'restricted', label: 'મર્યાદિત' },
];

export default function HolidayList() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const year = new Date().getFullYear();
  const list = useList(['holidays'], holidayApi.list, { year, limit: 50 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', date: '', type: 'public', description: '', region: '', isRecurring: false, isActive: true });

  const { data: calendar } = useQuery({ queryKey: ['holidays', 'calendar', year], queryFn: () => holidayApi.calendar(year) });

  const save = useMutation({
    mutationFn: (payload) => (editing ? holidayApi.update(editing._id, payload) : holidayApi.create(payload)),
    onSuccess: () => {
      toast.success(editing ? 'તહેવાર અપડેટ થયો' : 'નવો તહેવાર ઉમેરાયો');
      qc.invalidateQueries({ queryKey: ['holidays'] });
      setFormOpen(false); setEditing(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id) => holidayApi.remove(id),
    onSuccess: () => { toast.success('તહેવાર દૂર કરાયો'); qc.invalidateQueries({ queryKey: ['holidays'] }); setConfirm(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const items = calendar?.data || list.rows;
  const upcoming = items.filter((h) => new Date(h.date) >= new Date(new Date().toDateString()));
  const byMonth = items.reduce((acc, h) => {
    const m = new Date(h.date).getMonth() + 1;
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="તહેવારો અને રજાઓ"
        subtitle={`${year} વર્ષનું તહેવાર કેલેન્ડર`}
        actions={(
          <>
            {can('holidays:export') && <a href={`/api/holidays?export=csv&year=${year}`} className="btn-secondary"><Download className="h-4 w-4" /> CSV</a>}
            {can('holidays:create') && <Button icon={Plus} onClick={() => { setEditing(null); setForm({ name: '', date: '', type: 'public', description: '', region: '', isRecurring: false, isActive: true }); setFormOpen(true); }}>નવો તહેવાર</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={`${year} ના કુલ તહેવારો`} value={items.length} icon={CalendarOff} tone="brand" />
        <StatCard label="આવનારા તહેવારો" value={upcoming.length} sub={upcoming[0] ? `આગળ: ${upcoming[0].name} — ${fmtDate(upcoming[0].date)}` : ''} icon={Calendar} tone="emerald" />
        <StatCard label="સૌથી વધુ તહેવારોનો મહિનો" value={monthName(Number(Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0]?.[0] || 1)) || '—'} icon={Calendar} tone="violet" />
      </div>

      <Card>
        <CardHeader
          title="તહેવાર યાદી" icon={CalendarOff}
          action={(
            <div className="flex flex-wrap gap-2">
              <SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="તહેવાર શોધો…" className="w-full sm:w-56" />
              <Select
                wrapperClassName="w-36" placeholder={`વર્ષ ${year}`}
                options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
                value={String(list.params.year || year)}
                onChange={(e) => list.patch({ year: Number(e.target.value) })}
              />
            </div>
          )}
        />
        {list.isLoading ? <TableSkeleton rows={8} cols={5} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : items.length === 0 ? (
          <EmptyState title="કોઈ તહેવાર નોંધાયો નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">તહેવાર</th><th className="th">તારીખ</th><th className="th">વાર</th>
                  <th className="th">પ્રકાર</th><th className="th">પ્રદેશ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((h) => {
                  const past = new Date(h.date) < new Date(new Date().toDateString());
                  return (
                    <tr key={h._id} className={`row ${past ? 'opacity-60' : ''}`}>
                      <td className="td">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{h.name}</p>
                        {h.description && <p className="max-w-xs truncate text-xs text-slate-500">{h.description}</p>}
                      </td>
                      <td className="td">{fmtDate(h.date)}</td>
                      <td className="td text-slate-500">{new Date(h.date).toLocaleDateString('gu-IN', { weekday: 'long' })}</td>
                      <td className="td"><Badge value={h.type} label={label(h.type)} /></td>
                      <td className="td">{h.region || 'બધા'}</td>
                      <td className="td">
                        <div className="flex gap-1">
                          <Badge value={h.isActive === false ? 'inactive' : 'active'} />
                          {h.isRecurring && <Badge value="recurring" label="દર વર્ષે" tone="bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300" />}
                        </div>
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          {can('holidays:update') && (
                            <button className="btn-ghost btn-xs" onClick={() => {
                              setEditing(h);
                              setForm({ name: h.name, date: new Date(h.date).toISOString().slice(0, 10), type: h.type || 'public', description: h.description || '', region: h.region || '', isRecurring: !!h.isRecurring, isActive: h.isActive !== false });
                              setFormOpen(true);
                            }}><Pencil className="h-3.5 w-3.5" /></button>
                          )}
                          {can('holidays:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirm(h)}><Trash2 className="h-3.5 w-3.5" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination meta={calendar ? null : list.meta} onPage={list.setPage} />
          </>
        )}
      </Card>

      <Modal
        open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'તહેવાર સંપાદિત કરો' : 'નવો તહેવાર'}
        footer={<><Button variant="secondary" onClick={() => setFormOpen(false)}>રદ</Button><Button loading={save.isPending} disabled={!form.name || !form.date} onClick={() => save.mutate(form)}>{editing ? 'અપડેટ' : 'ઉમેરો'}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="તહેવારનું નામ" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="દિવાળી" />
          <Input label="તારીખ" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label="પ્રકાર" options={TYPES} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          <Input label="પ્રદેશ (વૈકલ્પિક)" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Gujarat" />
          <div className="flex items-center gap-6 sm:col-span-2">
            <Checkbox label="દર વર્ષે પુનરાવર્તિત" checked={form.isRecurring} onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })} />
            <Checkbox label="સક્રિય" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          </div>
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm} title="તહેવાર દૂર કરો?"
        message={confirm ? `«${confirm.name}» (${fmtDate(confirm.date)}) દૂર કરવામાં આવશે.` : ''}
        loading={remove.isPending} onClose={() => setConfirm(null)} onConfirm={() => remove.mutate(confirm._id)}
      />
    </div>
  );
}
