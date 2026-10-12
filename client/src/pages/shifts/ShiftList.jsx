import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Moon, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { shiftApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Pagination, SearchInput, Select, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { daysOfWeek } from '../../lib/utils';

const emptyForm = {
  name: '', code: '', startTime: '09:30', endTime: '18:30', breakMinutes: 60, graceMinutes: 15,
  weeklyOffs: [0, 6], isNightShift: false, rotational: false, isActive: true, description: '',
};

export default function ShiftList() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useList(['shifts'], shiftApi.list, { limit: 20 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirm, setConfirm] = useState(null);
  const [assignShift, setAssignShift] = useState(null);
  const [assignDept, setAssignDept] = useState('');

  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }) });

  const save = useMutation({
    mutationFn: (payload) => (editing ? shiftApi.update(editing._id, payload) : shiftApi.create(payload)),
    onSuccess: () => {
      toast.success(editing ? 'શિફ્ટ અપડેટ થઈ' : 'નવી શિફ્ટ ઉમેરાઈ');
      qc.invalidateQueries({ queryKey: ['shifts'] });
      setFormOpen(false); setEditing(null); setForm(emptyForm);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id) => shiftApi.remove(id),
    onSuccess: () => { toast.success('શિફ્ટ દૂર કરાઈ'); qc.invalidateQueries({ queryKey: ['shifts'] }); setConfirm(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const assign = useMutation({
    mutationFn: ({ id, employeeIds, departmentId }) => shiftApi.assign(id, { employeeIds, departmentId }),
    onSuccess: (res) => {
      toast.success(res?.message || 'શિફ્ટ સોંપાઈ');
      setAssignShift(null); setAssignDept('');
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleDay = (day) => setForm((f) => ({
    ...f,
    weeklyOffs: f.weeklyOffs.includes(day) ? f.weeklyOffs.filter((d) => d !== day) : [...f.weeklyOffs, day].sort(),
  }));

  return (
    <div>
      <PageHeader
        title="શિફ્ટ મેનેજમેન્ટ"
        subtitle="કાર્ય સમય, બ્રેક, ગ્રેસ પીરિયડ અને સાપ્તાહિક રજા"
        actions={can('shifts:create') && (
          <Button icon={Plus} onClick={() => { setEditing(null); setForm(emptyForm); setFormOpen(true); }}>નવી શિફ્ટ</Button>
        )}
      />

      <Card>
        <CardHeader title="શિફ્ટ યાદી" icon={Clock} action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="શિફ્ટ શોધો…" className="w-full sm:w-64" />} />
        {list.isLoading ? <TableSkeleton rows={5} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : list.rows.length === 0 ? (
          <EmptyState title="કોઈ શિફ્ટ નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">શિફ્ટ</th><th className="th">સમય</th><th className="th">કલાક</th>
                  <th className="th">બ્રેક / ગ્રેસ</th><th className="th">સાપ્તાહિક રજા</th><th className="th">પ્રકાર</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((s) => (
                  <tr key={s._id} className="row">
                    <td className="td">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.code || '—'}</p>
                    </td>
                    <td className="td font-mono text-xs">{s.startTime} – {s.endTime}</td>
                    <td className="td">{s.durationHours ?? '—'}</td>
                    <td className="td">{s.breakMinutes ?? 0} મિ · {s.graceMinutes ?? 0} મિ</td>
                    <td className="td text-xs">{(s.weeklyOffs || []).map((d) => daysOfWeek[d]).join(', ') || '—'}</td>
                    <td className="td">
                      <div className="flex gap-1">
                        {s.isNightShift && <Badge value="night" label="નાઇટ" icon={Moon} />}
                        <Badge value={s.isActive === false ? 'inactive' : 'active'} />
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        {can('shifts:update') && <button className="btn-ghost btn-xs" title="કર્મચારીને સોંપો" onClick={() => setAssignShift(s)}><Users className="h-3.5 w-3.5" /></button>}
                        {can('shifts:update') && (
                          <button className="btn-ghost btn-xs" onClick={() => {
                            setEditing(s);
                            setForm({ ...emptyForm, ...s, weeklyOffs: s.weeklyOffs || [] });
                            setFormOpen(true);
                          }}><Pencil className="h-3.5 w-3.5" /></button>
                        )}
                        {can('shifts:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirm(s)}><Trash2 className="h-3.5 w-3.5" /></button>}
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

      <Modal
        open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'શિફ્ટ સંપાદિત કરો' : 'નવી શિફ્ટ'}
        footer={<><Button variant="secondary" onClick={() => setFormOpen(false)}>રદ</Button><Button loading={save.isPending} onClick={() => save.mutate(form)}>{editing ? 'અપડેટ' : 'ઉમેરો'}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="શિફ્ટનું નામ" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="જનરલ શિફ્ટ" />
          <Input label="કોડ" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="GEN" />
          <Input label="શરૂ સમય (HH:MM)" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} placeholder="09:30" />
          <Input label="સમાપ્તિ સમય (HH:MM)" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} placeholder="18:30" />
          <Input label="બ્રેક (મિનિટ)" type="number" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })} />
          <Input label="ગ્રેસ પીરિયડ (મિનિટ)" type="number" value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: Number(e.target.value) })} />
          <div className="sm:col-span-2">
            <label className="label">સાપ્તાહિક રજા</label>
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map((d, i) => (
                <button
                  key={d} type="button" onClick={() => toggleDay(i)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${form.weeklyOffs.includes(i) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                >{d}</button>
              ))}
            </div>
          </div>
          <Checkbox label="નાઇટ શિફ્ટ છે" checked={form.isNightShift} onChange={(e) => setForm({ ...form, isNightShift: e.target.checked })} />
          <Checkbox label="રોટેશનલ શિફ્ટ" checked={form.rotational} onChange={(e) => setForm({ ...form, rotational: e.target.checked })} />
          <div className="sm:col-span-2"><Textarea label="વર્ણન" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal
        open={!!assignShift} onClose={() => setAssignShift(null)} size="sm"
        title="શિફ્ટ સોંપો" subtitle={assignShift?.name}
        footer={<><Button variant="secondary" onClick={() => setAssignShift(null)}>રદ</Button><Button loading={assign.isPending} disabled={!assignDept} onClick={() => assign.mutate({ id: assignShift._id, departmentId: assignDept })}>સોંપો</Button></>}
      >
        <Select
          label="ડિપાર્ટમેન્ટના બધા કર્મચારીને સોંપો" placeholder="ડિપાર્ટમેન્ટ પસંદ કરો"
          options={(employees?.data || []).reduce((acc, e) => {
            const d = e.department;
            if (d && !acc.find((x) => x.value === (d._id || d))) acc.push({ value: d._id || d, label: d.name || 'Department' });
            return acc;
          }, [])}
          value={assignDept} onChange={(e) => setAssignDept(e.target.value)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm} title="શિફ્ટ દૂર કરો?"
        message={confirm ? `«${confirm.name}» દૂર કરવામાં આવશે.` : ''}
        loading={remove.isPending} onClose={() => setConfirm(null)} onConfirm={() => remove.mutate(confirm._id)}
      />
    </div>
  );
}
