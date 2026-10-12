import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlarmClock, CalendarDays, CheckCircle2, Coffee, Download, LogIn, LogOut, Play, Timer, TrendingUp, XCircle,
} from 'lucide-react';
import { attendanceApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, Skeleton, StatCard, Textarea,
  TableWrap, Select, Input,
} from '../../components/ui';
import { cn, fmtDate, fmtDateInput, fmtTime, hours, label, monthName, tone } from '../../lib/utils';

const clock = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function MyAttendance() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tick, setTick] = useState(0);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correction, setCorrection] = useState({ date: fmtDateInput(), checkIn: '', checkOut: '', reason: '' });

  const { data: today, isLoading, isError, refetch } = useQuery({ queryKey: ['attendance', 'today'], queryFn: attendanceApi.today, refetchInterval: 60_000 });
  const { data: calendar, isLoading: calLoading } = useQuery({
    queryKey: ['attendance', 'calendar', year, month],
    queryFn: () => attendanceApi.calendar({ year, month }),
  });
  const { data: summary } = useQuery({
    queryKey: ['attendance', 'summary', year, month],
    queryFn: () => attendanceApi.summary(null, { year, month }),
  });
  const { data: records } = useQuery({
    queryKey: ['attendance', 'me', 'records'],
    queryFn: () => attendanceApi.list({ limit: 10, sort: '-date' }),
  });

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['attendance'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const punchIn = useMutation({
    mutationFn: (body) => attendanceApi.punchIn(body),
    onSuccess: (res) => { toast.success(res.message || 'પંચ-ઇન થયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const punchOut = useMutation({
    mutationFn: (body) => attendanceApi.punchOut(body),
    onSuccess: (res) => { toast.success(res.message || 'પંચ-આઉટ થયું'); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const breakStart = useMutation({ mutationFn: () => attendanceApi.breakStart(), onSuccess: () => { toast.success('બ્રેક શરૂ'); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });
  const breakEnd = useMutation({ mutationFn: () => attendanceApi.breakEnd(), onSuccess: () => { toast.success('બ્રેક પૂર્ણ'); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });
  const requestCorrection = useMutation({
    mutationFn: (body) => attendanceApi.requestCorrection(body),
    onSuccess: () => { toast.success('સુધારા વિનંતી મોકલાઈ — મંજૂરી બાકી'); setCorrectionOpen(false); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const t = today?.data;
  const rec = t?.record;
  const live = t?.live;
  const onBreak = (rec?.breaks || []).some((b) => !b.end);
  const s = summary?.data || {};
  const days = calendar?.data?.days || [];
  const firstDay = days.length ? new Date(days[0].date).getUTCDay() : 0;

  const doPunchIn = () => {
    if (!navigator.geolocation) return punchIn.mutate({});
    navigator.geolocation.getCurrentPosition(
      (pos) => punchIn.mutate({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => punchIn.mutate({}),
      { timeout: 5000 },
    );
  };

  return (
    <div>
      <PageHeader
        title="મારી હાજરી"
        subtitle="પંચ-ઇન/આઉટ, બ્રેક, માસિક કેલેન્ડર અને સુધારા વિનંતી"
        actions={(
          <>
            <a href="/api/attendance?export=csv&limit=500" className="btn-secondary"><Download className="h-4 w-4" /> CSV</a>
            <Button variant="secondary" icon={AlarmClock} onClick={() => setCorrectionOpen(true)}>સુધારા વિનંતી</Button>
          </>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="આજની હાજરી"
            subtitle={t ? `${fmtDate(t.date)} · શિફ્ટ: ${t.shift ? `${t.shift.name} (${t.shift.startTime}–${t.shift.endTime})` : 'નિયુક્ત નથી'}` : ''}
            icon={Timer}
            action={rec ? <Badge value={rec.status} /> : null}
          />
          <div className="p-4">
            {isLoading ? <Skeleton className="h-40 w-full" /> : isError ? <ErrorState onRetry={refetch} /> : (
              <>
                {t?.holiday && (
                  <div className="mb-4 rounded-xl bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                    આજે તહેવાર છે: {t.holiday.name} — પંચ કરવાની જરૂર નથી.
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-4">
                  {[
                    { label: 'પંચ-ઇન', value: rec?.checkIn ? fmtTime(rec.checkIn) : '—', icon: LogIn },
                    { label: 'પંચ-આઉટ', value: rec?.checkOut ? fmtTime(rec.checkOut) : '—', icon: LogOut },
                    { label: 'કામ કરેલો સમય', value: live ? hours(Math.max(0, Math.round(live.workingMinutes))) : rec ? hours(rec.workedMinutes) : '—', icon: Timer },
                    { label: 'બ્રેક', value: rec ? `${rec.breakMinutes || 0} મિનિટ` : '—', icon: Coffee },
                  ].map((b) => (
                    <div key={b.label} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><b.icon className="h-3.5 w-3.5" /> {b.label}</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{b.value}</p>
                    </div>
                  ))}
                </div>

                {live && (
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      <Play className="mr-1 inline h-4 w-4" /> તમે કામ પર છો · લાઇવ સમય: <span className="font-mono">{clock(Date.now() - new Date(rec.checkIn))}</span> (અંદાજે)
                    </p>
                    <span className="text-xs text-emerald-600">ગણતરી સર્વર સમય પ્રમાણે:</span>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {can('attendance:create') && (
                    <>
                      {!rec?.checkIn && !t?.holiday && (
                        <Button icon={LogIn} loading={punchIn.isPending} onClick={doPunchIn}>પંચ-ઇન કરો</Button>
                      )}
                      {rec?.checkIn && !rec?.checkOut && (
                        <>
                          <Button variant="danger" icon={LogOut} loading={punchOut.isPending} onClick={() => punchOut.mutate({})}>પંચ-આઉટ કરો</Button>
                          {onBreak
                            ? <Button variant="success" icon={Play} loading={breakEnd.isPending} onClick={() => breakEnd.mutate()}>બ્રેક પૂર્ણ કરો</Button>
                            : <Button variant="secondary" icon={Coffee} loading={breakStart.isPending} onClick={() => breakStart.mutate()}>બ્રેક શરૂ કરો</Button>}
                        </>
                      )}
                      {rec?.checkOut && <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> આજની હાજરી પૂર્ણ</span>}
                    </>
                  )}
                  <Button variant="secondary" onClick={() => refetch()} loading={isLoading}>રિફ્રેશ</Button>
                </div>

                {rec?.isLate && (
                  <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
                    મોડું આવ્યા: {rec.lateMinutes} મિનિટ {rec.overtimeMinutes ? `· ઓવરટાઇમ: ${rec.overtimeMinutes} મિનિટ` : ''}
                  </p>
                )}
                {rec?.workFromHome && <p className="mt-1 text-xs font-medium text-brand-600">કાર્યસ્થળ: ઘરથી કામ (WFH)</p>}
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800/60">
                  નિયમ: કર્મચારી સીધું હાજરી સંપાદિત કરી શકતા નથી — ખોટી એન્ટ્રી માટે «સુધારા વિનંતી» મોકલો, જે મેનેજર/HR મંજૂર કરશે.
                </p>
              </>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <StatCard label="આ મહિનાની હાજરી %" value={`${s.attendancePercent ?? 0}%`} sub={`${s.present ?? 0} હાજર · ${s.absent ?? 0} ગેરહાજર`} icon={TrendingUp} tone="emerald" />
          <StatCard label="કુલ કામ કલાક" value={`${s.workedHours ?? 0} કલાક`} sub={`ઓવરટાઇમ: ${s.overtimeHours ?? 0} કલાક`} icon={Timer} tone="brand" />
          <StatCard label="મોડા આવ્યા" value={s.late ?? 0} sub={`${s.onLeave ?? 0} દિવસ રજા પર`} icon={AlarmClock} tone="amber" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="માસિક હાજરી કેલેન્ડર"
            subtitle={`${monthName(month)} ${year} · કુલ કામ સમય: ${s.workedHours ?? 0} કલાક`}
            icon={CalendarDays}
            action={(
              <div className="flex gap-2">
                <Select wrapperClassName="w-32" options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }))} value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} />
                <Select wrapperClassName="w-24" options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))} value={String(year)} onChange={(e) => setYear(Number(e.target.value))} />
              </div>
            )}
          />
          <div className="p-4">
            {calLoading ? <Skeleton className="h-64 w-full" /> : (
              <>
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
                  {['રવિ', 'સોમ', 'મંગળ', 'બુધ', 'ગુરુ', 'શુક્ર', 'શનિ'].map((d) => <div key={d} className="py-1">{d}</div>)}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                  {days.map((d) => (
                    <div
                      key={d.date}
                      title={`${label(d.status)}${d.holiday ? ` · ${d.holiday}` : ''}${d.leaveType ? ` · ${d.leaveType}` : ''}${d.workedMinutes ? ` · ${hours(d.workedMinutes)}` : ''}`}
                      className={cn('rounded-lg border p-1.5 text-center text-xs', tone(d.status), 'border-transparent')}
                    >
                      <p className="font-semibold">{d.dayOfMonth}</p>
                      <p className="truncate text-[10px] opacity-90">{d.checkIn ? fmtTime(d.checkIn).replace(/:\d\d /, '') : label(d.status).slice(0, 6)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                  {['present', 'late', 'half_day', 'absent', 'on_leave', 'holiday', 'weekly_off', 'work_from_home'].map((k) => (
                    <span key={k} className={cn('badge', tone(k))}>{label(k)}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="તાજેતરના રેકોર્ડ" subtitle="છેલ્લા 10 દિવસ" icon={AlarmClock} />
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><th className="th">તારીખ</th><th className="th">ઇન/આઉટ</th><th className="th">સ્થિતિ</th></tr>
            </thead>
            <tbody>
              {(records?.data || []).map((r) => (
                <tr key={r._id} className="row">
                  <td className="td">{fmtDate(r.date)}</td>
                  <td className="td text-xs">{r.checkIn ? fmtTime(r.checkIn) : '—'} / {r.checkOut ? fmtTime(r.checkOut) : '—'}</td>
                  <td className="td"><Badge value={r.status} /></td>
                </tr>
              ))}
              {(records?.data || []).length === 0 && <tr><td className="td" colSpan={3}><EmptyState /></td></tr>}
            </tbody>
          </TableWrap>
        </Card>
      </div>

      <Modal
        open={correctionOpen} onClose={() => setCorrectionOpen(false)}
        title="હાજરી સુધારા વિનંતી" subtitle="કંપની પોલિસી મુજબ નિશ્ચિત દિવસોમાં જ વિનંતી થઈ શકે"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCorrectionOpen(false)}>રદ</Button>
            <Button loading={requestCorrection.isPending} disabled={!correction.reason || correction.reason.length < 5} onClick={() => requestCorrection.mutate(correction)}>વિનંતી મોકલો</Button>
          </>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="તારીખ" type="date" required value={correction.date} max={fmtDateInput()} onChange={(e) => setCorrection({ ...correction, date: e.target.value })} />
          <div />
          <Input label="સાચો પંચ-ઇન સમય" type="datetime-local" value={correction.checkIn} onChange={(e) => setCorrection({ ...correction, checkIn: e.target.value })} />
          <Input label="સાચો પંચ-આઉટ સમય" type="datetime-local" value={correction.checkOut} onChange={(e) => setCorrection({ ...correction, checkOut: e.target.value })} />
          <Textarea label="કારણ (ફરજિયાત)" wrapperClassName="sm:col-span-2" rows={3} value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} placeholder="ઉદા: બાયોમેટ્રિક મશીન બંધ હતું…" />
        </div>
      </Modal>
    </div>
  );
}

function hourHelp() { return <XCircle className="hidden" />; }
