import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, BellRing, CheckCheck, Send, Trash2 } from 'lucide-react';
import { notificationApi, departmentApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Skeleton, StatCard, Tabs, Textarea,
} from '../../components/ui';
import { relativeTime } from '../../lib/utils';

const TYPE_LABEL = { leave: 'રજા', attendance: 'હાજરી', payroll: 'પગાર', task: 'કાર્ય', asset: 'સંપત્તિ', performance: 'કામગીરી', training: 'તાલીમ', reimbursement: 'ખર્ચ', announcement: 'જાહેરાત', system: 'સિસ્ટમ', general: 'સામાન્ય' };

export default function Notifications() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState('all');
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', type: 'announcement', audience: 'all', departmentId: '', sendEmail: false });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', tab],
    queryFn: () => notificationApi.list(tab === 'unread' ? { unread: 'true', limit: 50 } : { limit: 50 }),
  });
  const { data: unread } = useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: notificationApi.unreadCount });
  const { data: departments } = useQuery({ queryKey: ['departments', 'options'], queryFn: () => departmentApi.list({ limit: 100 }), enabled: broadcastOpen });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const markAll = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => { toast.success('બધું વંચાયું તરીકે નોંધાયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id) => notificationApi.remove(id),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const broadcast = useMutation({
    mutationFn: (payload) => notificationApi.broadcast(payload),
    onSuccess: (res) => { toast.success(res.message || 'સૂચના મોકલાઈ'); invalidate(); setBroadcastOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = data?.data || [];
  const unreadCount = unread?.data?.count ?? unread?.data?.unread ?? rows.filter((n) => !n.isRead).length;

  return (
    <div>
      <PageHeader
        title="સૂચનાઓ"
        subtitle="તમારી બધી સૂચનાઓ એક જગ્યાએ"
        actions={(
          <>
            <Button variant="secondary" icon={CheckCheck} loading={markAll.isPending} onClick={() => markAll.mutate()}>બધું વાંચ્યું</Button>
            {can('notifications:create') && <Button icon={Send} onClick={() => setBroadcastOpen(true)}>સૂચના મોકલો</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="કુલ સૂચનાઓ" value={rows.length} icon={Bell} tone="brand" />
        <StatCard label="ન વાંચેલી" value={unreadCount} icon={BellRing} tone="amber" />
        <StatCard label="વાંચેલી" value={Math.max(0, rows.length - unreadCount)} icon={CheckCheck} tone="emerald" />
      </div>

      <Tabs className="mb-4" active={tab} onChange={setTab} tabs={[{ value: 'all', label: 'બધી' }, { value: 'unread', label: 'ન વાંચેલી' }]} />

      <Card>
        <CardHeader title="સૂચના યાદી" subtitle={`${rows.length} સૂચના`} icon={Bell} />
        {isLoading ? <Skeleton className="m-4 h-40" /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ સૂચના નથી" />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((n) => (
              <div key={n._id} className={`flex items-start gap-3 px-4 py-3 ${n.isRead ? '' : 'bg-brand-50/40 dark:bg-brand-500/5'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-slate-300 dark:bg-slate-700' : 'bg-brand-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{n.title}</p>
                  {n.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{n.body}</p>}
                  <p className="mt-1 text-xs text-slate-400">
                    {TYPE_LABEL[n.type] || n.type} · {relativeTime(n.createdAt)}
                    {n.link && <Link to={n.link} className="ml-2 text-brand-600 hover:underline" onClick={() => !n.isRead && markRead.mutate(n._id)}>જુઓ →</Link>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!n.isRead && <button className="btn-ghost btn-xs" onClick={() => markRead.mutate(n._id)}>વાંચ્યું</button>}
                  <button className="btn-ghost btn-xs text-rose-600" onClick={() => remove.mutate(n._id)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={broadcastOpen} onClose={() => setBroadcastOpen(false)} title="સૂચના મોકલો" subtitle="પસંદ કરેલા કર્મચારીઓને ઇન-એપ સૂચના મળશે"
        footer={<><Button variant="secondary" onClick={() => setBroadcastOpen(false)}>રદ</Button><Button icon={Send} loading={broadcast.isPending} disabled={!form.title || !form.body} onClick={() => broadcast.mutate({
            title: form.title, body: form.body, type: form.type, sendEmail: form.sendEmail,
            role: form.audience === 'managers' ? 'department_manager' : form.audience === 'hr' ? 'hr_admin' : undefined,
            departmentId: form.audience === 'department' ? form.departmentId : undefined,
          })}>મોકલો</Button></>}
      >
        <div className="space-y-4">
          <Input label="શીર્ષક" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label="સંદેશ" required rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <Select label="કોને?" options={[{ value: 'all', label: 'બધા કર્મચારીઓ' }, { value: 'department', label: 'ચોક્કસ ડિપાર્ટમેન્ટ' }, { value: 'managers', label: 'મેનેજર્સ' }, { value: 'hr', label: 'HR' }]} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
          <Select label="સૂચનાનો પ્રકાર" options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          {form.audience === 'department' && (
            <Select label="ડિપાર્ટમેન્ટ *" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} />
          )}
          <Checkbox label="ઈમેલ પણ મોકલો" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} />
        </div>
      </Modal>
    </div>
  );
}
