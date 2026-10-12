import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Briefcase, Building2, CalendarDays, IdCard, Mail, Phone, Save, ShieldCheck, UserCog } from 'lucide-react';
import { authApi, employeeApi, announcementApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, EmptyState, Input, PageHeader, Skeleton, StatCard, TableWrap,
} from '../../components/ui';
import { fmtDate, fmtDateTime, label } from '../../lib/utils';

export default function Profile() {
  const qc = useQueryClient();
  const { user, employeeId, can } = useAuth();
  const [contact, setContact] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => employeeApi.get(employeeId),
    enabled: !!employeeId,
  });
  const { data: me } = useQuery({ queryKey: ['auth', 'me'], queryFn: authApi.me });
  const { data: announcements } = useQuery({ queryKey: ['announcements', 'feed'], queryFn: announcementApi.feed });

  const emp = data?.data;
  const self = me?.data;

  const saveContact = useMutation({
    mutationFn: (payload) => employeeApi.update(employeeId, payload),
    onSuccess: () => { toast.success('સંપર્ક વિગત અપડેટ થઈ'); qc.invalidateQueries({ queryKey: ['employee', employeeId] }); setContact(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const savePrefs = useMutation({
    mutationFn: (payload) => authApi.preferences(payload),
    onSuccess: () => toast.success('પસંદગી સાચવાઈ'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const form = contact || {
    phone: emp?.phone || '', personalEmail: emp?.personalEmail || '',
    address: emp?.address || { line1: '', city: '', state: '', pincode: '' },
    emergencyContact: emp?.emergencyContact || { name: '', relation: '', phone: '' },
  };
  const setNested = (key, patch) => setContact({ ...form, [key]: { ...(form[key] || {}), ...patch } });
  const editable = can('employees:update') || !!employeeId;

  return (
    <div>
      <PageHeader
        title="મારી પ્રોફાઇલ"
        subtitle="તમારી કર્મચારી માહિતી, સંપર્ક વિગત અને પસંદગીઓ"
        actions={<Link to="/profile/security" className="btn-secondary"><ShieldCheck className="h-4 w-4" /> સુરક્ષા અને સેશન</Link>}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <Avatar src={emp?.profilePhoto} name={self?.name || emp?.firstName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {emp ? `${emp.firstName} ${emp.lastName}` : self?.name}
              {emp?.isActive !== false && <BadgeCheck className="ml-1 inline h-4 w-4 text-brand-600" />}
            </h2>
            <p className="text-sm text-slate-500">
              {emp?.designation?.title || self?.designation || '—'} · {emp?.department?.name || '—'}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {emp?.employeeId} · {label(emp?.employmentType)} · જોડાયા {fmtDate(emp?.joiningDate)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge value={emp?.employmentStatus} />
            <Badge value={user?.role} label={label(user?.role)} />
          </div>
        </div>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કર્મચારી ID" value={emp?.employeeId || '—'} icon={IdCard} tone="brand" />
        <StatCard label="વિભાગ" value={emp?.department?.name || '—'} icon={Building2} tone="violet" />
        <StatCard label="હોદ્દો" value={emp?.designation?.title || '—'} icon={Briefcase} tone="emerald" />
        <StatCard label="રિપોર્ટિંગ મેનેજર" value={emp?.reportingManager ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName}` : '—'} icon={UserCog} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="સંપર્ક વિગત" subtitle="તમે તમારો ફોન, સરનામું અને ઇમરજન્સી સંપર્ક અપડેટ કરી શકો છો" icon={Phone} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Input label="મોબાઇલ" value={form.phone} onChange={(e) => setContact({ ...form, phone: e.target.value })} />
            <Input label="વ્યક્તિગત ઈમેલ" type="email" value={form.personalEmail} onChange={(e) => setContact({ ...form, personalEmail: e.target.value })} />
            <Input label="સરનામું" wrapperClassName="sm:col-span-2" value={form.address?.line1 || ''} onChange={(e) => setNested('address', { line1: e.target.value })} />
            <Input label="શહેર" value={form.address?.city || ''} onChange={(e) => setNested('address', { city: e.target.value })} />
            <Input label="રાજ્ય" value={form.address?.state || ''} onChange={(e) => setNested('address', { state: e.target.value })} />
            <Input label="પિનકોડ" value={form.address?.pincode || ''} onChange={(e) => setNested('address', { pincode: e.target.value })} />
            <Input label="ઇમરજન્સી સંપર્કનું નામ" value={form.emergencyContact?.name || ''} onChange={(e) => setNested('emergencyContact', { name: e.target.value })} />
            <Input label="સંબંધ" value={form.emergencyContact?.relation || ''} onChange={(e) => setNested('emergencyContact', { relation: e.target.value })} />
            <Input label="ઇમરજન્સી ફોન" value={form.emergencyContact?.phone || ''} onChange={(e) => setNested('emergencyContact', { phone: e.target.value })} />
            {editable && (
              <div className="sm:col-span-2">
                <Button icon={Save} loading={saveContact.isPending} onClick={() => saveContact.mutate({ phone: form.phone, personalEmail: form.personalEmail, address: form.address, emergencyContact: form.emergencyContact })}>સંપર્ક વિગત સાચવો</Button>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="નોકરીની વિગત" icon={Briefcase} />
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <Row l="કર્મચારી ID" v={emp?.employeeId || '—'} />
              <Row l="જોડાણ તારીખ" v={fmtDate(emp?.joiningDate)} />
              <Row l="રોજગાર પ્રકાર" v={label(emp?.employmentType)} />
              <Row l="સ્થિતિ" v={label(emp?.employmentStatus)} />
              <Row l="કામનું સ્થળ" v={emp?.workLocation?.name || emp?.workLocation || '—'} />
              <Row l="શિફ્ટ" v={emp?.shift?.name || '—'} />
              <Row l="રિપોર્ટિંગ મેનેજર" v={emp?.reportingManager ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName}` : '—'} />
              <Row l="કુલ અનુભવ" v={emp?.totalExperience ? `${emp.totalExperience} વર્ષ` : '—'} />
            </div>
          </Card>

          <Card>
            <CardHeader title="લોગિન અને ભૂમિકા" icon={ShieldCheck} />
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <Row l="લોગિન ઈમેલ" v={self?.email || user?.email} />
              <Row l="ભૂમિકા" v={label(user?.role)} />
              <Row l="છેલ્લું લોગિન" v={user?.lastLoginAt ? fmtDateTime(user.lastLoginAt) : '—'} />
              <Row l="વિભાગ (સ્કોપ)" v={emp?.department?.name || '—'} />
            </div>
          </Card>

          <Card>
            <CardHeader title="સૂચના પસંદગી" icon={Mail} />
            <div className="space-y-3 p-4">
              <Checkbox
                label="ઈમેલ સૂચનાઓ"
                checked={user?.notificationPrefs?.email !== false}
                onChange={(e) => savePrefs.mutate({ email: e.target.checked })}
              />
              <Checkbox
                label="જન્મદિવસ / એનિવર્સરી યાદ"
                checked={user?.notificationPrefs?.birthday !== false}
                onChange={(e) => savePrefs.mutate({ birthday: e.target.checked })}
              />
              <Checkbox
                label="અંદરની એપ સૂચનાઓ"
                checked={user?.notificationPrefs?.inApp !== false}
                onChange={(e) => savePrefs.mutate({ inApp: e.target.checked })}
              />
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="મારી પ્રોફાઇલમાં દેખાતી તાજેતરની જાહેરાતો" subtitle={`${(announcements?.data || []).length} જાહેરાત`} icon={CalendarDays} />
        {(announcements?.data || []).length === 0 ? <EmptyState title="કોઈ જાહેરાત નથી" /> : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">શીર્ષક</th><th className="th">પ્રકાર</th><th className="th">તારીખ</th></tr>
            </thead>
            <tbody>
              {(announcements?.data || []).slice(0, 5).map((a) => (
                <tr key={a._id} className="row">
                  <td className="td">{a.title}</td>
                  <td className="td text-xs"><Badge value={a.category} /></td>
                  <td className="td text-xs">{fmtDate(a.publishedAt || a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

function Row({ l, v }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{l}</span>
      <span className="font-medium text-slate-700 dark:text-slate-200">{v}</span>
    </div>
  );
}
