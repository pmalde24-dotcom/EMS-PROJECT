import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, IndianRupee, Pencil, Plus, Trash2, Users, UserCog } from 'lucide-react';
import { departmentApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader,
  Pagination, SearchInput, Select, StatCard, TableSkeleton, TableWrap, Textarea,
} from '../../components/ui';
import { currency } from '../../lib/utils';

const emptyForm = { name: '', code: '', description: '', head: '', parent: '', email: '', phone: '', location: '', costCenter: '', budget: { annual: '' } };

export default function DepartmentList() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useList(['departments'], departmentApi.list, { limit: 20 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirm, setConfirm] = useState(null);
  const [headModal, setHeadModal] = useState(null);
  const [reassignTo, setReassignTo] = useState('');

  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }) });
  const { data: allDepartments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });

  const save = useMutation({
    mutationFn: (payload) => (editing ? departmentApi.update(editing._id, payload) : departmentApi.create(payload)),
    onSuccess: () => {
      toast.success(editing ? 'ડિપાર્ટમેન્ટ અપડેટ થયું' : 'નવું ડિપાર્ટમેન્ટ ઉમેરાયું');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setFormOpen(false); setEditing(null); setForm(emptyForm);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: ({ id, reassignTo: rt }) => departmentApi.remove(id, rt ? { reassignTo: rt } : {}),
    onSuccess: (res) => {
      toast.success(res?.message || 'ડિપાર્ટમેન્ટ આર્કાઇવ થયું');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setConfirm(null); setReassignTo('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const assignHead = useMutation({
    mutationFn: ({ id, employeeId }) => departmentApi.assignHead(id, employeeId),
    onSuccess: () => { toast.success('વિભાગ પ્રમુખ નિયુક્ત થયા'); qc.invalidateQueries({ queryKey: ['departments'] }); setHeadModal(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true); };
  const openEdit = (d) => {
    setEditing(d);
    setForm({
      name: d.name || '', code: d.code || '', description: d.description || '',
      head: d.head?._id || d.head || '', parent: d.parent?._id || d.parent || '',
      email: d.email || '', phone: d.phone || '', location: d.location || '', costCenter: d.costCenter || '',
      budget: { annual: d.budget?.annual ?? '' },
    });
    setFormOpen(true);
  };

  const rows = list.rows;
  const totalHeadcount = rows.reduce((s, d) => s + (d.employeeCount || d.headcount || 0), 0);

  return (
    <div>
      <PageHeader
        title="ડિપાર્ટમેન્ટ"
        subtitle="વિભાગો, પ્રમુખો અને બજેટનું સંચાલન"
        actions={can('departments:create') && <Button icon={Plus} onClick={openCreate}>નવું ડિપાર્ટમેન્ટ</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="કુલ ડિપાર્ટમેન્ટ" value={list.meta?.total ?? '—'} icon={Building2} tone="brand" />
        <StatCard label="આ પેજ પર હેડકાઉન્ટ" value={totalHeadcount} icon={Users} tone="emerald" />
        <StatCard label="કુલ બજેટ (વાર્ષિક)" value={currency(rows.reduce((s, d) => s + (d.budget?.annual || 0), 0))} icon={IndianRupee} tone="violet" />
      </div>

      <Card>
        <CardHeader
          title="ડિપાર્ટમેન્ટ યાદી"
          icon={Building2}
          action={<SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="નામ કે કોડ શોધો…" className="w-full sm:w-64" />}
        />

        {list.isLoading ? <TableSkeleton rows={6} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ ડિપાર્ટમેન્ટ નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">ડિપાર્ટમેન્ટ</th><th className="th">કોડ</th><th className="th">પ્રમુખ</th>
                  <th className="th">કર્મચારી</th><th className="th">બજેટ</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d._id} className="row">
                    <td className="td">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{d.name}</p>
                      <p className="max-w-xs truncate text-xs text-slate-500">{d.description || d.location || '—'}</p>
                    </td>
                    <td className="td font-mono text-xs">{d.code}</td>
                    <td className="td">
                      {d.head ? (
                        <div className="flex items-center gap-2">
                          <Avatar src={d.head.profilePhoto} name={`${d.head.firstName} ${d.head.lastName}`} size="xs" />
                          <span className="text-sm">{d.head.firstName} {d.head.lastName}</span>
                        </div>
                      ) : <span className="text-xs text-slate-400">નિયુક્ત નથી</span>}
                    </td>
                    <td className="td">{d.employeeCount ?? d.headcount ?? '—'}</td>
                    <td className="td">{d.budget?.annual ? currency(d.budget.annual) : '—'}</td>
                    <td className="td"><Badge value={d.isActive === false ? 'inactive' : 'active'} /></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        {can('departments:update') && (
                          <button className="btn-ghost btn-xs" title="પ્રમુખ નિયુક્ત કરો" onClick={() => setHeadModal(d)}><UserCog className="h-3.5 w-3.5" /></button>
                        )}
                        {can('departments:update') && <button className="btn-ghost btn-xs" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></button>}
                        {can('departments:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirm(d)}><Trash2 className="h-3.5 w-3.5" /></button>}
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
        open={formOpen} onClose={() => setFormOpen(false)}
        title={editing ? 'ડિપાર્ટમેન્ટ સંપાદિત કરો' : 'નવું ડિપાર્ટમેન્ટ'}
        footer={<><Button variant="secondary" onClick={() => setFormOpen(false)}>રદ</Button><Button loading={save.isPending} onClick={() => save.mutate(form)}>{editing ? 'અપડેટ' : 'ઉમેરો'}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="નામ" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="કોડ" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="ENG" />
          <Input label="ઇમેઇલ" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="ફોન" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="સ્થળ" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Input label="કોસ્ટ સેન્ટર" value={form.costCenter} onChange={(e) => setForm({ ...form, costCenter: e.target.value })} />
          <Select
            label="વિભાગ પ્રમુખ" placeholder="પસંદ કરો"
            options={(employees?.data || []).map((m) => ({ value: m._id, label: `${m.firstName} ${m.lastName} (${m.employeeId})` }))}
            value={form.head} onChange={(e) => setForm({ ...form, head: e.target.value })}
          />
          <Select
            label="પિતૃ ડિપાર્ટમેન્ટ" placeholder="કોઈ નહીં"
            options={(allDepartments?.data || []).filter((d) => d._id !== editing?._id).map((d) => ({ value: d._id, label: d.name }))}
            value={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.value })}
          />
          <Input label="વાર્ષિક બજેટ (₹)" type="number" value={form.budget.annual} onChange={(e) => setForm({ ...form, budget: { annual: e.target.value } })} />
          <Textarea label="વર્ણન" wrapperClassName="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={!!headModal} onClose={() => setHeadModal(null)} size="sm" title="વિભાગ પ્રમુખ નિયુક્ત કરો" subtitle={headModal?.name}
        footer={<><Button variant="secondary" onClick={() => setHeadModal(null)}>રદ</Button><Button loading={assignHead.isPending} onClick={() => assignHead.mutate({ id: headModal._id, employeeId: reassignTo || headModal.head?._id })}>નિયુક્ત કરો</Button></>}
      >
        <Select
          label="કર્મચારી" placeholder="પસંદ કરો"
          options={(employees?.data || []).map((m) => ({ value: m._id, label: `${m.firstName} ${m.lastName} (${m.employeeId})` }))}
          value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title="ડિપાર્ટમેન્ટ આર્કાઇવ કરો?"
        message={confirm ? `«${confirm.name}» માં ${confirm.employeeCount ?? confirm.headcount ?? 0} કર્મચારી છે. જો સંખ્યા શૂન્ય ન હોય તો વિકલ્પ તરીકે બીજા ડિપાર્ટમેન્ટમાં રીઅસાઇન કરો.` : ''}
        confirmLabel="આર્કાઇવ કરો"
        loading={remove.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => remove.mutate({ id: confirm._id, reassignTo: reassignTo || undefined })}
      >
        <Select
          label="કર્મચારીઓને રીઅસાઇન કરો (વૈકલ્પિક)" placeholder="રીઅસાઇન ન કરો"
          options={(allDepartments?.data || []).filter((d) => d._id !== confirm?._id).map((d) => ({ value: d._id, label: d.name }))}
          value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
