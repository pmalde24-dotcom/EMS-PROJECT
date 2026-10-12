import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, CheckCircle2, ClipboardList, Download, FileText, KeyRound, Laptop, MessageSquare, Wallet,
} from 'lucide-react';
import { offboardingApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Progress, Select,
  Skeleton, TableWrap, Tabs, Textarea,
} from '../../components/ui';
import { currency, fmtDate, fmtDateTime, label } from '../../lib/utils';

export default function OffboardingDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState('tasks');
  const [taskModal, setTaskModal] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', category: 'hr', ownerRole: 'hr' });
  const [settlement, setSettlement] = useState({ noticePay: 0, leaveEncashment: 0, bonus: 0, deductions: 0, remarks: '' });
  const [exitForm, setExitForm] = useState({ reasonForLeaving: '', likes: '', dislikes: '', suggestions: '', wouldRejoin: true, overallSatisfaction: 4 });

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['offboarding', id], queryFn: () => offboardingApi.get(id), enabled: !!id });
  const { data: recon } = useQuery({ queryKey: ['offboarding', id, 'recon'], queryFn: () => offboardingApi.reconciliation(id), enabled: !!id && tab === 'settlement' });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['offboarding'] });

  const updateTask = useMutation({
    mutationFn: ({ taskId, payload }) => offboardingApi.updateTask(id, taskId, payload),
    onSuccess: () => { toast.success('અપડેટ થયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const addTask = useMutation({
    mutationFn: (payload) => offboardingApi.addTask(id, payload),
    onSuccess: () => { toast.success('ટાસ્ક ઉમેરાયો'); invalidate(); setTaskModal(false); setTaskForm({ title: '', category: 'hr', ownerRole: 'hr' }); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const returnAsset = useMutation({
    mutationFn: ({ assignmentId, payload }) => offboardingApi.returnAsset(id, assignmentId, payload),
    onSuccess: () => { toast.success('એસેટ પરત નોંધાયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const revokeAccess = useMutation({
    mutationFn: (payload) => offboardingApi.revokeAccess(id, payload),
    onSuccess: () => { toast.success('એક્સેસ રિવોક નોંધાયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submitExit = useMutation({
    mutationFn: (payload) => offboardingApi.exitInterview(id, payload),
    onSuccess: () => { toast.success('એક્ઝિટ ઇન્ટરવ્યુ સાચવાયો'); invalidate(); setExitOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const saveSettlement = useMutation({
    mutationFn: (payload) => offboardingApi.settlement(id, payload),
    onSuccess: () => { toast.success('ફાઇનલ સેટલમેન્ટ સાચવાયું'); invalidate(); setSettlementOpen(false); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const complete = useMutation({
    mutationFn: () => offboardingApi.complete(id, {}),
    onSuccess: () => { toast.success('ઓફબોર્ડિંગ પૂર્ણ થયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !data?.data) return <Card><ErrorState onRetry={refetch} /></Card>;

  const r = data.data;
  const tasks = r.tasks || [];
  const done = tasks.filter((t) => t.status === 'completed').length;
  const settlementData = r.finalSettlement || {};
  const netSettlement = (settlementData.noticePay || 0) + (settlementData.leaveEncashment || 0) + (settlementData.bonus || 0) - (settlementData.deductions || 0);

  return (
    <div>
      <Link to="/offboarding" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> ઓફબોર્ડિંગ યાદી
      </Link>

      <PageHeader
        title={`${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`}
        subtitle={`${r.employee?.employeeId || ''} · ${label(r.reason)} · LWD ${fmtDate(r.lastWorkingDay)} · નોટિસ ${r.noticeServedDays}/${r.noticePeriodDays} દિવસ`}
        actions={(
          <>
            <Badge value={r.status} />
            <a className="btn-secondary" href={offboardingApi.letterUrl(id, 'experience')} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> અનુભવ પત્ર</a>
            <a className="btn-secondary" href={offboardingApi.letterUrl(id, 'relieving')} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> રિલીવિંગ લેટર</a>
            {can('offboarding:update') && r.status !== 'completed' && (
              <Button variant="success" icon={CheckCircle2} loading={complete.isPending} onClick={() => complete.mutate()}>પૂર્ણ કરો</Button>
            )}
          </>
        )}
      />

      <Card className="mb-4">
        <div className="grid gap-4 p-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">પ્રક્રિયા પ્રગતિ</p>
            <Progress value={tasks.length ? (done / tasks.length) * 100 : 0} showLabel className="mt-1" />
            <p className="mt-1 text-xs text-slate-500">
              {done}/{tasks.length} ટાસ્ક · {(r.assetsReturned || []).filter((a) => a.returnedAt).length}/{(r.assetsReturned || []).length} એસેટ પરત
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">રાજીનામાની તારીખ</p>
            <p className="text-sm font-medium">{fmtDate(r.resignationDate)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">નોટિસ શોર્ટફોલ</p>
            <p className="text-sm font-medium">{r.noticeShortfallDays || 0} દિવસ</p>
          </div>
        </div>
        {r.reasonDetails && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">{r.reasonDetails}</p>}
      </Card>

      <Tabs
        className="mb-4" active={tab} onChange={setTab}
        tabs={[
          { value: 'tasks', label: 'ચેકલિસ્ટ', count: tasks.length },
          { value: 'assets', label: 'એસેટ રિટર્ન', count: (r.assetsReturned || []).length },
          { value: 'access', label: 'એક્સેસ રિવોક' },
          { value: 'exit', label: 'એક્ઝિટ ઇન્ટરવ્યુ' },
          { value: 'settlement', label: 'ફાઇનલ સેટલમેન્ટ' },
        ]}
      />

      {tab === 'tasks' && (
        <Card>
          <CardHeader
            title="ઓફબોર્ડિંગ ચેકલિસ્ટ" subtitle="દરેક વિભાગના કાર્ય" icon={ClipboardList}
            action={can('offboarding:update') && <Button size="xs" onClick={() => setTaskModal(true)}>ટાસ્ક ઉમેરો</Button>}
          />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">કાર્ય</th><th className="th">શ્રેણી</th><th className="th">જવાબદાર</th><th className="th">સ્થિતિ</th><th className="th text-right">ક્રિયા</th></tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t._id} className="row">
                  <td className="td font-medium">{t.title}</td>
                  <td className="td text-xs">{label(t.category)}</td>
                  <td className="td text-xs">{label(t.ownerRole)}</td>
                  <td className="td"><Badge value={t.status === 'completed' ? 'completed' : 'pending'} label={t.status === 'completed' ? 'પૂર્ણ' : 'બાકી'} /></td>
                  <td className="td text-right">
                    {can('offboarding:update') && t.status !== 'completed' && (
                      <Button size="xs" variant="success" onClick={() => updateTask.mutate({ taskId: t._id, payload: { status: 'completed' } })}>પૂર્ણ</Button>
                    )}
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && <tr><td className="td" colSpan={5}><EmptyState /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'assets' && (
        <Card>
          <CardHeader title="એસેટ પરત" subtitle="સોંપાયેલા એસેટ પરત લેવાની નોંધ" icon={Laptop} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">એસેટ</th><th className="th">શ્રેણી</th><th className="th">સ્થિતિ</th><th className="th">પરત તારીખ</th><th className="th text-right">ક્રિયાઓ</th></tr>
            </thead>
            <tbody>
              {(r.assetsReturned || []).map((a) => (
                <tr key={a._id} className="row">
                  <td className="td"><p className="font-medium">{a.asset?.name || '—'}</p><p className="text-xs text-slate-400">{a.asset?.assetId}</p></td>
                  <td className="td">{label(a.asset?.category)}</td>
                  <td className="td"><Badge value={a.status === 'returned' ? 'approved' : 'assigned'} label={a.status === 'returned' ? 'પરત' : 'સોંપાયેલ'} /></td>
                  <td className="td">{a.returnedAt ? fmtDate(a.returnedAt) : '—'}</td>
                  <td className="td text-right">
                    {can('offboarding:update') && !a.returnedAt && (
                      <Button size="xs" onClick={() => returnAsset.mutate({ assignmentId: a._id, payload: { condition: 'good' } })}>પરત લો</Button>
                    )}
                  </td>
                </tr>
              ))}
              {(r.assetsReturned || []).length === 0 && <tr><td className="td" colSpan={5}><EmptyState title="કોઈ એસેટ સોંપાયેલ નથી" /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {tab === 'access' && (
        <Card>
          <CardHeader title="સિસ્ટમ એક્સેસ રિવોક" subtitle="ઇમેઇલ, સિસ્ટમ, બિલ્ડિંગ અને VPN એક્સેસ બંધ કરો" icon={KeyRound} />
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { key: 'email', label: 'ઇમેઇલ એકાઉન્ટ' },
                { key: 'system', label: 'ઇન્ટરનલ સિસ્ટમ' },
                { key: 'building', label: 'બિલ્ડિંગ એક્સેસ' },
                { key: 'vpn', label: 'VPN / રિમોટ' },
              ].map((x) => (
                <div key={x.key} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{x.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.accessRevoked?.[x.key] ? `રિવોક થયું — ${fmtDateTime(r.accessRevoked.at)}` : 'હજી સક્રિય'}
                  </p>
                  {can('offboarding:update') && !r.accessRevoked?.[x.key] && (
                    <Button size="xs" className="mt-2" onClick={() => revokeAccess.mutate({ [x.key]: true })}>રિવોક કરો</Button>
                  )}
                </div>
              ))}
            </div>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              સલામતી: છેલ્લા કામકાજના દિવસ પછી તમામ એક્સેસ તાત્કાલિક બંધ થવો જોઈએ. કર્મચારીનું લોગિન પણ નિષ્ક્રિય કરવામાં આવે છે.
            </p>
          </div>
        </Card>
      )}

      {tab === 'exit' && (
        <Card>
          <CardHeader
            title="એક્ઝિટ ઇન્ટરવ્યુ" subtitle={r.exitInterview?.conductedAt ? `લેવાયો: ${fmtDateTime(r.exitInterview.conductedAt)}` : 'બાકી'} icon={MessageSquare}
            action={can('offboarding:update') && <Button size="xs" onClick={() => { setExitOpen(true); setExitForm({ ...exitForm, ...(r.exitInterview || {}) }); }}>{r.exitInterview?.conductedAt ? 'સંપાદિત કરો' : 'ઇન્ટરવ્યુ લો'}</Button>}
          />
          {!r.exitInterview?.conductedAt ? <EmptyState title="એક્ઝિટ ઇન્ટરવ્યુ લેવાયો નથી" /> : (
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Info l="જવાનું કારણ" v={label(r.exitInterview.reasonForLeaving)} />
              <Info l="ફરી જોડાશે?" v={r.exitInterview.wouldRejoin ? 'હા' : 'ના'} />
              <Info l="સંતોષ સ્કોર" v={`${r.exitInterview.overallSatisfaction}/5`} />
              <Info l="ગમ્યું" v={r.exitInterview.likes || '—'} />
              <Info l="ન ગમ્યું" v={r.exitInterview.dislikes || '—'} />
              <Info l="સૂચન" v={r.exitInterview.suggestions || '—'} />
            </div>
          )}
        </Card>
      )}

      {tab === 'settlement' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="ફાઇનલ સેટલમેન્ટ" subtitle="બાકી રજા, નોટિસ પે અને બોનસની ગણતરી" icon={Wallet}
              action={can('offboarding:update') && <Button size="xs" onClick={() => { setSettlement({ ...settlement, ...(r.finalSettlement || {}) }); setSettlementOpen(true); }}>સેટલમેન્ટ બનાવો</Button>}
            />
            <div className="space-y-2 p-4 text-sm">
              <Row l="નોટિસ પે" v={currency(settlementData.noticePay || 0)} />
              <Row l="રજા એનકેશમેન્ટ" v={currency(settlementData.leaveEncashment || 0)} />
              <Row l="બોનસ" v={currency(settlementData.bonus || 0)} />
              <Row l="કપાત" v={`-${currency(settlementData.deductions || 0)}`} />
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold dark:border-slate-800">
                <span>ચૂકવવાની રકમ</span><span>{currency(netSettlement)}</span>
              </div>
              {settlementData.remarks && <p className="pt-2 text-xs text-slate-500">{settlementData.remarks}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="રિકન્સિલિએશન" subtitle="સર્વર-ગણતરી સૂચનો" icon={ClipboardList} />
            <div className="space-y-2 p-4 text-sm">
              {!recon?.data ? <Skeleton className="h-24 w-full" /> : (
                <>
                  {(recon.data.balances || []).map((b, i) => (
                    <Row key={i} l={b.leaveType?.name || b.name || `બેલેન્સ ${i + 1}`} v={`${b.available ?? b.balance ?? 0} દિવસ ઉપલબ્ધ`} />
                  ))}
                  {(recon.data.suggestions || []).map((s, i) => (
                    <p key={i} className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                      {typeof s === 'string' ? s : JSON.stringify(s)}
                    </p>
                  ))}
                  {recon.data.structure && <Row l="માસિક ગ્રોસ" v={currency(recon.data.structure.grossMonthly)} />}
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={taskModal} onClose={() => setTaskModal(false)} size="sm" title="ચેકલિસ્ટ ટાસ્ક ઉમેરો"
        footer={<><Button variant="secondary" onClick={() => setTaskModal(false)}>રદ</Button><Button loading={addTask.isPending} disabled={!taskForm.title} onClick={() => addTask.mutate(taskForm)}>ઉમેરો</Button></>}
      >
        <div className="space-y-4">
          <Input label="કાર્ય" required value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
          <Select label="શ્રેણી" options={['it', 'hr', 'finance', 'admin', 'manager', 'other'].map((c) => ({ value: c, label: label(c) }))} value={taskForm.category} onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })} />
          <Select label="જવાબદાર" options={['hr', 'manager', 'it', 'finance', 'admin', 'employee'].map((c) => ({ value: c, label: label(c) }))} value={taskForm.ownerRole} onChange={(e) => setTaskForm({ ...taskForm, ownerRole: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={exitOpen} onClose={() => setExitOpen(false)} title="એક્ઝિટ ઇન્ટરવ્યુ"
        footer={<><Button variant="secondary" onClick={() => setExitOpen(false)}>રદ</Button><Button loading={submitExit.isPending} onClick={() => submitExit.mutate(exitForm)}>સાચવો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="જવાનું મુખ્ય કારણ" wrapperClassName="sm:col-span-2" options={['better_opportunity', 'higher_studies', 'relocation', 'health', 'family', 'compensation', 'work_environment', 'career_change', 'other'].map((x) => ({ value: x, label: label(x) }))} value={exitForm.reasonForLeaving} onChange={(e) => setExitForm({ ...exitForm, reasonForLeaving: e.target.value })} />
          <Textarea label="શું ગમ્યું" value={exitForm.likes} onChange={(e) => setExitForm({ ...exitForm, likes: e.target.value })} />
          <Textarea label="શું ન ગમ્યું" value={exitForm.dislikes} onChange={(e) => setExitForm({ ...exitForm, dislikes: e.target.value })} />
          <Textarea label="સૂચનો" wrapperClassName="sm:col-span-2" value={exitForm.suggestions} onChange={(e) => setExitForm({ ...exitForm, suggestions: e.target.value })} />
          <Input label="સંતોષ સ્કોર (1-5)" type="number" min={1} max={5} value={exitForm.overallSatisfaction} onChange={(e) => setExitForm({ ...exitForm, overallSatisfaction: Number(e.target.value) })} />
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={exitForm.wouldRejoin} onChange={(e) => setExitForm({ ...exitForm, wouldRejoin: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            ફરી જોડાવા તૈયાર?
          </label>
        </div>
      </Modal>

      <Modal
        open={settlementOpen} onClose={() => setSettlementOpen(false)} size="sm" title="ફાઇનલ સેટલમેન્ટ"
        footer={<><Button variant="secondary" onClick={() => setSettlementOpen(false)}>રદ</Button><Button loading={saveSettlement.isPending} onClick={() => saveSettlement.mutate({ ...settlement, noticePay: Number(settlement.noticePay) || 0, leaveEncashment: Number(settlement.leaveEncashment) || 0, bonus: Number(settlement.bonus) || 0, deductions: Number(settlement.deductions) || 0 })}>સાચવો</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="નોટિસ પે (₹)" type="number" value={settlement.noticePay} onChange={(e) => setSettlement({ ...settlement, noticePay: e.target.value })} />
          <Input label="રજા એનકેશમેન્ટ (₹)" type="number" value={settlement.leaveEncashment} onChange={(e) => setSettlement({ ...settlement, leaveEncashment: e.target.value })} />
          <Input label="બોનસ (₹)" type="number" value={settlement.bonus} onChange={(e) => setSettlement({ ...settlement, bonus: e.target.value })} />
          <Input label="કપાત (₹)" type="number" value={settlement.deductions} onChange={(e) => setSettlement({ ...settlement, deductions: e.target.value })} />
          <Textarea label="નોંધ" wrapperClassName="sm:col-span-2" rows={2} value={settlement.remarks} onChange={(e) => setSettlement({ ...settlement, remarks: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

function Row({ l, v }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500 dark:text-slate-400">{l}</span>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{v}</span>
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
