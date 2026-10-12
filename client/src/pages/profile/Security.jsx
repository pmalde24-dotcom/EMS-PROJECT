import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, KeyRound, Laptop, LogOut, Lock, ShieldCheck } from 'lucide-react';
import { authApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, Skeleton, StatCard, TableWrap,
} from '../../components/ui';
import { fmtDateTime, relativeTime } from '../../lib/utils';

export default function Security() {
  const qc = useQueryClient();
  const { logout } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['auth', 'activity'], queryFn: authApi.activity });

  const changePassword = useMutation({
    mutationFn: (payload) => authApi.changePassword(payload),
    onSuccess: () => { toast.success('પાસવર્ડ બદલાયો — ફરી લોગિન કરો'); setForm({ currentPassword: '', newPassword: '', confirm: '' }); setTimeout(() => logout(), 1200); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const logoutAll = useMutation({
    mutationFn: () => authApi.logoutAll(),
    onSuccess: () => { toast.success('બધા ઉપકરણ પરથી લોગઆઉટ થયું'); setTimeout(() => logout(), 800); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const sessions = data?.data?.activeSessions || [];
  const activity = data?.data?.loginActivity || [];

  return (
    <div>
      <PageHeader title="સુરક્ષા અને સેશન" subtitle="પાસવર્ડ, સક્રિય સેશન અને લોગિન ઇતિહાસ" />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="સક્રિય સેશન" value={sessions.length} icon={Laptop} tone="brand" />
        <StatCard label="લોગિન એન્ટ્રી" value={activity.length} icon={History} tone="violet" />
        <StatCard label="પાસવર્ડ" value="સુરક્ષિત" sub="છેલ્લે બદલવાની તારીખ પ્રોફાઇલમાં" icon={Lock} tone="emerald" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="પાસવર્ડ બદલો" icon={KeyRound} />
          <div className="space-y-4 p-4">
            <Input label="વર્તમાન પાસવર્ડ" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
            <Input label="નવો પાસવર્ડ" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} hint="8+ અક્ષર, મોટા/નાના અક્ષર અને આંકડો" />
            <Input label="નવો પાસવર્ડ (ફરી)" type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            <Button
              icon={ShieldCheck} className="w-full justify-center" loading={changePassword.isPending}
              disabled={!form.currentPassword || form.newPassword.length < 8 || form.newPassword !== form.confirm}
              onClick={() => changePassword.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword })}
            >પાસવર્ડ બદલો</Button>
            {form.newPassword && form.confirm && form.newPassword !== form.confirm && (
              <p className="text-xs text-rose-600">બંને પાસવર્ડ સરખા નથી</p>
            )}
            <Button variant="danger" icon={LogOut} className="w-full justify-center" loading={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
              બધા ઉપકરણ પરથી લોગઆઉટ
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="સક્રિય સેશન" subtitle="તમારા એકાઉન્ટમાં લોગિન થયેલા ઉપકરણ" icon={Laptop} />
          {isLoading ? <Skeleton className="m-4 h-40" /> : isError ? <ErrorState onRetry={refetch} /> : sessions.length === 0 ? (
            <EmptyState title="કોઈ સક્રિય સેશન નથી" />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><th className="th">ઉપકરણ / બ્રાઉઝર</th><th className="th">IP</th><th className="th">શરૂ થયું</th><th className="th">સમાપ્તિ</th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s._id} className="row">
                    <td className="td text-xs">{s.userAgent ? s.userAgent.slice(0, 70) : 'અજ્ઞાત ઉપકરણ'}</td>
                    <td className="td text-xs">{s.ip || '—'}</td>
                    <td className="td text-xs">{fmtDateTime(s.createdAt)}</td>
                    <td className="td text-xs">{fmtDateTime(s.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="લોગિન ઇતિહાસ" subtitle={`${activity.length} ઇવેન્ટ`} icon={History} />
        {isLoading ? <Skeleton className="m-4 h-40" /> : activity.length === 0 ? <EmptyState title="કોઈ ઇતિહાસ નથી" /> : (
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">સમય</th><th className="th">ઇવેન્ટ</th><th className="th">IP</th><th className="th">ઉપકરણ</th></tr>
            </thead>
            <tbody>
              {activity.map((a, i) => (
                <tr key={i} className="row">
                  <td className="td text-xs">{fmtDateTime(a.at || a.createdAt)}<span className="block text-slate-400">{relativeTime(a.at || a.createdAt)}</span></td>
                  <td className="td text-xs"><Badge value={a.status === 'success' ? 'active' : 'failed'} label={a.status === 'success' ? 'સફળ લોગિન' : (a.status || a.event || 'ઇવેન્ટ')} /></td>
                  <td className="td text-xs">{a.ip || '—'}</td>
                  <td className="td text-xs">{(a.userAgent || '').slice(0, 60) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
