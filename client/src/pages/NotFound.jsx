import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card } from '../components/ui';

export default function NotFound() {
  return (
    <Card className="mx-auto mt-12 max-w-lg text-center">
      <div className="px-6 py-14">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10">
          <Compass className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-4xl font-bold text-slate-900 dark:text-white">404</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">માફ કરશો, આ પેજ મળ્યું નથી.</p>
        <Link to="/dashboard" className="btn-primary mt-6 inline-flex">ડેશબોર્ડ પર જાઓ</Link>
      </div>
    </Card>
  );
}
