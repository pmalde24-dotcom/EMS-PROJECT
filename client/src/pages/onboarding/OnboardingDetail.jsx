import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, ClipboardCheck, FileText, Laptop, ListChecks, Presentation, UserCheck } from 'lucide-react';
import { onboardingApi, assetApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Progress, Select, Skeleton,
  TableWrap, Tabs, Textarea,
} from '../../components/ui';
import { fmtDate, fmtDateTime, label } from '../../lib/utils';

export default function OnboardingDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState('tasks');
  const [docModal, setDocModal] = useState(null);
  const [assetModal, setAssetModal] = useState(false);
  const [assetForm, setAssetForm] = useState({ assetId: '', note: '' });

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['onboarding', id], queryFn: () => onboardingApi.get(id), enabled: !!id });
  const { data: availableAssets } = useQuery({ queryKey: ['assets', 'available'], queryFn: () => assetApi.list({ limit: 200, status: 'available' }), enabled: assetModal });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['onboarding'] });

  const updateTask = useMutation({
    mutationFn: ({ taskId, payload }) => onboardingApi.updateTask(id, taskId, payload),
    onSuccess: () => { toast.success('ટાસ્ક અપડેટ થયો'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const verifyDoc = useMutation({
    mutationFn: ({ docId, payload }) => onboardingApi.verifyDocument(id, docId, payload),
    onSuccess: () => { toast.success('દસ્તાવેજ ચકાસાયો'); invalidate(); setDocModal(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const addAsset = useMutation({
    mutationFn: (payload) => onboardingApi.addAsset(id, payload),
    onSuccess: () => { toast.success('એસેટ સોંપાયું'); invalidate(); setAssetModal(false); setAssetForm({ assetId: '', note: '' }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const acknowledge = useMutation({
    mutationFn: (agreementId) => onboardingApi.acknowledge(id, agreementId),
    onSuccess: () => { toast.success('સ્વીકૃતિ નોંધાઈ'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const complete = useMutation({
    mutationFn: () => onboardingApi.complete(id, {}),
    onSuccess: () => { toast.success('ઓનબોર્ડિંગ પૂર્ણ થયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !data?.data) return <Card><ErrorState onRetry={refetch} /></Card>;

  const r = data.data;
  const tasks = r.tasks || [];
  const done = tasks.filter((t) => t.status === 'completed').length;
  const docs = r.documents || [];
  const verified = docs.filter((d) => d.status === 'verified').length;

  return (
    <div>
      <Link to="/onboarding" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> ઓનબોર્ડિંગ યાદી
      </Link>

      <PageHeader
        title={`${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`}
        subtitle={`${r.employee?.employeeId || ''} · ${r.employee?.designation?.title || ''} · શરૂઆત ${fmtDate(r.startDate)} · લક્ષ્ય ${fmtDate(r.targetCompletionDate)}`}
        actions={(
          <>
            <Badge value={r.status} />
            {can('onboarding:update') && r.status !== 'completed' && (
              <Button variant="success" icon={CheckCircle2} loading={complete.isPending} onClick={() => complete.mutate()}>ઓનબોર્ડિંગ પૂર્ણ કરો</Button>
            )}
          </>
        )}
      />

      <Card className="mb-4">
        <div className="grid gap-4 p-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">એકંદર પ્રગતિ</p>
            <Progress value={tasks.length ? (done / tasks.length) * 100 : 0} showLabel className="mt-1" />
            <p className="mt-1 text-xs text-slate-500">{done}/{tasks.length} ટાસ્ક · {verified}/{docs.length} દસ્તાવેજ ચકાસાયેલ · {(r.assets || []).length} એસેટ સોંપાયેલ</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">બડી</p>
            <p className="text-sm font-medium">{r.buddy ? `${r.buddy.firstName} ${r.buddy.lastName}` : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">HR / મેનેજર</p>
            <p className="text-sm font-medium">{(r.hrOwner?.name) || '—'} / {r.managerOwner ? `${r.managerOwner.firstName} ${r.managerOwner.lastName}` : '—'}</p>
          </div>
        </div>
      </Card>

      <Tabs
        className="mb-4" active={tab} onChange={setTab}
        tabs={[
          { value: 'tasks', label: 'ટાસ્ક', count: tasks.length },
          { value: 'documents', label: 'દસ્તાવેજ', count: docs.length },
          { value: 'agreements', label: 'કરાર', count: (r.agreements || []).length },
          { value: 'assets', label: 'એસેટ', count: (r.assets || []).length },
          { value: 'orientation', label: 'ઓરિએન્ટેશન', count: (r.orientation || []).length },
        ]}
      />

      {tab === 'tasks' && (
        <Card>
          <CardHeader title="ઓનબોર્ડિંગ ટાસ્ક" subtitle="સ્થિતિ અપડેટ કરો" icon={ListChecks} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">ટાસ્ક</th><th className="th">શ્રેણી</th><th className="th">જવાબદાર</th><th className="th">ડેડલાઇન</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t._id} className="row">
                  <td className="td"><p className="font-medium">{t.title}</p>{t.description && <p className="max-w-md truncate text-xs text-slate-500">{t.description}</p>}</td>
                  <td className="td text-xs">{label(t.category)}</td>
                  <td className="td text-xs">{t.ownerRole || (t.assignedTo?.name || '—')}</td>
                  <td className="td">{fmtDate(t.dueDate)}</td>
                  <td className="td"><Badge value={t.status === 'completed' ? 'completed' : 'pending'} label={t.status === 'completed' ? 'પૂર્ણ' : label(t.status || 'pending')} /></td>
                  <td className="td text-right">
                    {can('onboarding:update') && t.status !== 'completed' && (
                      <Button size="xs" variant="success" onClick={() => updateTask.mutate({ taskId: t._id, payload: { status: 'completed' } })}>પૂર્ણ</Button>
                    )}
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && <tr><td className="td" colSpan={6}><EmptyState title="કોઈ ટાસ્ક નથી" /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader title="દસ્તાવેજ ચકાસણી" subtitle="જરૂરી દસ્તાવેજો અને સ્થિતિ" icon={FileText} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">દસ્તાવેજ</th><th className="th">શ્રેણી</th><th className="th">સ્થિતિ</th><th className="th">નોંધ</th><th className="th text-right">ક્રિયાઓ</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d._id} className="row">
                  <td className="td font-medium">{d.title}</td>
                  <td className="td text-xs">{label(d.category)}</td>
                  <td className="td"><Badge value={d.status === 'verified' ? 'approved' : d.status === 'rejected' ? 'rejected' : 'pending'} label={d.status === 'verified' ? 'ચકાસાયેલ' : d.status === 'rejected' ? 'નકારેલ' : 'બાકી'} /></td>
                  <td className="td text-xs text-slate-500">{d.remarks || '—'}</td>
                  <td className="td text-right">
                    {can('onboarding:update') && (
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="success" onClick={() => verifyDoc.mutate({ docId: d._id, payload: { status: 'verified' } })}>ચકાસો</Button>
                        <Button size="xs" variant="danger" onClick={() => verifyDoc.mutate({ docId: d._id, payload: { status: 'rejected', remarks: 'Document not clear' } })}>નકારો</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {docs.length === 0 && <tr><td className="td" colSpan={5}><EmptyState title="કોઈ દસ્તાવેજ જરૂરી નથી" /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'agreements' && (
        <Card>
          <CardHeader title="કરાર અને સ્વીકૃતિ" subtitle="નીતિ પાલન સ્વીકૃતિ" icon={ClipboardCheck} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(r.agreements || []).map((ag) => (
              <div key={ag._id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{ag.title}</p>
                  <p className="text-xs text-slate-500">{label(ag.type)} {ag.acknowledgedAt ? `· સ્વીકાર્યું ${fmtDateTime(ag.acknowledgedAt)}` : ''}</p>
                </div>
                {ag.acknowledged ? <Badge value="approved" label="સ્વીકારેલ" /> : (
                  <Button size="xs" onClick={() => acknowledge.mutate(ag._id)}><UserCheck className="h-3.5 w-3.5" /> સ્વીકૃતિ</Button>
                )}
              </div>
            ))}
            {(r.agreements || []).length === 0 && <EmptyState title="કોઈ કરાર નથી" />}
          </div>
        </Card>
      )}

      {tab === 'assets' && (
        <Card>
          <CardHeader
            title="એસેટ સોંપણી" subtitle="લેપટોપ, બેજ, એક્સેસરી" icon={Laptop}
            action={can('onboarding:update') && <Button size="xs" onClick={() => setAssetModal(true)}>એસેટ ઉમેરો</Button>}
          />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">એસેટ ID</th><th className="th">નામ</th><th className="th">શ્રેણી</th><th className="th">સોંપાયું</th></tr>
            </thead>
            <tbody>
              {(r.assets || []).map((a) => (
                <tr key={a._id} className="row">
                  <td className="td font-mono text-xs">{a.asset?.assetId || a.asset}</td>
                  <td className="td">{a.asset?.name || '—'}</td>
                  <td className="td">{label(a.asset?.category)}</td>
                  <td className="td">{fmtDate(a.assignedAt || a.createdAt)}</td>
                </tr>
              ))}
              {(r.assets || []).length === 0 && <tr><td className="td" colSpan={4}><EmptyState title="કોઈ એસેટ સોંપાયેલ નથી" /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'orientation' && (
        <Card>
          <CardHeader title="ઓરિએન્ટેશન સત્ર" subtitle="નિર્ધારિત સત્ર અને પ્રસ્તુતકર્તા" icon={Presentation} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(r.orientation || []).map((o) => (
              <div key={o._id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{o.title}</p>
                  <p className="text-xs text-slate-500">{fmtDateTime(o.scheduledAt)} · {o.durationMinutes} મિનિટ · {o.presenter || '—'}</p>
                </div>
                <Badge value={o.completed ? 'completed' : 'pending'} label={o.completed ? 'પૂર્ણ' : 'બાકી'} />
              </div>
            ))}
            {(r.orientation || []).length === 0 && <EmptyState title="કોઈ સત્ર નિર્ધારિત નથી" />}
          </div>
        </Card>
      )}

      <Modal
        open={!!docModal} onClose={() => setDocModal(null)} size="sm" title="દસ્તાવેજ ચકાસણી"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDocModal(null)}>બંધ</Button>
            <Button variant="danger" onClick={() => verifyDoc.mutate({ docId: docModal._id, payload: { status: 'rejected', remarks: docModal.remarks || 'Not accepted' } })}>નકારો</Button>
            <Button variant="success" onClick={() => verifyDoc.mutate({ docId: docModal._id, payload: { status: 'verified' } })}>ચકાસો</Button>
          </>
        )}
      >
        <Textarea label="નોંધ" rows={3} value={docModal?.remarks || ''} onChange={(e) => setDocModal({ ...docModal, remarks: e.target.value })} />
      </Modal>

      <Modal
        open={assetModal} onClose={() => setAssetModal(false)} size="sm" title="ઓનબોર્ડિંગમાં એસેટ ઉમેરો"
        footer={<><Button variant="secondary" onClick={() => setAssetModal(false)}>રદ</Button><Button loading={addAsset.isPending} disabled={!assetForm.assetId} onClick={() => addAsset.mutate(assetForm)}>સોંપો</Button></>}
      >
        <div className="space-y-4">
          <Select label="ઉપલબ્ધ એસેટ" required placeholder="પસંદ કરો" options={(availableAssets?.data || []).map((a) => ({ value: a._id, label: `${a.assetId} — ${a.name}` }))} value={assetForm.assetId} onChange={(e) => setAssetForm({ ...assetForm, assetId: e.target.value })} />
          <Input label="નોંધ" value={assetForm.note} onChange={(e) => setAssetForm({ ...assetForm, note: e.target.value })} />
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">
            ફક્ત «ઉપલબ્ધ» સ્થિતિના એસેટ અહીં દેખાય છે. સોંપતાં જ એસેટ રજિસ્ટરમાં સ્થિતિ આપમેળે બદલાય છે.
          </p>
        </div>
      </Modal>
    </div>
  );
}
