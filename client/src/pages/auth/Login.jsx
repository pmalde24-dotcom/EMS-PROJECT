import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Building2, Eye, EyeOff, Lock, LogIn, Mail, ShieldCheck, Users, Wallet, CalendarCheck, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Button, Input, Checkbox } from '../../components/ui';

const schema = z.object({
  email: z.string().min(1, 'ઇમેઇલ જરૂરી છે').email('માન્ય ઇમેઇલ દાખલ કરો'),
  password: z.string().min(1, 'પાસવર્ડ જરૂરી છે'),
  remember: z.boolean().optional(),
});

const DEMO = [
  { label: 'સુપર એડમિન', email: 'superadmin@company.com', password: 'SuperAdmin@123', tone: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300' },
  { label: 'HR એડમિન', email: 'kavita.nair@acmetech.example.com', password: 'Password@123', tone: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' },
  { label: 'HR મેનેજર', email: 'rakesh.trivedi@acmetech.example.com', password: 'Password@123', tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300' },
  { label: 'ડિપાર્ટમેન્ટ મેનેજર', email: 'vikram.shah@acmetech.example.com', password: 'Password@123', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  { label: 'ટીમ લીડર', email: 'pooja.joshi@acmetech.example.com', password: 'Password@123', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  { label: 'કર્મચારી', email: 'ananya.sharma@acmetech.example.com', password: 'Password@123', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: true },
  });

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const user = await login({ email: values.email.trim().toLowerCase(), password: values.password, remember: values.remember });
      toast.success(`સ્વાગત છે, ${user.name}!`);
      const next = location.state?.from?.pathname;
      navigate(next || '/dashboard', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const useDemo = (account) => {
    setValue('email', account.email);
    setValue('password', account.password);
    toast.info(`${account.label} ના લોગિન ભરાયા — હવે પ્રવેશ કરો કરો`);
  };

  return (
    <div className="grid min-h-screen bg-slate-50 dark:bg-slate-950 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-lg font-bold backdrop-blur">EM</span>
            <div>
              <p className="text-lg font-semibold">EMS પોર્ટલ</p>
              <p className="text-xs text-brand-200">કર્મચારી વ્યવસ્થાપન સિસ્ટમ</p>
            </div>
          </div>
          <h1 className="mt-12 max-w-md text-3xl font-semibold leading-snug">
            કંપનીના તમામ HR ઓપરેશન્સ — એક જ જગ્યાએ
          </h1>
          <p className="mt-4 max-w-md text-sm text-brand-100">
            હાજરી, રજા, પગારપત્રક, ભરતી, પ્રોજેક્ટ, પ્રદર્શન, એસેટ અને રિપોર્ટ્સ — બધું જ રીઅલ-ટાઇમ ડેટા સાથે.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-2 gap-3">
            {[
              { icon: Users, label: 'કર્મચારી નિર્દેશિકા' },
              { icon: CalendarCheck, label: 'હાજરી અને શિફ્ટ' },
              { icon: Wallet, label: 'પગારપત્રક અને પે-સ્લિપ' },
              { icon: BarChart3, label: 'રિપોર્ટ્સ અને એનાલિટિક્સ' },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2.5 text-xs backdrop-blur">
                <f.icon className="h-4 w-4 text-brand-200" /> {f.label}
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-brand-200">
          <ShieldCheck className="h-4 w-4" /> જોબ-લેવલ પર્મિશન, ઓડિટ લોગ અને એન્ક્રિપ્ટેડ ઓથેન્ટિકેશન સાથે સુરક્ષિત
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">EM</span>
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-white">EMS પોર્ટલ</p>
              <p className="text-xs text-slate-500">કર્મચારી વ્યવસ્થાપન સિસ્ટમ</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">પ્રવેશ કરો</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">તમારા કંપની એકાઉન્ટથી લોગિન કરો</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
            <div className="relative">
              <Input
                label="ઇમેઇલ / યુઝરનેમ"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                error={errors.email?.message}
                className="pl-10"
                {...register('email')}
              />
              <Mail className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-slate-400" />
            </div>
            <div className="relative">
              <Input
                label="પાસવર્ડ"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                error={errors.password?.message}
                className="pl-10 pr-10"
                {...register('password')}
              />
              <Lock className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-slate-400" />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-[34px] rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <Checkbox label="મને યાદ રાખો" {...register('remember')} />
              <a href="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">પાસવર્ડ ભૂલી ગયા?</a>
            </div>

            <Button type="submit" loading={submitting} icon={LogIn} className="w-full justify-center">પ્રવેશ કરો</Button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">ડેમો એકાઉન્ટ</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => useDemo(d)}
                  className={`rounded-xl px-3 py-2 text-left text-xs font-medium transition hover:shadow-sm ${d.tone}`}
                >
                  <Building2 className="mb-1 h-3.5 w-3.5" />
                  <span className="block">{d.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-400">
              ડેમો ડેટા: 40 કર્મચારીઓ, હાજરી, રજા, પેરોલ રન, પ્રોજેક્ટ્સ અને ભરતી
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
