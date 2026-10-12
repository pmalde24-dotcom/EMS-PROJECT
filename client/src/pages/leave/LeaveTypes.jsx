import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { leaveTypeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Pagination, SearchInput, Select, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';

const empty = {
  name: '', code: '', description: '', annualQuota: 12, accrualType: 'yearly', paid: true, carryForward: false,
  maxCarryForward: 0, encashable: false, allowHalfDay: true, requiresDocument: false, requiresDocumentAfterDays: 3,
  maxConsecutiveDays: 15, minNoticeDays: 0, maxPerMonth: 0, genderRestriction: 'none', approvalLevels: 1,
  color: '#4f46e5', isActive: true,
};

export default function LeaveTypes() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useList(['leave', 'types'], leaveTypeApi.list, { limit: 50 });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [confirm, setConfirm] = useState(null);

  const save = useMutation({
    mutationFn: (payload) => (editing ? leaveTypeApi.update(editing._id, payload) : leaveTypeApi.create(payload)),
    onSuccess: () => {
      toast.success(editing ? 'રજા પ્રકાર અપડેટ થયો' : 'નવો રજા પ્રકાર ઉમેરાયો');
      qc.invalidateQueries({ queryKey: ['leave', 'types'] });
      setOpen(false); setEditing(null); setForm(empty);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id) => leaveTypeApi.remove(id),
    onSuccess: () => { toast.success('રજા પ્રકાર નિષ્ક્રિય કરાયો'); qc.invalidateQueries({ queryKey: ['leave', 'types'] }); setConfirm(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const allocate = useMutation({
    mutationFn: () => leaveRequestAllocate(),
    onSuccess: (res) => toast.success(res?.message || 'વાર્ષિક ફાળવણી પૂર્ણ'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function leaveRequestAllocate() {
    const { leaveApi } = await import('../../api/endpoints');
    return leaveApi.allocate({ year: new Date().getFullYear(), carryForward: true });
  }

  const openEdit = (t) => {
    setEditing(t);
    setForm({ ...empty, ...t });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="રજા પ્રકારો અને પોલિસી"
        subtitle="ફાળવણી, મંજૂરી સ્તર, દસ્તાવેજ નિયમ અને રંગ કોડ"
        actions={(
          <>
            {can('leave:update') && <Button variant="secondary" loading={allocate.isPending} onClick={() => allocate.mutate()}>વાર્ષિક ફાળવણી ચલાવો</Button>}
            {can('leave:update') && <Button icon={Plus} onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}>નવો પ્રકાર</Button>}
          </>
        )}
      />

      <Card>
        <CardHeader title="રજા પ્રકારો" icon={CalendarOff} action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="શોધો…" className="w-full sm:w-64" />} />
        {list.isLoading ? <TableSkeleton rows={5} cols={7} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : list.rows.length === 0 ? (
          <EmptyState title="કોઈ રજા પ્રકાર નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">પ્રકાર</th><th className="th">કોડ</th><th className="th">વાર્ષિક ક્વોટા</th><th className="th">ઉપાર્જન</th>
                  <th className="th">નિયમો</th><th className="th">મંજૂરી સ્તર</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((t) => (
                  <tr key={t._id} className="row">
                    <td className="td">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: t.color || '#4f46e5' }} />
                        <span>
                          <span className="block font-medium text-slate-800 dark:text-slate-100">{t.name}</span>
                          <span className="block text-xs text-slate-500">{t.paid ? 'વેતન સાથે' : 'અવેતન'}</span>
                        </span>
                      </span>
                    </td>
                    <td className="td font-mono text-xs">{t.code}</td>
                    <td className="td">{t.annualQuota} દિવસ</td>
                    <td className="td text-xs">
                      {t.accrualType === 'yearly' ? 'વાર્ષિક' : t.accrualType === 'monthly' ? 'માસિક' : t.accrualType === 'quarterly' ? 'ત્રૈમાસિક' : 'નહીં'}
                      {t.carryForward && <span className="block text-emerald-600">કેરી ફોરવર્ડ ({t.maxCarryForward})</span>}
                    </td>
                    <td className="td text-xs">
                      <div className="flex flex-wrap gap-1">
                        {t.allowHalfDay && <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">અડધો દિવસ</span>}
                        {t.requiresDocument && <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">દસ્તાવેજ</span>}
                        {t.encashable && <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">એનકેશ</span>}
                        {t.genderRestriction !== 'none' && <span className="badge bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{t.genderRestriction}</span>}
                      </div>
                    </td>
                    <td className="td">{t.approvalLevels || 1} સ્તર</td>
                    <td className="td"><Badge value={t.isActive === false ? 'inactive' : 'active'} /></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        {can('leave:update') && <button className="btn-ghost btn-xs" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></button>}
                        {can('leave:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirm(t)}><Trash2 className="h-3.5 w-3.5" /></button>}
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
        open={open} onClose={() => setOpen(false)} size="lg"
        title={editing ? 'રજા પ્રકાર સંપાદિત કરો' : 'નવો રજા પ્રકાર'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={save.isPending} disabled={!form.name || !form.code} onClick={() => save.mutate(form)}>{editing ? 'અપડેટ' : 'ઉમેરો'}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="નામ" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="કેઝ્યુઅલ લીવ" />
          <Input label="કોડ" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CL" />
          <Input label="વાર્ષિક ક્વોટા (દિવસ)" type="number" value={form.annualQuota} onChange={(e) => setForm({ ...form, annualQuota: Number(e.target.value) })} />
          <Select label="ઉપાર્જન પ્રકાર" options={[{ value: 'yearly', label: 'વાર્ષિક' }, { value: 'monthly', label: 'માસિક' }, { value: 'quarterly', label: 'ત્રૈમાસિક' }, { value: 'none', label: 'કોઈ નહીં' }]} value={form.accrualType} onChange={(e) => setForm({ ...form, accrualType: e.target.value })} />
          <Input label="મંજૂરી સ્તર" type="number" min={1} max={3} value={form.approvalLevels} onChange={(e) => setForm({ ...form, approvalLevels: Number(e.target.value) })} />
          <Input label="રંગ" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 p-1" />
          <Input label="ન્યૂનતમ નોટિસ (દિવસ)" type="number" value={form.minNoticeDays} onChange={(e) => setForm({ ...form, minNoticeDays: Number(e.target.value) })} />
          <Input label="મહત્તમ સતત દિવસ" type="number" value={form.maxConsecutiveDays} onChange={(e) => setForm({ ...form, maxConsecutiveDays: Number(e.target.value) })} />
          <Input label="મહિનામાં મહત્તમ" type="number" value={form.maxPerMonth} onChange={(e) => setForm({ ...form, maxPerMonth: Number(e.target.value) })} />
          <Select label="જાતિ મર્યાદા" options={[{ value: 'none', label: 'બધા માટે' }, { value: 'male', label: 'પુરુષ' }, { value: 'female', label: 'સ્ત્રી' }]} value={form.genderRestriction} onChange={(e) => setForm({ ...form, genderRestriction: e.target.value })} />
          <Input label="દસ્તાવેજ કેટલા દિવસ પછી" type="number" value={form.requiresDocumentAfterDays} onChange={(e) => setForm({ ...form, requiresDocumentAfterDays: Number(e.target.value) })} />
          <Input label="મહત્તમ કેરી ફોરવર્ડ" type="number" value={form.maxCarryForward} onChange={(e) => setForm({ ...form, maxCarryForward: Number(e.target.value) })} />
          <div className="grid gap-2 sm:col-span-2 lg:col-span-3 sm:grid-cols-3">
            <Checkbox label="વેતન સાથે" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} />
            <Checkbox label="કેરી ફોરવર્ડ" checked={form.carryForward} onChange={(e) => setForm({ ...form, carryForward: e.target.checked })} />
            <Checkbox label="એનકેશમેન્ટ" checked={form.encashable} onChange={(e) => setForm({ ...form, encashable: e.target.checked })} />
            <Checkbox label="અડધો દિવસ માન્ય" checked={form.allowHalfDay} onChange={(e) => setForm({ ...form, allowHalfDay: e.target.checked })} />
            <Checkbox label="દસ્તાવેજ જરૂરી" checked={form.requiresDocument} onChange={(e) => setForm({ ...form, requiresDocument: e.target.checked })} />
            <Checkbox label="સક્રિય" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          </div>
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2 lg:col-span-3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm} title="રજા પ્રકાર નિષ્ક્રિય કરો?"
        message={confirm ? `«${confirm.name}» નિષ્ક્રિય થશે — નવી અરજીઓ સ્વીકારાશે નહીં, પણ જૂના રેકોર્ડ સચવાશે.` : ''}
        loading={remove.isPending} onClose={() => setConfirm(null)} onConfirm={() => remove.mutate(confirm._id)}
      />
    </div>
  );
}
