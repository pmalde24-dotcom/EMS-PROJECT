import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, LogOut, Plus, ShieldCheck, ShieldX, UserCog, Users } from 'lucide-react';
import { userApi, employeeApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, ErrorState, Input, Modal,
  PageHeader, Pagination, SearchInput, Select, StatCard, TableSkeleton, TableWrap,
} from '../../components/ui';
import { fmtDateTime, label } from '../../lib/utils';

const ROLES = ['super_admin', 'hr_admin', 'hr_manager', 'department_manager', 'team_leader', 'employee'];

export default function UserList() {
  const qc = useQueryClient();
  const { can, hasRole } = useAuth();
  const isSuperAdmin = hasRole('super_admin');
  const list = useList(['users'], userApi.list, { limit: 20 });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [permsFor, setPermsFor] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee', employee: '', isActive: true, sendInvite: false });
  const [perms, setPerms] = useState({ extraPermissions: [], revokedPermissions: [] });

  const { data: employees } = useQuery({ queryKey: ['employees', 'options'], queryFn: () => employeeApi.list({ limit: 300 }), enabled: open });
  const { data: catalog } = useQuery({ queryKey: ['users', 'permission-catalog'], queryFn: userApi.permissionCatalog, enabled: !!permsFor });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const save = useMutation({
    mutationFn: (payload) => (editing ? userApi.update(editing._id, payload) : userApi.create(payload)),
    onSuccess: () => { toast.success(editing ? 'વપરાશકર્તા અપડેટ થયો' : 'વપરાશકર્તા બન્યો'); invalidate(); setOpen(false); setEditing(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const toggle = useMutation({
    mutationFn: (id) => userApi.toggleActive(id),
    onSuccess: (res) => { toast.success(res.message || 'સ્થિતિ બદલાઈ'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const revoke = useMutation({
    mutationFn: (id) => userApi.revokeSessions(id),
    onSuccess: () => toast.success('બધા સેશન રદ થયા'),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const savePerms = useMutation({
    mutationFn: ({ id, body }) => userApi.permissions(id, body),
    onSuccess: () => { toast.success('પરવાનગી અપડેટ થઈ'); invalidate(); setPermsFor(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id) => userApi.remove(id),
    onSuccess: () => { toast.success('વપરાશકર્તા દૂર થયો'); invalidate(); setConfirmDel(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.rows || [];
  const active = rows.filter((u) => u.isActive).length;

  return (
    <div>
      <PageHeader
        title="વપરાશકર્તા અને લોગિન"
        subtitle="લોગિન એકાઉન્ટ, ભૂમિકાઓ અને વ્યક્તિગત પરવાનગીઓ"
        actions={can('users:create') && (
          <Button icon={Plus} onClick={() => { setEditing(null); setForm({ name: '', email: '', password: '', role: 'employee', employee: '', isActive: true, sendInvite: false }); setOpen(true); }}>નવો વપરાશકર્તા</Button>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ વપરાશકર્તા" value={list.meta?.total ?? '—'} icon={Users} tone="brand" />
        <StatCard label="સક્રિય (આ પાના પર)" value={active} icon={ShieldCheck} tone="emerald" />
        <StatCard label="સુપર એડમિન" value={rows.filter((u) => u.role === 'super_admin').length} icon={UserCog} tone="violet" />
        <StatCard label="તાજેતરમાં લોગિન" value={rows.filter((u) => u.lastLoginAt).length} icon={KeyRound} tone="amber" />
      </div>

      <Card>
        <CardHeader
          title="વપરાશકર્તા યાદી" subtitle={list.meta ? `કુલ ${list.meta.total} વપરાશકર્તા` : ''} icon={Users}
          action={(
            <div className="flex flex-wrap gap-2">
              <SearchInput value={list.searchInput} onChange={list.setSearchInput} onSubmit={list.submitSearch} placeholder="નામ / ઈમેલ શોધો…" className="w-full sm:w-56" />
              <Select wrapperClassName="w-44" placeholder="ભૂમિકા" options={ROLES.map((r) => ({ value: r, label: label(r) }))} value={list.params.role || ''} onChange={(e) => list.patch({ role: e.target.value || undefined })} />
              <Select wrapperClassName="w-36" placeholder="સ્થિતિ" options={[{ value: 'true', label: 'સક્રિય' }, { value: 'false', label: 'નિષ્ક્રિય' }]} value={String(list.params.isActive ?? '')} onChange={(e) => list.patch({ isActive: e.target.value === '' ? undefined : e.target.value })} />
            </div>
          )}
        />
        {list.isLoading ? <TableSkeleton rows={8} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ વપરાશકર્તા નથી" />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">વપરાશકર્તા</th><th className="th">ભૂમિકા</th><th className="th">કર્મચારી લિંક</th><th className="th">છેલ્લું લોગિન</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u._id} className="row">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{u.name}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td"><Badge value={u.role} label={label(u.role)} /></td>
                    <td className="td text-xs">{u.employee ? `${u.employee.firstName} ${u.employee.lastName} (${u.employee.employeeId})` : <span className="text-slate-400">—</span>}</td>
                    <td className="td text-xs">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'કદી નહીં'}</td>
                    <td className="td">
                      {u.isActive ? <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">સક્રિય</span>
                        : <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">નિષ્ક્રિય</span>}
                      {u.mustChangePassword && <p className="mt-0.5 text-[11px] text-amber-600">પાસવર્ડ બદલવાનો બાકી</p>}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap justify-end gap-1">
                        {can('users:update') && (
                          <Button size="xs" variant="secondary" onClick={() => { setEditing(u); setForm({ name: u.name, email: u.email, password: '', role: u.role, employee: u.employee?._id || '', isActive: u.isActive }); setOpen(true); }}>સંપાદિત</Button>
                        )}
                        {isSuperAdmin && (
                          <Button size="xs" variant="ghost" icon={KeyRound} onClick={() => { setPermsFor(u); setPerms({ extraPermissions: u.extraPermissions || [], revokedPermissions: u.revokedPermissions || [] }); }}>પરવાનગી</Button>
                        )}
                        {can('users:update') && <button className="btn-ghost btn-xs" title="સેશન રદ કરો" onClick={() => revoke.mutate(u._id)}><LogOut className="h-3.5 w-3.5" /></button>}
                        {can('users:update') && (
                          <Button size="xs" variant={u.isActive ? 'danger' : 'success'} icon={u.isActive ? ShieldX : ShieldCheck} onClick={() => toggle.mutate(u._id)}>
                            {u.isActive ? 'બંધ કરો' : 'ચાલુ કરો'}
                          </Button>
                        )}
                        {isSuperAdmin && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirmDel(u)}>દૂર કરો</button>}
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
        open={open} onClose={() => { setOpen(false); setEditing(null); }} size="sm" title={editing ? 'વપરાશકર્તા સંપાદિત કરો' : 'નવો વપરાશકર્તા'}
        footer={<><Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); }}>રદ</Button><Button loading={save.isPending} disabled={!form.name || !form.email || (!editing && form.password.length < 8)} onClick={() => save.mutate({ ...form, employee: form.employee || null, password: form.password || undefined })}>સાચવો</Button></>}
      >
        <div className="space-y-4">
          <Input label="નામ" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="ઈમેલ (લોગિન)" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label={editing ? 'નવો પાસવર્ડ (ખાલી છોડો તો બદલાશે નહીં)' : 'પાસવર્ડ (ઓછામાં ઓછા 8 અક્ષર)'} type="password" required={!editing} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select label="ભૂમિકા" required options={ROLES.filter((r) => r !== 'super_admin' || isSuperAdmin).map((r) => ({ value: r, label: label(r) }))} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <Select label="કર્મચારી સાથે લિંક કરો" placeholder="કોઈ નહીં" options={(employees?.data || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` }))} value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })} />
          <Checkbox label="સક્રિય" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          {!editing && <Checkbox label="ઈનવાઇટ ઈમેલ મોકલો" checked={form.sendInvite} onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })} />}
        </div>
      </Modal>

      <Modal
        open={!!permsFor} onClose={() => setPermsFor(null)} size="lg" title="વ્યક્તિગત પરવાનગીઓ" subtitle={permsFor?.name}
        footer={<><Button variant="secondary" onClick={() => setPermsFor(null)}>રદ</Button><Button loading={savePerms.isPending} onClick={() => savePerms.mutate({ id: permsFor._id, body: perms })}>સાચવો</Button></>}
      >
        <p className="mb-3 text-xs text-slate-500">
          ભૂમિકા પરવાનગી ઉપર વધારાની પરવાનગી આપો કે ભૂમિકાની પરવાનગી રદ કરો. રદ કરેલી પરવાનગી સર્વર પર પણ લાગુ થાય છે.
        </p>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          {(catalog?.data?.modules || []).map((m) => (
            <div key={m} className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="w-32 shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">{m}</span>
              {(catalog?.data?.actions || []).map((a) => {
                const p = `${m}:${a}`;
                const granted = perms.extraPermissions.includes(p);
                const revoked = perms.revokedPermissions.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => setPerms((x) => ({
                      extraPermissions: revoked ? x.extraPermissions : (granted ? x.extraPermissions.filter((y) => y !== p) : [...x.extraPermissions, p]),
                      revokedPermissions: granted ? x.revokedPermissions : (revoked ? x.revokedPermissions.filter((y) => y !== p) : [...x.revokedPermissions, p]),
                    }))}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition ${granted ? 'bg-emerald-600 text-white' : revoked ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}
                  >{a}</button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-600" /> વધારાની</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-600" /> રદ</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-slate-300" /> ભૂમિકા મુજબ</span>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={() => remove.mutate(confirmDel._id)} loading={remove.isPending}
        title="વપરાશકર્તા દૂર કરવો?" message={confirmDel ? `${confirmDel.name} (${confirmDel.email}) નું લોગિન બંધ થઈ જશે.` : ''}
      />
    </div>
  );
}
