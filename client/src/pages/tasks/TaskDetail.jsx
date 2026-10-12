import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock, ListChecks, MessageSquare, Paperclip, Plus, Send, Upload,
} from 'lucide-react';
import { taskApi, timesheetApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Progress, Select,
  Skeleton, Tabs, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateTime, label, relativeTime } from '../../lib/utils';

export default function TaskDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState('overview');
  const [comment, setComment] = useState('');
  const [subtask, setSubtask] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState({ hours: 1, description: '', date: new Date().toISOString().slice(0, 10), billable: true });

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['task', id], queryFn: () => taskApi.get(id), enabled: !!id });
  const { data: sheet } = useQuery({ queryKey: ['timesheets', 'current'], queryFn: () => timesheetApi.current(), enabled: !!id });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['task', id] }); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['timesheets'] }); };

  const update = useMutation({
    mutationFn: (payload) => taskApi.update(id, payload),
    onSuccess: () => { toast.success('કાર્ય અપડેટ થયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const changeStatus = useMutation({
    mutationFn: (status) => taskApi.changeStatus(id, { status }),
    onSuccess: () => { toast.success('સ્થિતિ બદલાઈ'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const addSubtask = useMutation({
    mutationFn: (title) => taskApi.addSubtask(id, { title }),
    onSuccess: () => { toast.success('સબ-ટાસ્ક ઉમેરાયું'); setSubtask(''); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const toggleSubtask = useMutation({
    mutationFn: ({ subtaskId, completed }) => taskApi.updateSubtask(id, subtaskId, { completed }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const addComment = useMutation({
    mutationFn: (body) => taskApi.addComment(id, { body }),
    onSuccess: () => { toast.success('ટિપ્પણી ઉમેરાઈ'); setComment(''); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const logTime = useMutation({
    mutationFn: async () => {
      const sheetId = sheet?.data?._id;
      if (!sheetId) throw new Error('ટાઇમશીટ મળી નથી');
      return timesheetApi.addEntry(sheetId, { ...log, task: id, project: data?.data?.project?._id || undefined, date: log.date });
    },
    onSuccess: () => { toast.success('સમય લોગ થયો'); setLogOpen(false); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !data?.data) return <Card><ErrorState onRetry={refetch} /></Card>;

  const t = data.data;
  const subs = t.subtasks || [];
  const subsDone = subs.filter((s) => s.completed).length;

  return (
    <div>
      <Link to="/tasks" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> કાર્ય યાદી
      </Link>

      <PageHeader
        title={t.title}
        subtitle={`${t.project?.name || 'સામાન્ય'} · ${label(t.priority)} પ્રાથમિકતા · સોંપનાર: ${t.assignedBy ? `${t.assignedBy.firstName || ''} ${t.assignedBy.lastName || ''}` : '—'}`}
        actions={(
          <>
            <Badge value={t.status} />
            {can('tasks:update') && (
              <Select
                wrapperClassName="w-44" placeholder="સ્થિતિ બદલો"
                options={['todo', 'in_progress', 'in_review', 'completed', 'blocked'].map((x) => ({ value: x, label: label(x) }))}
                value=""
                onChange={(e) => e.target.value && changeStatus.mutate(e.target.value)}
              />
            )}
            <Button variant="secondary" icon={Clock} onClick={() => setLogOpen(true)}>સમય લોગ કરો</Button>
          </>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="કાર્ય વિગત" subtitle={t.description ? '' : 'વર્ણન ઉમેરાયું નથી'} icon={ListChecks} />
            <div className="space-y-4 p-4">
              {t.description && <p className="text-sm text-slate-600 dark:text-slate-300">{t.description}</p>}
              <div className="grid gap-3 sm:grid-cols-4">
                <Info l="ડેડલાઇન" v={fmtDate(t.dueDate)} />
                <Info l="શરૂઆત" v={fmtDate(t.startDate)} />
                <Info l="અંદાજિત કલાક" v={`${t.estimatedHours || 0} કલાક`} />
                <Info l="લોગ થયેલા કલાક" v={`${t.loggedHours || 0} કલાક`} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>પ્રગતિ</span><span>{t.progressPercent || 0}%</span>
                </div>
                <Progress value={t.progressPercent || 0} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">સોંપાયેલ વ્યક્તિ</p>
                <div className="flex flex-wrap gap-2">
                  {(t.assignees || []).map((a) => (
                    <span key={a._id} className="flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs dark:bg-slate-800">
                      <Avatar src={a.profilePhoto || a.profileImage} name={`${a.firstName} ${a.lastName}`} size="xs" className="ring-0" />
                      {a.firstName} {a.lastName}
                    </span>
                  ))}
                  {(t.assignees || []).length === 0 && <span className="text-xs text-slate-500">—</span>}
                </div>
              </div>
              {(t.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.tags.map((x) => <span key={x} className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{x}</span>)}
                </div>
              )}
            </div>
          </Card>

          <Tabs
            active={tab} onChange={setTab}
            tabs={[
              { value: 'overview', label: 'સબ-ટાસ્ક', count: subs.length },
              { value: 'comments', label: 'ટિપ્પણી', count: (t.comments || []).length },
              { value: 'activity', label: 'પ્રવૃત્તિ', count: (t.activity || []).length },
            ]}
          />

          {tab === 'overview' && (
            <Card>
              <CardHeader title="સબ-ટાસ્ક" subtitle={`${subsDone}/${subs.length} પૂર્ણ`} icon={CheckCircle2} />
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {subs.map((s) => (
                  <label key={s._id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                    <input
                      type="checkbox" checked={!!s.completed} className="h-4 w-4 rounded border-slate-300"
                      onChange={(e) => toggleSubtask.mutate({ subtaskId: s._id, completed: e.target.checked })}
                    />
                    <span className={`text-sm ${s.completed ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{s.title}</span>
                  </label>
                ))}
                {subs.length === 0 && <div className="px-4 py-3"><EmptyState title="કોઈ સબ-ટાસ્ક નથી" /></div>}
                {can('tasks:update') && (
                  <div className="flex gap-2 px-4 py-3">
                    <Input wrapperClassName="flex-1" placeholder="નવું સબ-ટાસ્ક…" value={subtask} onChange={(e) => setSubtask(e.target.value)} />
                    <Button icon={Plus} disabled={!subtask} loading={addSubtask.isPending} onClick={() => addSubtask.mutate(subtask)}>ઉમેરો</Button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {tab === 'comments' && (
            <Card>
              <CardHeader title="ટિપ્પણીઓ" icon={MessageSquare} />
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(t.comments || []).map((c) => (
                  <div key={c._id} className="flex gap-3 px-4 py-3">
                    <Avatar src={c.author?.avatar} name={c.author?.name || 'સભ્ય'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {c.author?.name || 'સભ્ય'}
                        <span className="ml-2 text-xs font-normal text-slate-400">{relativeTime(c.createdAt)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{c.body}</p>
                    </div>
                  </div>
                ))}
                {(t.comments || []).length === 0 && <div className="px-4 py-3"><EmptyState title="કોઈ ટિપ્પણી નથી" /></div>}
                <div className="flex gap-2 px-4 py-3">
                  <Textarea wrapperClassName="flex-1" rows={2} placeholder="ટિપ્પણી લખો…" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <Button icon={Send} disabled={!comment.trim()} loading={addComment.isPending} onClick={() => addComment.mutate(comment)}>મોકલો</Button>
                </div>
              </div>
            </Card>
          )}

          {tab === 'activity' && (
            <Card>
              <CardHeader title="પ્રવૃત્તિ લોગ" subtitle="કાર્યમાં થયેલા ફેરફાર" icon={CalendarDays} />
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(t.activity || []).slice().reverse().map((a, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <p className="text-sm text-slate-700 dark:text-slate-200">{label(a.action)}{a.note ? ` — ${a.note}` : ''}</p>
                    <p className="text-xs text-slate-400">{fmtDateTime(a.at)}</p>
                  </div>
                ))}
                {(t.activity || []).length === 0 && <div className="px-4 py-3"><EmptyState /></div>}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="ઝડપી ક્રિયાઓ" icon={ListChecks} />
            <div className="space-y-2 p-4">
              {['in_progress', 'in_review', 'completed', 'blocked'].map((s) => (
                <Button
                  key={s} variant={s === 'completed' ? 'success' : s === 'blocked' ? 'danger' : 'secondary'}
                  className="w-full justify-center" disabled={t.status === s || !can('tasks:update')}
                  onClick={() => changeStatus.mutate(s)}
                >{label(s)} કરો</Button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="એટેચમેન્ટ" subtitle={`${(t.attachments || []).length} ફાઇલ`} icon={Paperclip} />
            <div className="space-y-2 p-4">
              {(t.attachments || []).map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-brand-600 hover:underline">
                  <Paperclip className="h-3.5 w-3.5" /> {a.fileName || a.name}
                </a>
              ))}
              {(t.attachments || []).length === 0 && <p className="text-xs text-slate-500">કોઈ એટેચમેન્ટ નથી</p>}
              {can('tasks:update') && (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 transition hover:border-brand-400 dark:border-slate-700">
                  <Upload className="h-3.5 w-3.5" /> ફાઇલ અપલોડ કરો (10 MB સુધી)
                  <input
                    type="file" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) return toast.error('ફાઇલ 10 MB થી મોટી છે');
                      const fd = new FormData();
                      fd.append('file', file);
                      taskApi.attachments(id, fd).then(() => { toast.success('ફાઇલ અપલોડ થઈ'); invalidate(); }).catch((err) => toast.error(errorMessage(err)));
                    }}
                  />
                </label>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="તાજેતરમાં જોડાયેલા" icon={CalendarDays} />
            <div className="space-y-2 p-4 text-xs text-slate-500 dark:text-slate-400">
              <p>બન્યું: {fmtDateTime(t.createdAt)}</p>
              <p>અપડેટ: {fmtDateTime(t.updatedAt)}</p>
              {t.completedAt && <p className="text-emerald-600">પૂર્ણ: {fmtDateTime(t.completedAt)}</p>}
              {t.order !== undefined && <p>બોર્ડ ક્રમ: {t.order}</p>}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={logOpen} onClose={() => setLogOpen(false)} size="sm" title="ટાઇમશીટમાં સમય લોગ કરો" subtitle="આ સપ્તાહની ટાઇમશીટમાં એન્ટ્રી ઉમેરાશે"
        footer={<><Button variant="secondary" onClick={() => setLogOpen(false)}>રદ</Button><Button loading={logTime.isPending} disabled={!log.description || !log.hours} onClick={() => logTime.mutate()}>લોગ કરો</Button></>}
      >
        <div className="space-y-4">
          <Input label="તારીખ" type="date" value={log.date} onChange={(e) => setLog({ ...log, date: e.target.value })} />
          <Input label="કલાક" type="number" step="0.25" min="0.25" max="24" value={log.hours} onChange={(e) => setLog({ ...log, hours: Number(e.target.value) })} />
          <Textarea label="શું કામ કર્યું?" rows={2} required value={log.description} onChange={(e) => setLog({ ...log, description: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={log.billable} onChange={(e) => setLog({ ...log, billable: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            બિલેબલ કલાક
          </label>
        </div>
      </Modal>
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
