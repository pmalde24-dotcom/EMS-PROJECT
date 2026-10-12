import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card } from './ui';

/**
 * Route guard. Server-side permissions are authoritative; this only hides
 * what the current user is not allowed to open.
 */
export default function ProtectedRoute({ permission, roles, children }) {
  const { user, loading, can, role } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  const roleOk = !roles || roles.flat().includes(role);
  const permOk = !permission || can(permission);

  if (!roleOk || !permOk) {
    return (
      <Card className="mx-auto mt-10 max-w-lg text-center">
        <div className="px-6 py-10">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-500/10">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">પ્રવેશ મનાઈ છે</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            આ પેજ જોવા માટે તમારી ભૂમિકા ({role}) પાસે જરૂરી પર્મિશન નથી. જરૂર પડે તો એડમિનનો સંપર્ક કરો.
          </p>
        </div>
      </Card>
    );
  }

  return children || <Outlet />;
}
