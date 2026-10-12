import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { Button, Card, Input } from '../../components/ui';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ token: params.get('token') || '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error('પાસવર્ડ મેળ ખાતા નથી');
    setLoading(true);
    try {
      await authApi.resetPassword({ token: form.token, password: form.password });
      toast.success('પાસવર્ડ બદલાઈ ગયો — હવે લોગિન કરો');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-md">
        <form onSubmit={submit} className="space-y-4 px-6 py-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">નવો પાસવર્ડ સેટ કરો</h1>
          <Input label="રીસેટ ટોકન" required value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
          <Input label="નવો પાસવર્ડ" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Input label="પાસવર્ડ ફરી લખો" type="password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          <Button type="submit" loading={loading} className="w-full justify-center">પાસવર્ડ બદલો</Button>
          <Link to="/login" className="block text-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">લોગિન પર પાછા જાઓ</Link>
        </form>
      </Card>
    </div>
  );
}
