import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell, Building2, CalendarClock, Database, Percent, Save, ShieldCheck, Sliders, Upload, Wallet,
} from 'lucide-react';
import { settingsApi, userApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Input, Select, Skeleton, TableWrap, Tabs,
} from '../../components/ui';
import { daysOfWeek } from '../../lib/utils';

const TABS = [
  { value: 'company', label: 'કંપની' },
  { value: 'attendance', label: 'હાજરી નીતિ' },
  { value: 'leave', label: 'રજા નીતિ' },
  { value: 'payroll', label: 'પગાર અને વૈધાનિક દર' },
  { value: 'notifications', label: 'સૂચનાઓ' },
  { value: 'retention', label: 'ડેટા રીટેન્શન' },
  { value: 'roles', label: 'ભૂમિકા અને પરવાનગીઓ' },
  { value: 'system', label: 'સિસ્ટમ' },
];

export default function Settings() {
  const qc = useQueryClient();
  const { hasRole, can } = useAuth();
  const isSuperAdmin = hasRole('super_admin');
  const [tab, setTab] = useState('company');
  const [form, setForm] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const { data: roles } = useQuery({ queryKey: ['settings', 'roles'], queryFn: settingsApi.roles, enabled: tab === 'roles' });
  const { data: catalog } = useQuery({ queryKey: ['users', 'permission-catalog'], queryFn: userApi.permissionCatalog, enabled: tab === 'roles' });
  const { data: system } = useQuery({ queryKey: ['settings', 'system'], queryFn: settingsApi.system, enabled: tab === 'system' });
  const { data: reference } = useQuery({ queryKey: ['settings', 'reference'], queryFn: settingsApi.reference, enabled: tab === 'system' });

  useEffect(() => { if (data?.data && !form) setForm(data.data); }, [data, form]);

  const save = useMutation({
    mutationFn: (payload) => settingsApi.update(payload),
    onSuccess: (res) => { toast.success(res.message || 'સેટિંગ્સ સાચવાઈ'); setForm(res.data); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const uploadLogo = useMutation({
    mutationFn: (fd) => settingsApi.uploadLogo(fd),
    onSuccess: () => { toast.success('લોગો અપડેટ થયો'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const saveRole = useMutation({
    mutationFn: ({ key, body }) => settingsApi.updateRole(key, body),
    onSuccess: () => { toast.success('ભૂમિકા અપડેટ થઈ'); qc.invalidateQueries({ queryKey: ['settings', 'roles'] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading || !form) return <Skeleton className="h-96 w-full" />;
  if (isError) return <Card><ErrorState onRetry={refetch} /></Card>;

  const set = (patch) => setForm({ ...form, ...patch });
  const setNested = (key, patch) => setForm({ ...form, [key]: { ...(form[key] || {}), ...patch } });
  const editable = can('settings:update');

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">કંપની સેટિંગ્સ</h1>
          <p className="text-sm text-slate-500">કંપની પ્રોફાઇલ, નીતિઓ, પગાર દર, સૂચનાઓ અને ભૂમિકા પરવાનગીઓ</p>
        </div>
        {editable && tab !== 'roles' && tab !== 'system' && (
          <Button icon={Save} loading={save.isPending} onClick={() => save.mutate(form)}>સેટિંગ્સ સાચવો</Button>
        )}
      </div>

      <Tabs className="mb-4 overflow-x-auto" active={tab} onChange={setTab} tabs={TABS} />

      {tab === 'company' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="કંપની પ્રોફાઇલ" icon={Building2} />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Input label="કંપનીનું નામ" value={form.name || ''} onChange={(e) => set({ name: e.target.value })} disabled={!editable} />
              <Input label="કાનૂની નામ" value={form.legalName || ''} onChange={(e) => set({ legalName: e.target.value })} disabled={!editable} />
              <Input label="ઈમેલ" value={form.email || ''} onChange={(e) => set({ email: e.target.value })} disabled={!editable} />
              <Input label="ફોન" value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} disabled={!editable} />
              <Input label="વેબસાઇટ" value={form.website || ''} onChange={(e) => set({ website: e.target.value })} disabled={!editable} />
              <Input label="GST / ટેક્સ ID" value={form.taxId || ''} onChange={(e) => set({ taxId: e.target.value })} disabled={!editable} />
              <Input label="સરનામું (લાઇન 1)" wrapperClassName="sm:col-span-2" value={form.address?.line1 || ''} onChange={(e) => setNested('address', { line1: e.target.value })} disabled={!editable} />
              <Input label="શહેર" value={form.address?.city || ''} onChange={(e) => setNested('address', { city: e.target.value })} disabled={!editable} />
              <Input label="રાજ્ય" value={form.address?.state || ''} onChange={(e) => setNested('address', { state: e.target.value })} disabled={!editable} />
              <Input label="પિનકોડ" value={form.address?.pincode || ''} onChange={(e) => setNested('address', { pincode: e.target.value })} disabled={!editable} />
              <Input label="દેશ" value={form.address?.country || ''} onChange={(e) => setNested('address', { country: e.target.value })} disabled={!editable} />
              <Select label="ટાઇમઝોન" options={['Asia/Kolkata', 'Asia/Dubai', 'UTC', 'America/New_York'].map((x) => ({ value: x, label: x }))} value={form.timezone || 'Asia/Kolkata'} onChange={(e) => set({ timezone: e.target.value })} disabled={!editable} />
              <Select label="ચલણ" options={[{ value: 'INR', label: 'INR ₹' }, { value: 'USD', label: 'USD $' }, { value: 'AED', label: 'AED د.إ' }]} value={form.currency || 'INR'} onChange={(e) => set({ currency: e.target.value, currencySymbol: e.target.value === 'INR' ? '₹' : e.target.value === 'USD' ? '$' : 'د.إ' })} disabled={!editable} />
              <Input label="કર્મચારી ID ફોર્મેટ" value={form.employeeIdPattern || ''} onChange={(e) => set({ employeeIdPattern: e.target.value })} disabled={!editable} />
              <Input label="નાણાકીય વર્ષ શરૂ (MM-DD)" value={form.financialYearStart || ''} onChange={(e) => set({ financialYearStart: e.target.value })} disabled={!editable} />
              <div className="sm:col-span-2">
                <label className="label">કામકાજના દિવસો</label>
                <div className="flex flex-wrap gap-3">
                  {daysOfWeek.map((d, i) => (
                    <Checkbox
                      key={i} label={d} disabled={!editable}
                      checked={(form.workingDays || []).includes(i)}
                      onChange={(e) => set({ workingDays: e.target.checked ? [...(form.workingDays || []), i].sort((a, b) => a - b) : (form.workingDays || []).filter((x) => x !== i) })}
                    />
                  ))}
                </div>
              </div>
              <Input label="કામકાજ શરૂ" type="time" value={form.workingHours?.start || ''} onChange={(e) => setNested('workingHours', { start: e.target.value })} disabled={!editable} />
              <Input label="કામકાજ અંત" type="time" value={form.workingHours?.end || ''} onChange={(e) => setNested('workingHours', { end: e.target.value })} disabled={!editable} />
            </div>
          </Card>

          <Card>
            <CardHeader title="કંપની લોગો" subtitle="PNG/JPG, 2 MB સુધી" icon={Upload} />
            <div className="space-y-4 p-4">
              {form.logo?.url
                ? <img src={form.logo.url} alt="logo" className="h-20 w-20 rounded-xl border border-slate-200 object-contain dark:border-slate-800" />
                : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400 dark:bg-slate-800">લોગો નથી</div>}
              {editable && (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 transition hover:border-brand-400 dark:border-slate-700">
                  <Upload className="h-3.5 w-3.5" /> લોગો અપલોડ કરો
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) return toast.error('લોગો 2 MB થી મોટો છે');
                      const fd = new FormData();
                      fd.append('logo', file);
                      uploadLogo.mutate(fd);
                    }}
                  />
                </label>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <Card>
          <CardHeader title="હાજરી નીતિ" icon={CalendarClock} subtitle="આ નિયમો હાજરી ગણતરી, વિલંબ અને કરેક્શન પર લાગુ થાય છે" />
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <Input label="ગ્રેસ પીરિયડ (મિનિટ)" type="number" value={form.attendancePolicy?.gracePeriodMinutes ?? 0} onChange={(e) => setNested('attendancePolicy', { gracePeriodMinutes: Number(e.target.value) })} disabled={!editable} />
            <Input label="હાફ-ડે થ્રેશોલ્ડ (કલાક)" type="number" value={form.attendancePolicy?.halfDayThresholdHours ?? 0} onChange={(e) => setNested('attendancePolicy', { halfDayThresholdHours: Number(e.target.value) })} disabled={!editable} />
            <Input label="ફુલ-ડે કલાક" type="number" value={form.attendancePolicy?.fullDayHours ?? 0} onChange={(e) => setNested('attendancePolicy', { fullDayHours: Number(e.target.value) })} disabled={!editable} />
            <Input label="ઓવરટાઇમ આ પછી (કલાક)" type="number" value={form.attendancePolicy?.overtimeAfterHours ?? 0} onChange={(e) => setNested('attendancePolicy', { overtimeAfterHours: Number(e.target.value) })} disabled={!editable} />
            <Input label="મહત્તમ ઓવરટાઇમ / દિવસ" type="number" value={form.attendancePolicy?.maxOvertimeHoursPerDay ?? 0} onChange={(e) => setNested('attendancePolicy', { maxOvertimeHoursPerDay: Number(e.target.value) })} disabled={!editable} />
            <Input label="કરેક્શન વિન્ડો (દિવસ)" type="number" value={form.attendancePolicy?.correctionWindowDays ?? 0} onChange={(e) => setNested('attendancePolicy', { correctionWindowDays: Number(e.target.value) })} disabled={!editable} />
            <Checkbox label="વર્ક ફ્રોમ હોમ મંજૂર" checked={!!form.attendancePolicy?.allowWorkFromHome} onChange={(e) => setNested('attendancePolicy', { allowWorkFromHome: e.target.checked })} disabled={!editable} />
            <Checkbox label="લોકેશન ફરજિયાત" checked={!!form.attendancePolicy?.requireLocation} onChange={(e) => setNested('attendancePolicy', { requireLocation: e.target.checked })} disabled={!editable} />
            <Checkbox label="મલ્ટિપલ પંચ મંજૂર" checked={!!form.attendancePolicy?.allowMultiplePunches} onChange={(e) => setNested('attendancePolicy', { allowMultiplePunches: e.target.checked })} disabled={!editable} />
            <Checkbox label="ઓટો એબ્સેન્ટ માર્ક કરો" checked={!!form.attendancePolicy?.autoMarkAbsent} onChange={(e) => setNested('attendancePolicy', { autoMarkAbsent: e.target.checked })} disabled={!editable} />
          </div>
        </Card>
      )}

      {tab === 'leave' && (
        <Card>
          <CardHeader title="રજા નીતિ" icon={Sliders} subtitle="ડિફોલ્ટ નિયમો — દરેક રજા પ્રકાર પર અલગ નિયમો પણ સેટ થઈ શકે છે" />
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <Input label="મહત્તમ કેરી ફોરવર્ડ (દિવસ)" type="number" value={form.leavePolicy?.maxCarryForwardDays ?? 0} onChange={(e) => setNested('leavePolicy', { maxCarryForwardDays: Number(e.target.value) })} disabled={!editable} />
            <Input label="દસ્તાવેજ પછી (દિવસ)" type="number" value={form.leavePolicy?.requireDocumentAfterDays ?? 0} onChange={(e) => setNested('leavePolicy', { requireDocumentAfterDays: Number(e.target.value) })} disabled={!editable} />
            <Input label="ન્યૂનતમ નોટિસ (દિવસ)" type="number" value={form.leavePolicy?.minNoticeDays ?? 0} onChange={(e) => setNested('leavePolicy', { minNoticeDays: Number(e.target.value) })} disabled={!editable} />
            <Input label="મહત્તમ સળંગ દિવસ" type="number" value={form.leavePolicy?.maxConsecutiveDays ?? 0} onChange={(e) => setNested('leavePolicy', { maxConsecutiveDays: Number(e.target.value) })} disabled={!editable} />
            <Checkbox label="કેરી ફોરવર્ડ ચાલુ" checked={!!form.leavePolicy?.carryForwardEnabled} onChange={(e) => setNested('leavePolicy', { carryForwardEnabled: e.target.checked })} disabled={!editable} />
            <Checkbox label="એનકેશમેન્ટ ચાલુ" checked={!!form.leavePolicy?.encashmentEnabled} onChange={(e) => setNested('leavePolicy', { encashmentEnabled: e.target.checked })} disabled={!editable} />
            <Checkbox label="હાફ-ડે રજા મંજૂર" checked={!!form.leavePolicy?.allowHalfDay} onChange={(e) => setNested('leavePolicy', { allowHalfDay: e.target.checked })} disabled={!editable} />
          </div>
        </Card>
      )}

      {tab === 'payroll' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="પગાર ગણતરી" icon={Wallet} subtitle="આંકડા અહીંથી કન્ફિગર થાય છે — કોડમાં કોઈ દર હાર્ડકોડ નથી" />
            <div className="grid gap-4 p-4 sm:grid-cols-4">
              <Input label="પગાર દિવસ" type="number" min={1} max={28} value={form.payrollSettings?.payDay ?? 1} onChange={(e) => setNested('payrollSettings', { payDay: Number(e.target.value) })} disabled={!editable} />
              <Input label="મહિનાના કામકાજ દિવસ" type="number" value={form.payrollSettings?.workingDaysPerMonth ?? 22} onChange={(e) => setNested('payrollSettings', { workingDaysPerMonth: Number(e.target.value) })} disabled={!editable} />
              <Input label="ઓવરટાઇમ મલ્ટિપ્લાયર" type="number" step="0.1" value={form.payrollSettings?.overtimeRateMultiplier ?? 1.5} onChange={(e) => setNested('payrollSettings', { overtimeRateMultiplier: Number(e.target.value) })} disabled={!editable} />
              <Input label="સ્ટાન્ડર્ડ ડિડક્શન (₹)" type="number" value={form.payrollSettings?.standardDeduction ?? 0} onChange={(e) => setNested('payrollSettings', { standardDeduction: Number(e.target.value) })} disabled={!editable} />
              <Select label="ટેક્સ રેજીમ" options={[{ value: 'new', label: 'નવો રેજીમ' }, { value: 'old', label: 'જૂનો રેજીમ' }]} value={form.payrollSettings?.taxRegime || 'new'} onChange={(e) => setNested('payrollSettings', { taxRegime: e.target.value })} disabled={!editable} />
              <Input label="મંજૂરી સ્તર" type="number" min={0} max={3} value={form.payrollSettings?.payrollApprovalLevels ?? 1} onChange={(e) => setNested('payrollSettings', { payrollApprovalLevels: Number(e.target.value) })} disabled={!editable} />
              <Checkbox label="પ્રોસેસ પછી લોક કરો" checked={!!form.payrollSettings?.lockAfterProcessing} onChange={(e) => setNested('payrollSettings', { lockAfterProcessing: e.target.checked })} disabled={!editable} />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="PF અને ESI" icon={Percent} subtitle="વૈધાનિક દરો — તમારી કંપની/રાજ્ય મુજબ બદલો" />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Checkbox label="PF ચાલુ" checked={!!form.payrollSettings?.pfEnabled} onChange={(e) => setNested('payrollSettings', { pfEnabled: e.target.checked })} disabled={!editable} />
                <Checkbox label="ESI ચાલુ" checked={!!form.payrollSettings?.esiEnabled} onChange={(e) => setNested('payrollSettings', { esiEnabled: e.target.checked })} disabled={!editable} />
                <Input label="PF કર્મચારી %" type="number" step="0.01" value={form.payrollSettings?.pfEmployeePercent ?? 12} onChange={(e) => setNested('payrollSettings', { pfEmployeePercent: Number(e.target.value) })} disabled={!editable} />
                <Input label="PF એમ્પ્લોયર %" type="number" step="0.01" value={form.payrollSettings?.pfEmployerPercent ?? 12} onChange={(e) => setNested('payrollSettings', { pfEmployerPercent: Number(e.target.value) })} disabled={!editable} />
                <Input label="ESI કર્મચારી %" type="number" step="0.01" value={form.payrollSettings?.esiEmployeePercent ?? 0.75} onChange={(e) => setNested('payrollSettings', { esiEmployeePercent: Number(e.target.value) })} disabled={!editable} />
                <Input label="ESI એમ્પ્લોયર %" type="number" step="0.01" value={form.payrollSettings?.esiEmployerPercent ?? 3.25} onChange={(e) => setNested('payrollSettings', { esiEmployerPercent: Number(e.target.value) })} disabled={!editable} />
                <Input label="ESI વેતન મર્યાદા (₹)" wrapperClassName="sm:col-span-2" type="number" value={form.payrollSettings?.esiWageLimit ?? 21000} onChange={(e) => setNested('payrollSettings', { esiWageLimit: Number(e.target.value) })} disabled={!editable} />
              </div>
            </Card>

            <Card>
              <CardHeader title="આવકવેરા સ્લેબ" icon={Percent} subtitle="વાર્ષિક સ્લેબ — ઉપરનું ટેક્સ દર લાગુ થાય છે" />
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Select wrapperClassName="flex-1" label="પ્રોફેશનલ ટેક્સ સ્લેબ સક્રિય" options={[{ value: 'yes', label: 'હા' }, { value: 'no', label: 'ના' }]} value={form.payrollSettings?.professionalTaxEnabled ? 'yes' : 'no'} onChange={(e) => setNested('payrollSettings', { professionalTaxEnabled: e.target.value === 'yes' })} disabled={!editable} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-400">આવકવેરા સ્લેબ</p>
                  {(form.payrollSettings?.taxSlabs || []).map((s, i) => (
                    <div key={i} className="mb-2 grid grid-cols-2 gap-2">
                      <Input placeholder="ઉપર સુધી (₹)" type="number" value={s.upTo ?? ''} disabled={!editable}
                        onChange={(e) => { const slabs = [...(form.payrollSettings.taxSlabs || [])]; slabs[i] = { ...s, upTo: e.target.value === '' ? null : Number(e.target.value) }; setNested('payrollSettings', { taxSlabs: slabs }); }} />
                      <Input placeholder="દર %" type="number" step="0.1" value={s.rate ?? 0} disabled={!editable}
                        onChange={(e) => { const slabs = [...(form.payrollSettings.taxSlabs || [])]; slabs[i] = { ...s, rate: Number(e.target.value) }; setNested('payrollSettings', { taxSlabs: slabs }); }} />
                    </div>
                  ))}
                  {editable && (
                    <div className="flex gap-2">
                      <Button size="xs" variant="secondary" onClick={() => setNested('payrollSettings', { taxSlabs: [...(form.payrollSettings.taxSlabs || []), { upTo: null, rate: 0 }] })}>સ્લેબ ઉમેરો</Button>
                      {(form.payrollSettings?.taxSlabs || []).length > 1 && (
                        <Button size="xs" variant="ghost" onClick={() => setNested('payrollSettings', { taxSlabs: form.payrollSettings.taxSlabs.slice(0, -1) })}>છેલ્લો દૂર કરો</Button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-400">પ્રોફેશનલ ટેક્સ સ્લેબ (માસિક)</p>
                  {(form.payrollSettings?.professionalTaxSlabs || []).map((s, i) => (
                    <div key={i} className="mb-2 grid grid-cols-2 gap-2">
                      <Input placeholder="ઉપર સુધી (₹)" type="number" value={s.upTo ?? ''} disabled={!editable}
                        onChange={(e) => { const slabs = [...(form.payrollSettings.professionalTaxSlabs || [])]; slabs[i] = { ...s, upTo: e.target.value === '' ? null : Number(e.target.value) }; setNested('payrollSettings', { professionalTaxSlabs: slabs }); }} />
                      <Input placeholder="રકમ (₹)" type="number" value={s.amount ?? 0} disabled={!editable}
                        onChange={(e) => { const slabs = [...(form.payrollSettings.professionalTaxSlabs || [])]; slabs[i] = { ...s, amount: Number(e.target.value) }; setNested('payrollSettings', { professionalTaxSlabs: slabs }); }} />
                    </div>
                  ))}
                  {editable && <Button size="xs" variant="secondary" onClick={() => setNested('payrollSettings', { professionalTaxSlabs: [...(form.payrollSettings.professionalTaxSlabs || []), { upTo: null, amount: 0 }] })}>સ્લેબ ઉમેરો</Button>}
                </div>
                <p className="text-[11px] text-slate-400">આ દરો દરેક પગાર રનમાં વપરાય છે — બદલાવ પછી નવો રન બનાવો.</p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <Card>
          <CardHeader title="સૂચના સેટિંગ્સ" icon={Bell} />
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <Checkbox label="ઈમેલ સૂચનાઓ ચાલુ" checked={!!form.notificationSettings?.emailEnabled} onChange={(e) => setNested('notificationSettings', { emailEnabled: e.target.checked })} disabled={!editable} />
            <Checkbox label="જન્મદિવસ યાદ" checked={!!form.notificationSettings?.birthdayReminders} onChange={(e) => setNested('notificationSettings', { birthdayReminders: e.target.checked })} disabled={!editable} />
            <Checkbox label="એનિવર્સરી યાદ" checked={!!form.notificationSettings?.anniversaryReminders} onChange={(e) => setNested('notificationSettings', { anniversaryReminders: e.target.checked })} disabled={!editable} />
            <Checkbox label="દસ્તાવેજ સમાપ્તિ યાદ" checked={!!form.notificationSettings?.documentExpiryReminders} onChange={(e) => setNested('notificationSettings', { documentExpiryReminders: e.target.checked })} disabled={!editable} />
            <Checkbox label="હાજરી યાદ" checked={!!form.notificationSettings?.attendanceReminders} onChange={(e) => setNested('notificationSettings', { attendanceReminders: e.target.checked })} disabled={!editable} />
            <Input label="દૈનિક ડાયજેસ્ટ સમય" type="time" value={form.notificationSettings?.dailyDigestAt || '09:00'} onChange={(e) => setNested('notificationSettings', { dailyDigestAt: e.target.value })} disabled={!editable} />
          </div>
        </Card>
      )}

      {tab === 'retention' && (
        <Card>
          <CardHeader title="ડેટા રીટેન્શન" icon={Database} subtitle="ઓડિટ લોગ કાયમી અને અપરિવર્તનીય રહે છે — માત્ર નીતિ સમયગાળો બદલાય છે" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Input label="ઓડિટ લોગ (દિવસ)" type="number" value={form.dataRetention?.auditLogDays ?? 730} onChange={(e) => setNested('dataRetention', { auditLogDays: Number(e.target.value) })} disabled={!editable} />
            <Input label="નિષ્ક્રિય કર્મચારી આર્કાઇવ (દિવસ)" type="number" value={form.dataRetention?.inactiveEmployeeArchivalDays ?? 3650} onChange={(e) => setNested('dataRetention', { inactiveEmployeeArchivalDays: Number(e.target.value) })} disabled={!editable} />
          </div>
        </Card>
      )}

      {tab === 'roles' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="ભૂમિકાઓ" subtitle="દરેક ભૂમિકાના કુલ પરવાનગી" icon={ShieldCheck} />
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">ભૂમિકા</th><th className="th">કી</th><th className="th">સ્તર</th><th className="th">વપરાશકર્તા</th><th className="th">પરવાનગી</th></tr>
              </thead>
              <tbody>
                {(roles?.data || []).map((r) => (
                  <tr key={r.key} className="row">
                    <td className="td font-medium">{r.name || r.key}</td>
                    <td className="td text-xs">{r.key}</td>
                    <td className="td text-xs">{r.level}</td>
                    <td className="td text-xs">{r.userCount ?? 0}</td>
                    <td className="td text-xs">{(r.permissions || []).length} પરવાનગી</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <Card>
            <CardHeader title="પરવાનગી મેટ્રિક્સ" subtitle={isSuperAdmin ? 'ટોગલ કરીને ભૂમિકાની પરવાનગી બદલો' : 'ફક્ત સુપર એડમિન બદલી શકે છે'} icon={ShieldCheck} />
            <div className="space-y-4 p-4">
              {(roles?.data || []).filter((r) => r.key !== 'super_admin').map((r) => (
                <RolePermissions
                  key={r.key} role={r} catalog={catalog?.data} editable={isSuperAdmin}
                  onSave={(permissions) => saveRole.mutate({ key: r.key, body: { permissions } })}
                />
              ))}
              {!roles && <EmptyState />}
            </div>
          </Card>
        </div>
      )}

      {tab === 'system' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="સિસ્ટમ સ્થિતિ" icon={Database} />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Info l="ડેટાબેઝ" v={system?.data?.database ? `${system.data.database.state} (${system.data.database.mode})` : '—'} />
              <Info l="ડેટાબેઝ નામ" v={system?.data?.database?.name || '—'} />
              <Info l="Cloudinary" v={system?.data?.integrations?.cloudinary || '—'} />
              <Info l="SMTP / ઈમેલ" v={system?.data?.integrations?.smtp || '—'} />
              <Info l="Node" v={system?.data?.node || '—'} />
              <Info l="અપટાઇમ (સેકન્ડ)" v={system?.data?.uptimeSeconds ?? '—'} />
              <Info l="વાતાવરણ" v={system?.data?.environment || '—'} />
              <Info l="વપરાશકર્તા / કર્મચારી" v={system?.data?.counts ? `${system.data.counts.users} / ${system.data.counts.employees}` : '—'} />
            </div>
          </Card>

          <Card>
            <CardHeader title="રેફરન્સ ડેટા" subtitle="બીજા મોડ્યુલમાં વપરાતા માસ્ટર રેકોર્ડ" icon={Sliders} />
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {[
                ['ડિપાર્ટમેન્ટ', reference?.data?.departments],
                ['હોદ્દા', reference?.data?.designations],
                ['રજા પ્રકાર', reference?.data?.leaveTypes],
                ['શિફ્ટ', reference?.data?.shifts],
                ['ઓનબોર્ડિંગ ટેમ્પલેટ', reference?.data?.onboardingTemplates],
                ['રિવ્યૂ ટેમ્પલેટ', reference?.data?.reviewTemplates],
              ].map(([label2, rows]) => (
                <div key={label2} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-slate-600 dark:text-slate-300">{label2}</span>
                  <Badge value={`${(rows || []).length} રેકોર્ડ`} label={`${(rows || []).length} રેકોર્ડ`} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function RolePermissions({ role, catalog, editable, onSave }) {
  const [perms, setPerms] = useState(role.permissions || []);
  const modules = catalog?.modules || [];
  const actions = catalog?.actions || [];
  const toggle = (p) => setPerms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">{role.name || role.key}</p>
          <p className="text-xs text-slate-500">{perms.length} પરવાનગી · {role.userCount ?? 0} વપરાશકર્તા</p>
        </div>
        {editable && <Button size="xs" icon={Save} onClick={() => onSave(perms)}>સાચવો</Button>}
      </div>
      <div className="max-h-56 overflow-y-auto">
        {modules.map((m) => (
          <div key={m} className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="w-32 shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">{m}</span>
            {actions.map((a) => {
              const p = `${m}:${a}`;
              const on = perms.includes(p);
              return (
                <button
                  key={p} disabled={!editable} onClick={() => toggle(p)}
                  className={`rounded-md px-2 py-0.5 text-[11px] transition ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'} ${editable ? '' : 'cursor-not-allowed opacity-70'}`}
                >{a}</button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Info({ l, v }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{l}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-slate-700 dark:text-slate-200">{v}</p>
    </div>
  );
}
