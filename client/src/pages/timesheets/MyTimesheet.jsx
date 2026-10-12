import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, Clock, Plus, Send, Trash2, Timer, TrendingUp } from 'lucide-react';
import { timesheetApi, projectApi, taskApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Skeleton, StatCard, TableWrap, Textarea } from '../../components/ui';
import { fmtDate, fmtDateInput, label } from '../../lib/utils';

export default function MyTimesheet() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [weekStart, setWeekStart] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ date: fmtDateInput(), project: '', task: '', hours: 1, description: '', billable: true });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['timesheets', 'current', weekStart],
    queryFn: () => timesheetApi.current(weekStart ? { weekStart } : {}),
  });

  const { data: projects } = useQuery({ queryKey: ['projects', 'options'], queryFn: () => projectApi.list({ limit: 100 }), enabled: entryOpen });
  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'options', form.project],
    queryFn: () => taskApi.list({ project: form.project, limit: 100 }),
    enabled: !!form.project && entryOpen,
  });

  const sheet = data?.data;
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['timesheets'] }); qc.invalidateQueries({ queryKey: ['tasks'] }); };

  const addEntry = useMutation({
    mutationFn: (payload) => timesheetApi.addEntry(sheet._id, payload),
    onSuccess: () => { toast.success('એન્ટ્રી ઉમેરાઈ'); invalidate(); setEntryOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const updateEntry = useMutation({
    mutationFn: ({ entryId, payload }) => timesheetApi.updateEntry(sheet._id, entryId, payload),
    onSuccess: () => { toast.success('એન્ટ્રી અપડેટ થઈ'); invalidate(); setEntryOpen(false); setEditing(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const deleteEntry = useMutation({
    mutationFn: (entryId) => timesheetApi.deleteEntry(sheet._id, entryId),
    onSuccess: () => { toast.success('એન્ટ્રી દૂર થઈ'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = useMutation({
    mutationFn: () => timesheetApi.submit(sheet._id),
    onSuccess: () => { toast.success('ટાઇમશીટ મંજૂરી માટે મોકલાઈ'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const entries = sheet?.entries || [];
  const editable = ['draft', 'rejected'].includes(sheet?.status);
  const byDay = entries.reduce((acc, e) => {
    const key = new Date(e.date).toISOString().slice(0, 10);
    acc[key] = (acc[key] || 0) + e.hours;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="મારી ટાઇમશીટ"
        subtitle="સાપ્તાહિક કલાક લોગ કરો અને મંજૂરી માટે મોકલો"
        actions={(
          <>
            <Input wrapperClassName="w-44" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            <Button variant="secondary" onClick={() => setWeekStart('')}>આ સપ્તાહ</Button>
            {editable && can('timesheets:create') && <Button icon={Plus} onClick={() => { setEditing(null); setForm({ ...form, date: fmtDateInput() }); setEntryOpen(true); }}>એન્ટ્રી ઉમેરો</Button>}
            {editable && entries.length > 0 && <Button variant="success" icon={Send} loading={submit.isPending} onClick={() => submit.mutate()}>મંજૂરી માટે મોકલો</Button>}
          </>
        )}
      />

      {isLoading ? <Skeleton className="h-64 w-full" /> : isError ? <Card><ErrorState onRetry={refetch} /></Card> : !sheet ? <Card><EmptyState title="ટાઇમશીટ મળી નથી" /></Card> : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="કુલ કલાક" value={sheet.totalHours ?? 0} sub={`${fmtDate(sheet.weekStart)} → ${fmtDate(sheet.weekEnd)}`} icon={Timer} tone="brand" />
            <StatCard label="બિલેબલ કલાક" value={sheet.billableHours ?? 0} icon={TrendingUp} tone="emerald" />
            <StatCard label="ઓવરટાઇમ" value={sheet.overtimeHours ?? 0} icon={Clock} tone="amber" />
            <StatCard label="સ્થિતિ" value={label(sheet.status)} sub={sheet.submittedAt ? `મોકલ્યું ${fmtDate(sheet.submittedAt)}` : 'ડ્રાફ્ટ'} icon={Send} tone="violet" />
          </div>

          {sheet.status === 'rejected' && sheet.rejectionReason && (
            <Card className="mb-4 border-rose-200 dark:border-rose-500/40">
              <div className="px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                ટાઇમશીટ નકારાઈ: {sheet.rejectionReason} — સુધારો કરીને ફરી મોકલો.
              </div>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="સાપ્તાહિક એન્ટ્રીઓ" subtitle={`${entries.length} એન્ટ્રી`} icon={CalendarDays}
                action={<Badge value={sheet.status} />}
              />
              {entries.length === 0 ? <EmptyState title="કોઈ એન્ટ્રી નથી" message="«એન્ટ્રી ઉમેરો» દબાવીને આ સપ્તાહનો સમય લોગ કરો." /> : (
                <TableWrap>
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr><th className="th">તારીખ</th><th className="th">પ્રોજેક્ટ / કાર્ય</th><th className="th">કલાક</th><th className="th">વર્ણન</th><th className="th">બિલેબલ</th><th className="th text-right">ક્રિયાઓ</th></tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e._id} className="row">
                        <td className="td">{fmtDate(e.date)}</td>
                        <td className="td text-xs">{e.project?.name || '—'}<span className="block text-slate-400">{e.task?.title || ''}</span></td>
                        <td className="td font-medium">{e.hours}</td>
                        <td className="td max-w-xs whitespace-normal text-xs text-slate-600 dark:text-slate-300">{e.description}</td>
                        <td className="td">{e.billable ? <Badge value="paid" label="હા" /> : <span className="text-xs text-slate-400">ના</span>}</td>
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            {editable && (
                              <>
                                <button
                                  className="btn-ghost btn-xs"
                                  onClick={() => {
                                    setEditing(e);
                                    setForm({
                                      date: new Date(e.date).toISOString().slice(0, 10), project: e.project?._id || e.project || '',
                                      task: e.task?._id || e.task || '', hours: e.hours, description: e.description, billable: e.billable !== false,
                                    });
                                    setEntryOpen(true);
                                  }}
                                >સંપાદિત</button>
                                <button className="btn-ghost btn-xs text-rose-600" onClick={() => deleteEntry.mutate(e._id)}><Trash2 className="h-3.5 w-3.5" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>

            <Card>
              <CardHeader title="દિવસ મુજબ કલાક" subtitle="આ સપ્તાહ" icon={Clock} />
              <div className="space-y-3 p-4">
                {Object.entries(byDay).length === 0 && <EmptyState />}
                {Object.entries(byDay).sort().map(([day, hrs]) => (
                  <div key={day}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{fmtDate(day)}</span>
                      <span className="font-medium">{hrs} કલાક</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (hrs / 8) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                <p className="pt-2 text-[11px] text-slate-400">એક દિવસમાં મહત્તમ 24 કલાક લોગ થઈ શકે છે; 8 કલાકથી વધુ લોગ ઓવરટાઇમ ગણાય છે.</p>
              </div>
            </Card>
          </div>
        </>
      )}

      <Modal
        open={entryOpen} onClose={() => { setEntryOpen(false); setEditing(null); }} size="sm"
        title={editing ? 'એન્ટ્રી સંપાદિત કરો' : 'નવી ટાઇમ એન્ટ્રી'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setEntryOpen(false); setEditing(null); }}>રદ</Button>
            <Button
              loading={addEntry.isPending || updateEntry.isPending}
              disabled={!form.description || !form.hours}
              onClick={() => (editing ? updateEntry.mutate({ entryId: editing._id, payload: { hours: Number(form.hours), description: form.description, billable: form.billable } }) : addEntry.mutate({ ...form, hours: Number(form.hours), project: form.project || undefined, task: form.task || undefined }))}
            >{editing ? 'અપડેટ' : 'ઉમેરો'}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input label="તારીખ" type="date" value={form.date} disabled={!!editing} min={sheet?.weekStart ? new Date(sheet.weekStart).toISOString().slice(0, 10) : undefined} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label="પ્રોજેક્ટ" placeholder="કોઈ નહીં" options={(projects?.data || []).map((p) => ({ value: p._id, label: p.name }))} value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value, task: '' })} />
          {form.project && (
            <Select label="કાર્ય (વૈકલ્પિક)" placeholder="કોઈ નહીં" options={(tasks?.data || []).map((t) => ({ value: t._id, label: t.title }))} value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} />
          )}
          <Input label="કલાક" type="number" step="0.25" min="0.25" max="24" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          <Textarea label="શું કામ કર્યું?" rows={3} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            બિલેબલ
          </label>
        </div>
      </Modal>
    </div>
  );
}
