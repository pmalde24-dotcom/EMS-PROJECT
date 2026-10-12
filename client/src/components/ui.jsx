import { AlertTriangle, Check, ChevronLeft, ChevronRight, Inbox, Loader2, Search, X } from 'lucide-react';
import { useEffect } from 'react';
import { cn, label as labelOf, tone } from '../lib/utils';

/* ── Button ───────────────────────────────────────────────────────── */
export function Button({ variant = 'primary', size, className, loading, icon: Icon, children, ...props }) {
  const variants = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger', success: 'btn-success' };
  return (
    <button className={cn(variants[variant] || variants.primary, size === 'xs' && 'btn-xs', className)} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

/* ── Card ─────────────────────────────────────────────────────────── */
export function Card({ className, children, ...rest }) {
  return <div className={cn('card', className)} {...rest}>{children}</div>;
}
export function CardHeader({ title, subtitle, action, icon: Icon, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5', className)}>
      <div className="flex items-start gap-3">
        {Icon && <span className="mt-0.5 rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"><Icon className="h-4 w-4" /></span>}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ── Badge ────────────────────────────────────────────────────────── */
export function Badge({ value, label, tone: customTone, className, icon: Icon }) {
  return (
    <span className={cn('badge', customTone || tone(value), className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {label ?? labelOf(value)}
    </span>
  );
}

/* ── Field wrapper ────────────────────────────────────────────────── */
export function Field({ label, error, hint, required, children, className }) {
  return (
    <div className={className}>
      {label && <label className="label">{label} {required && <span className="text-rose-500">*</span>}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

export function Input({ label, error, hint, required, className, wrapperClassName, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <input className={cn('input', error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20', className)} {...props} />
    </Field>
  );
}

export function Textarea({ label, error, hint, required, className, wrapperClassName, rows = 3, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <textarea rows={rows} className={cn('input resize-y', error && 'border-rose-400', className)} {...props} />
    </Field>
  );
}

export function Select({ label, error, hint, required, className, wrapperClassName, options = [], placeholder, children, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <select className={cn('input', error && 'border-rose-400', className)} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value ?? o._id ?? o} value={o.value ?? o._id ?? o}>{o.label ?? o.title ?? o.name ?? labelOf(o)}</option>
        ))}
        {children}
      </select>
    </Field>
  );
}

export function Checkbox({ label, className, ...props }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200', className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-900" {...props} />
      {label}
    </label>
  );
}

/* ── Modal ────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', closeOnBackdrop = true }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 backdrop-blur-sm sm:p-6" onClick={() => closeOnBackdrop && onClose?.()}>
      <div className={cn('card my-4 w-full animate-fade-in shadow-pop', sizes[size])} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Confirm dialog ───────────────────────────────────────────────── */
export function ConfirmDialog({ open, title = 'ખાતરી કરો', message, confirmLabel = 'હા, કરો', cancelLabel = 'રદ કરો', onConfirm, onClose, loading, variant = 'danger' }) {
  return (
    <Modal
      open={open} onClose={onClose} title={title} size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{cancelLabel}</Button>
          <Button variant={variant} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      )}
    >
      <div className="flex gap-3">
        <span className={cn('rounded-full p-2', variant === 'danger' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/10')}>
          <AlertTriangle className="h-5 w-5" />
        </span>
        <p className="pt-1 text-sm text-slate-600 dark:text-slate-300">{message}</p>
      </div>
    </Modal>
  );
}

/* ── Table helpers ────────────────────────────────────────────────── */
export function TableWrap({ children, className }) {
  return <div className={cn('overflow-x-auto', className)}><table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">{children}</table></div>;
}

export function Skeleton({ className }) {
  return <div className={cn('skeleton', className)} />;
}
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => <Skeleton key={c} className={cn('h-8 flex-1', c === 0 && 'max-w-[220px]')} />)}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title = 'કોઈ રેકોર્ડ મળ્યો નથી', message, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <span className="rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-slate-800 dark:text-slate-500"><Icon className="h-6 w-6" /></span>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {message && <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message = 'ડેટા લોડ કરવામાં તકલીફ પડી', onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="rounded-full bg-rose-50 p-3 text-rose-500 dark:bg-rose-500/10"><AlertTriangle className="h-6 w-6" /></span>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{message}</p>
      {onRetry && <Button variant="secondary" size="xs" onClick={onRetry}>ફરી પ્રયાસ કરો</Button>}
    </div>
  );
}

/* ── Pagination ───────────────────────────────────────────────────── */
export function Pagination({ meta, onPage, className }) {
  if (!meta) return null;
  const { page = 1, pages = 1, total = 0, limit = 20 } = meta;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const numbers = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let i = start; i < start + 5 && i <= pages; i++) numbers.push(i);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800', className)}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {total === 0 ? '0 રેકોર્ડ' : `${from}–${to} / કુલ ${total} રેકોર્ડ`}
      </p>
      <div className="flex items-center gap-1">
        <button className="btn-ghost btn-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
        {numbers.map((n) => (
          <button key={n} onClick={() => onPage(n)} className={cn('btn btn-xs min-w-8', n === page ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>{n}</button>
        ))}
        <button className="btn-ghost btn-xs" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/* ── Search box ───────────────────────────────────────────────────── */
export function SearchInput({ value, onChange, placeholder = 'શોધો…', className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-9" />
    </div>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────── */
export function Tabs({ tabs = [], active, onChange, className }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition',
            active === t.value ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          {t.label}{t.count !== undefined ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs dark:bg-slate-800">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ── Stat card ────────────────────────────────────────────────────── */
export function StatCard({ label, value, sub, icon: Icon, tone: toneClass = 'brand', trend, onClick, loading }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
    cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300',
  };
  return (
    <div onClick={onClick} className={cn('card card-pad', onClick && 'cursor-pointer transition hover:shadow-pop')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="stat-label">{label}</p>
          {loading ? <Skeleton className="mt-2 h-7 w-20" /> : <p className="stat-value mt-1 truncate">{value}</p>}
          {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
        {Icon && <span className={cn('shrink-0 rounded-xl p-2.5', tones[toneClass] || tones.brand)}><Icon className="h-5 w-5" /></span>}
      </div>
      {trend}
    </div>
  );
}

/* ── Progress bar ─────────────────────────────────────────────────── */
export function Progress({ value = 0, className, barClassName, showLabel }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={cn('h-full rounded-full bg-brand-600 transition-all', v >= 100 && 'bg-emerald-500', v < 35 && 'bg-amber-500', barClassName)} style={{ width: `${v}%` }} />
      </div>
      {showLabel && <span className="w-10 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{v}%</span>}
    </div>
  );
}

/* ── Avatar ───────────────────────────────────────────────────────── */
export function Avatar({ src, name = '', size = 'md', className }) {
  const sizes = { xs: 'h-7 w-7 text-[10px]', sm: 'h-9 w-9 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-24 w-24 text-2xl' };
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return src
    ? <img src={src} alt={name} className={cn('shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-slate-900', sizes[size], className)} />
    : (
      <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ring-2 ring-white dark:bg-brand-500/20 dark:text-brand-200 dark:ring-slate-900', sizes[size], className)}>
        {initials || '?'}
      </span>
    );
}

/* ── Section title / page header ──────────────────────────────────── */
export function PageHeader({ title, subtitle, actions, breadcrumb, children }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {breadcrumb && <p className="mb-1 text-xs text-slate-400 dark:text-slate-500">{breadcrumb}</p>}
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </div>
  );
}

/* ── Inline checkbox list (permissions etc.) ──────────────────────── */
export function CheckboxGroup({ options = [], value = [], onChange, className, columns = 3 }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className={cn('grid gap-1.5', columns === 3 && 'sm:grid-cols-3', columns === 2 && 'sm:grid-cols-2', columns === 4 && 'sm:grid-cols-4', className)}>
      {options.map((o) => (
        <label key={o.value ?? o} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
          <input type="checkbox" checked={value.includes(o.value ?? o)} onChange={() => toggle(o.value ?? o)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-900" />
          {o.label ?? o}
        </label>
      ))}
    </div>
  );
}

export { Check };
