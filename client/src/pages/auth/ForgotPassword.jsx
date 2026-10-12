import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { Button, Card, Input } from '../../components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword({ email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-md">
        <div className="px-6 py-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">પાસવર્ડ ભૂલી ગયા?</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            તમારો નોંધાયેલ ઇમેઇલ દાખલ કરો — અમે રીસેટ લિંક મોકલીશું.
          </p>

          {sent ? (
            <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <MailCheck className="mb-1 h-4 w-4" />
              જો આ ઇમેઇલ નોંધાયેલો હશે તો રીસેટ સૂચનાઓ મોકલાઈ ગઈ છે.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Input label="ઇમેઇલ" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              <Button type="submit" loading={loading} className="w-full justify-center">રીસેટ લિંક મોકલો</Button>
            </form>
          )}

          <Link to="/login" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
            <ArrowLeft className="h-4 w-4" /> લોગિન પર પાછા જાઓ
          </Link>
        </div>
      </Card>
    </div>
  );
}
