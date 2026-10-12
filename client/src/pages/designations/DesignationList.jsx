import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { designationApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Pagination, SearchInput, Select, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { currency } from '../../lib/utils';

const emptyForm = { title: '', code: '', level: '', jobLevel: '', minSalary: '', maxSalary: '', description: '', isActive: true };

const LEVELS = [
  { value: 'junior', label: 'જુનિયર' }, { value: 'mid', label: 'મિડ' },
  { value: 'senior', label: 'સિનિયર' }, { value: 'lead', label: 'લીડ' },
  { value: 'manager', label: 'મેનેજર' }, { value: 'director', label: 'ડિરેક્ટર' },
];

export default function DesignationList() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useList(['designations'], designationApi.list, { limit: 20 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirm, setConfirm] = useState(null);

  const save = useMutation({
    mutationFn: (payload) => (editing ? designationApi.update(editing._id, payload) : designationApi.create(payload)),
    onSuccess: () => {
      toast.success(editing ? 'હોદ્દો અપડેટ થયો' : 'નવો હોદ્દો ઉમેરાયો');
      qc.invalidateQueries({ queryKey: ['designations'] });
      setFormOpen(false); setEditing(null); setForm(emptyForm);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id) => designationApi.remove(id),
    onSuccess: () => { toast.success('હોદ્દો આર્કાઇવ થયો'); qc.invalidateQueries({ queryKey: ['designations'] }); setConfirm(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const openEdit = (d) => {
    setEditing(d);
    setForm({
      title: d.title || '', code: d.code || '', level: d.level || '', jobLevel: d.jobLevel || '',
      minSalary: d.minSalary ?? '', maxSalary: d.maxSalary ?? '', description: d.description || '', isActive: d.isActive !== false,
    });
    setFormOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="હોદ્દા અને ગ્રેડ"
        subtitle="પદો, લેવલ અને પગાર શ્રેણીનું સંચાલન"
        actions={can('designations:create') && <Button icon={Plus} onClick={() => { setEditing(null); setForm(emptyForm); setFormOpen(true); }}>નવો હોદ્દો</Button>}
      />

      <Card>
        <CardHeader title="હોદ્દા યાદી" icon={BadgeCheck} action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="હોદ્દો શોધો…" className="w-full sm:w-64" />} />
        {list.isLoading ? <TableSkeleton rows={6} cols={5} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : list.rows.length === 0 ? (
          <EmptyState title="કોઈ હોદ્દો નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">હોદ્દો</th><th className="th">કોડ</th><th className="th">લેવલ</th>
                  <th className="th">પગાર શ્રેણી</th><th className="th">કર્મચારી</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((d) => (
                  <tr key={d._id} className="row">
                    <td className="td">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{d.title}</p>
                      <p className="max-w-xs truncate text-xs text-slate-500">{d.description || '—'}</p>
                    </td>
                    <td className="td font-mono text-xs">{d.code || '—'}</td>
                    <td className="td"><span className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{d.level || d.jobLevel || '—'}</span></td>
                    <td className="td">{d.minSalary || d.maxSalary ? `${currency(d.minSalary)} – ${currency(d.maxSalary)}` : '—'}</td>
                    <td className="td">{d.employeeCount ?? '—'}</td>
                    <td className="td"><Badge value={d.isActive === false ? 'inactive' : 'active'} /></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        {can('designations:update') && <button className="btn-ghost btn-xs" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></button>}
                        {can('designations:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirm(d)}><Trash2 className="h-3.5 w-3.5" /></button>}
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
        open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'હોદ્દો સંપાદિત કરો' : 'નવો હોદ્દો'}
        footer={<><Button variant="secondary" onClick={() => setFormOpen(false)}>રદ</Button><Button loading={save.isPending} onClick={() => save.mutate(form)}>{editing ? 'અપડેટ' : 'ઉમેરો'}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="હોદ્દાનું નામ" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label="કોડ" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <Select label="લેવલ" placeholder="પસંદ કરો" options={LEVELS} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
          <Input label="જોબ ગ્રેડ" value={form.jobLevel} onChange={(e) => setForm({ ...form, jobLevel: e.target.value })} placeholder="L3" />
          <Input label="ન્યૂનતમ પગાર (₹)" type="number" value={form.minSalary} onChange={(e) => setForm({ ...form, minSalary: e.target.value })} />
          <Input label="વધુમાં વધુ પગાર (₹)" type="number" value={form.maxSalary} onChange={(e) => setForm({ ...form, maxSalary: e.target.value })} />
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title="હોદ્દો આર્કાઇવ કરો?"
        message={confirm ? `«${confirm.title}» આર્કાઇવ થશે. જો કર્મચારીઓ આ હોદ્દા પર હશે તો સિસ્ટમ રોકશે અથવા રીઅસાઇન માંગશે.` : ''}
        loading={remove.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => remove.mutate(confirm._id)}
      />
    </div>
  );
}
