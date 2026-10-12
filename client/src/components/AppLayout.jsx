import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Building2, CheckCheck, ChevronDown, LogOut, Menu, Moon, Search, Sun, User, X, KeyRound, Settings, ClipboardList, Megaphone } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { filterNav, NAV_SECTIONS } from '../lib/nav';
import { notificationApi, employeeApi } from '../api/endpoints';
import { Avatar, Badge } from './ui';
import { cn, relativeTime } from '../lib/utils';

/* ── Sidebar ──────────────────────────────────────────────────────── */
function Sidebar({ open, onClose, sections }) {
  const location = useLocation();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-100 px-4 dark:border-slate-800">
          <Link to="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">EM</span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-slate-900 dark:text-white">EMS પોર્ટલ</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">કર્મચારી વ્યવસ્થાપન</span>
            </span>
          </Link>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    end={item.to === '/'}
                    className={({ isActive }) => cn('nav-link', (isActive || location.pathname.startsWith(`${item.to}/`)) && 'nav-link-active')}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <div className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-3 text-white">
            <p className="text-xs font-semibold">EMS v1.0</p>
            <p className="mt-0.5 text-[11px] text-brand-100">React · Node.js · Express · MongoDB</p>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ── Global search (employee directory) ───────────────────────────── */
function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', q],
    queryFn: () => employeeApi.directory({ q, limit: 8 }),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const results = data?.data || [];
  return (
    <div ref={boxRef} className="relative hidden flex-1 max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="કર્મચારી શોધો (નામ, ID, ઇમેઇલ)…"
        className="input pl-9"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-800 dark:bg-slate-900">
          {isFetching && <p className="px-4 py-3 text-xs text-slate-500">શોધી રહ્યા છીએ…</p>}
          {!isFetching && results.length === 0 && <p className="px-4 py-3 text-xs text-slate-500">કોઈ કર્મચારી મળ્યો નથી</p>}
          {results.map((e) => (
            <button
              key={e._id}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => { setOpen(false); setQ(''); navigate(`/employees/${e._id}`); }}
            >
              <Avatar src={e.profilePhoto} name={`${e.firstName} ${e.lastName}`} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{e.firstName} {e.lastName}</span>
                <span className="block truncate text-xs text-slate-500">{e.employeeId} · {e.designation?.title || ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Notification centre ──────────────────────────────────────────── */
function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ref = useRef(null);

  const { data } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => notificationApi.list({ limit: 8 }),
    refetchInterval: 60_000,
  });
  const unread = data?.meta?.unread || 0;

  const markAll = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => { toast.success('બધી સૂચનાઓ વાંચેલી ગણાઈ'); qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-800 dark:bg-slate-900 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">સૂચનાઓ</p>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()} className="btn-ghost btn-xs"><CheckCheck className="h-3.5 w-3.5" /> બધું વાંચ્યું</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {(data?.data || []).length === 0 && <p className="px-4 py-6 text-center text-xs text-slate-500">કોઈ સૂચના નથી</p>}
            {(data?.data || []).map((n) => (
              <button
                key={n._id}
                onClick={async () => {
                  setOpen(false);
                  if (!n.isRead) await notificationApi.markRead(n._id).catch(() => {});
                  qc.invalidateQueries({ queryKey: ['notifications'] });
                  if (n.link) navigate(n.link);
                }}
                className={cn('flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/60', !n.isRead && 'bg-brand-50/40 dark:bg-brand-500/5')}
              >
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-slate-300 dark:bg-slate-700' : 'bg-brand-500')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{n.title}</span>
                  <span className="mt-0.5 block line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{n.body}</span>
                  <span className="mt-1 block text-[11px] text-slate-400">{relativeTime(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => { setOpen(false); navigate('/notifications'); }} className="w-full border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-brand-600 hover:bg-slate-50 dark:border-slate-800 dark:text-brand-300 dark:hover:bg-slate-800">
            બધી સૂચનાઓ જુઓ
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Profile menu ─────────────────────────────────────────────────── */
function ProfileMenu() {
  const { user, logout, hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const roleLabel = { super_admin: 'સુપર એડમિન', hr_admin: 'HR એડમિન', hr_manager: 'HR મેનેજર', department_manager: 'ડિપાર્ટમેન્ટ મેનેજર', team_leader: 'ટીમ લીડર', employee: 'કર્મચારી' }[user?.role] || '';

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-lg p-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800">
        <Avatar src={user?.employee?.profilePhoto} name={user?.name} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-slate-800 dark:text-slate-100">{user?.name}</span>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">{roleLabel}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-pop dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
            <Badge value={user?.role} className="mt-2" />
          </div>
          {[
            { to: '/profile', label: 'મારી પ્રોફાઇલ', icon: User },
            { to: '/profile/security', label: 'પાસવર્ડ અને સુરક્ષા', icon: KeyRound },
            { to: '/notifications', label: 'સૂચનાઓ', icon: Bell },
            ...(hasRole('super_admin', 'hr_admin') ? [{ to: '/settings', label: 'કંપની સેટિંગ', icon: Settings }] : []),
          ].map((item) => (
            <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
              <item.icon className="h-4 w-4" /> {item.label}
            </Link>
          ))}
          <button onClick={logout} className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-slate-800 dark:hover:bg-rose-500/10">
            <LogOut className="h-4 w-4" /> લોગ આઉટ
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Layout shell ─────────────────────────────────────────────────── */
export default function AppLayout() {
  const { user, can, role } = useAuth();
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const sections = useMemo(() => filterNav(NAV_SECTIONS, { can, role }), [can, role]);

  useEffect(() => { setSidebarOpen(false); window.scrollTo({ top: 0 }); }, [location.pathname]);

  return (
    <div className="min-h-full">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} sections={sections} />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-4">
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggle} title="ડાર્ક / લાઇટ મોડ" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <NotificationCenter />
            <ProfileMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5 sm:py-6">
          <Outlet />
        </main>

        <footer className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 px-4 pb-6 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} EMS — કર્મચારી વ્યવસ્થાપન સિસ્ટમ</p>
          <p className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Company2 className="h-3 w-3" /> MongoDB Atlas</span>
            <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" /> ઓડિટ સક્રિય</span>
            <span className="flex items-center gap-1"><Megaphone className="h-3 w-3" /> {user?.name}</span>
          </p>
        </footer>
      </div>
    </div>
  );
}

function Company2(props) { return <Building2 {...props} />; }
