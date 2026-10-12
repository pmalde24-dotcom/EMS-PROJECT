import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, Megaphone, Plus, Send, Trash2, Users } from 'lucide-react';
import { announcementApi, departmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, Input, Modal, PageHeader, Select, Skeleton, StatCard, Tabs, Textarea } from '../../components/ui';
import { fmtDate, fmtDateTime, label, relativeTime } from '../../lib/utils';

const TYPES = ['general', 'hr', 'policy', 'event', 'holiday', 'payroll', 'it', 'celebration', 'urgent'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];

export default function Announcements() {
  const qc = useQueryClient();
  const { can, isAdmin } = useAuth();
  const [tab, setTab] = useState('feed');
  const [open, setOpen] = useState(false);
  const [statsFor, setStatsFor] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({
    title: '', body: '', category: 'general', priority: 'normal', audience: 'all', departments: [],
    expiresAt: '', pinned: false, requireAcknowledgement: false, sendEmail: true,
  });

  const { data: feed, isLoading: loadingFeed, refetch: refetchFeed } = useQuery({ queryKey: ['announcements', 'feed'], queryFn: announcementApi.feed, enabled: tab === 'feed' });
  const { data: manage, isLoading: loadingManage, refetch: refetchManage } = useQuery({ queryKey: ['announcements', 'manage'], queryFn: () => announcementApi.list({ limit: 50 }), enabled: tab === 'manage' });
  const { data: departments } = useQuery({ queryKey: ['departments', 'options'], queryFn: () => departmentApi.list({ limit: 100 }), enabled: open });
  const { data: stats } = useQuery({ queryKey: ['announcements', statsFor?._id, 'stats'], queryFn: () => announcementApi.stats(statsFor._id), enabled: !!statsFor });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['announcements'] });

  const create = useMutation({
    mutationFn: (payload) => announcementApi.create(payload),
    onSuccess: () => { toast.success('જાહેરાત બની — «પ્રકાશિત કરો» દબાવો એટલે બધાને મળશે'); invalidate(); setOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const publish = useMutation({
    mutationFn: (id) => announcementApi.publish(id),
    onSuccess: () => { toast.success('જાહેરાત પ્રકાશિત થઈ'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id) => announcementApi.remove(id),
    onSuccess: () => { toast.success('જાહેરાત દૂર થઈ'); invalidate(); setConfirmDel(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const markRead = useMutation({
    mutationFn: ({ id, acknowledge }) => announcementApi.markRead(id, acknowledge),
    onSuccess: () => { toast.success('વંચાયું તરીકે નોંધાયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const feedRows = feed?.data || [];
  const manageRows = manage?.data || [];
  const rows = tab === 'feed' ? feedRows : manageRows;
  const loading = tab === 'feed' ? loadingFeed : loadingManage;

  return (
    <div>
      <PageHeader
        title="જાહેરાતો"
        subtitle="કંપનીની સૂચનાઓ, નીતિઓ અને ઇવેન્ટ્સ"
        actions={can('announcements:create') && <Button icon={Plus} onClick={() => setOpen(true)}>નવી જાહેરાત</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ જાહેરાત" value={feedRows.length} icon={Megaphone} tone="brand" />
        <StatCard label="વંચાયેલી" value={feedRows.filter((a) => a.isRead).length} icon={Eye} tone="emerald" />
        <StatCard label="સ્વીકૃતિ બાકી" value={feedRows.filter((a) => a.requireAcknowledgement && !a.acknowledged).length} icon={Users} tone="amber" />
        <StatCard label="પ્રકાશિત" value={feedRows.filter((a) => a.publishedAt).length} icon={Send} tone="violet" />
      </div>

      <Tabs
        className="mb-4" active={tab} onChange={setTab}
        tabs={[{ value: 'feed', label: 'મારો ફીડ' }, ...(isAdmin ? [{ value: 'manage', label: 'મેનેજ કરો' }] : [])]}
      />

      <Card>
        <CardHeader title={tab === 'feed' ? 'મારો ફીડ' : 'બધી જાહેરાતો'} subtitle={`${rows.length} જાહેરાત`} icon={Megaphone} />
        {loading ? <Skeleton className="m-4 h-40" /> : rows.length === 0 ? (
          <EmptyState title="કોઈ જાહેરાત નથી" />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((a) => (
              <div key={a._id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{a.title}</h3>
                      <Badge value={a.category} />
                      {a.priority && a.priority !== 'normal' && <Badge value={a.priority} />}
                      {!a.publishedAt && <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">ડ્રાફ્ટ</span>}
                      {a.pinned && <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">પિન કરેલી</span>}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{a.body}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {a.createdBy?.name || 'HR'} · {relativeTime(a.publishedAt || a.createdAt)}
                      {a.expiresAt ? ` · માન્યતા ${fmtDate(a.expiresAt)} સુધી` : ''}
                      {a.audience?.type && a.audience.type !== 'all' ? ` · ${label(a.audience.type)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tab === 'feed' && !a.isRead && (
                      <Button size="xs" variant="secondary" onClick={() => markRead.mutate({ id: a._id, acknowledge: false })}>વંચાયું</Button>
                    )}
                    {tab === 'feed' && a.requireAcknowledgement && !a.isRead && (
                      <Button size="xs" variant="success" onClick={() => markRead.mutate({ id: a._id, acknowledge: true })}>સ્વીકૃતિ આપો</Button>
                    )}
                    {tab === 'manage' && can('announcements:update') && (
                      <>
                        {!a.publishedAt && <Button size="xs" variant="success" loading={publish.isPending} onClick={() => publish.mutate(a._id)}>પ્રકાશિત કરો</Button>}
                        <button className="btn-ghost btn-xs" onClick={() => setStatsFor(a)}>આંકડા</button>
                        {can('announcements:delete') && <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirmDel(a)}><Trash2 className="h-3.5 w-3.5" /></button>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={open} onClose={() => setOpen(false)} size="lg" title="નવી જાહેરાત"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>રદ</Button><Button loading={create.isPending} disabled={!form.title || !form.body} onClick={() => create.mutate({
          title: form.title, body: form.body, category: form.category, priority: form.priority,
          expiresAt: form.expiresAt || undefined, pinned: form.pinned, requireAcknowledgement: form.requireAcknowledgement, sendEmail: form.sendEmail,
          audience: form.audience === 'all' ? { type: 'all' }
            : form.audience === 'departments' ? { type: 'departments', departments: form.departments }
            : form.audience === 'managers' ? { type: 'roles', roles: ['department_manager', 'team_leader'] }
            : { type: 'roles', roles: ['hr_admin', 'hr_manager'] },
        })}>બનાવો</Button></>}
      >
        <div className="space-y-4">
          <Input label="શીર્ષક" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label="સંદેશ" required rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="પ્રકાર" options={TYPES.map((x) => ({ value: x, label: label(x) }))} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Select label="પ્રાથમિકતા" options={PRIORITIES.map((x) => ({ value: x, label: label(x) }))} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            <Select label="કોને મોકલવું?" options={[{ value: 'all', label: 'બધા કર્મચારીઓ' }, { value: 'departments', label: 'ચોક્કસ ડિપાર્ટમેન્ટ' }, { value: 'managers', label: 'ફક્ત મેનેજર્સ' }, { value: 'hr', label: 'ફક્ત HR' }]} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
            <Input label="માન્યતા સમાપ્તિ" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </div>
          {form.audience === 'departments' && (
            <div>
              <label className="label">ડિપાર્ટમેન્ટ *</label>
              <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2">
                {(departments?.data || []).map((d) => (
                  <label key={d._id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={form.departments.includes(d._id)}
                      onChange={(e) => setForm({ ...form, departments: e.target.checked ? [...form.departments, d._id] : form.departments.filter((x) => x !== d._id) })} />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-4">
            <Checkbox label="પિન કરો (ઉપર દેખાશે)" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
            <Checkbox label="સ્વીકૃતિ જરૂરી" checked={form.requireAcknowledgement} onChange={(e) => setForm({ ...form, requireAcknowledgement: e.target.checked })} />
            <Checkbox label="ઈમેલ પણ મોકલો" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} />
          </div>
        </div>
      </Modal>

      <Modal open={!!statsFor} onClose={() => setStatsFor(null)} size="sm" title="જાહેરાત આંકડા" subtitle={statsFor?.title}>
        <div className="grid grid-cols-2 gap-3">
          <Info l="વ્યૂ" v={stats?.data?.views ?? '—'} />
          <Info l="વાંચ્યું" v={stats?.data?.readCount ?? '—'} />
          <Info l="સ્વીકૃતિ" v={stats?.data?.acknowledgementCount ?? '—'} />
          <Info l="કુલ પ્રાપ્તકર્તા" v={statsFor?.audience?.type === 'all' ? 'બધા' : '—'} />
        </div>
        {stats && <p className="mt-3 text-xs text-slate-400">પ્રકાશિત: {fmtDateTime(statsFor.publishedAt || statsFor.createdAt)}</p>}
      </Modal>

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={() => remove.mutate(confirmDel._id)} loading={remove.isPending}
        title="જાહેરાત દૂર કરવી?" message={confirmDel ? `"${confirmDel.title}" દૂર કરવામાં આવશે.` : ''}
      />
    </div>
  );
}

function Info({ l, v }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{v}</p>
    </div>
  );
}
