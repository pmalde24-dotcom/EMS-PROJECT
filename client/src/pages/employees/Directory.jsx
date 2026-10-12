import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { employeeApi, departmentApi } from '../../api/endpoints';
import { Avatar, Card, CardHeader, EmptyState, ErrorState, PageHeader, SearchInput, Select, TableSkeleton } from '../../components/ui';
import { Mail, Phone, Users } from 'lucide-react';

export default function Directory() {
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const debounced = useDebounce(q, 350);

  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['directory', debounced, department],
    queryFn: () => employeeApi.directory({ q: debounced || undefined, department: department || undefined, limit: 200 }),
  });

  const rows = data?.data || [];

  return (
    <div>
      <PageHeader title="કર્મચારી નિર્દેશિકા" subtitle="ટીમના સભ્યોની સંપર્ક યાદી — બધા કર્મચારી માટે ઉપલબ્ધ" />

      <Card>
        <CardHeader
          title="સંપર્ક યાદી"
          subtitle={isLoading ? 'લોડ થઈ રહ્યું છે…' : `કુલ ${rows.length} કર્મચારી`}
          icon={Users}
          action={(
            <div className="flex flex-wrap gap-2">
              <SearchInput value={q} onChange={setQ} placeholder="નામ, ID, ઇમેઇલ, હોદ્દો…" className="w-full sm:w-72" />
              <Select
                wrapperClassName="w-full sm:w-52" placeholder="બધા ડિપાર્ટમેન્ટ"
                options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))}
                value={department} onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
          )}
        />

        {isLoading ? <TableSkeleton rows={8} cols={5} /> : isError ? <ErrorState onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="કોઈ કર્મચારી મળ્યો નથી" />
        ) : (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((e) => (
                <Link
                  key={e._id}
                  to={`/employees/${e._id}`}
                  className="group rounded-xl border border-slate-100 p-4 transition hover:border-brand-200 hover:shadow-card dark:border-slate-800 dark:hover:border-brand-500/40"
                >
                  <div className="flex items-center gap-3">
                    <Avatar src={e.profilePhoto} name={`${e.firstName} ${e.lastName}`} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-brand-600 dark:text-slate-100">{e.firstName} {e.lastName}</p>
                      <p className="truncate text-xs text-slate-500">{e.designation?.title || e.designation || '—'}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" /> {e.email}</p>
                    <p className="flex items-center gap-1.5 truncate"><Phone className="h-3 w-3 shrink-0" /> {e.phone || '—'}</p>
                    <p className="truncate">{e.department?.name || e.department || '—'} · {e.employeeId}</p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="text-xs text-slate-500">બેંક અને પગારની વિગત નિર્દેશિકામાં દર્શાવાતી નથી — તે માત્ર અધિકૃત ભૂમિકાને પ્રોફાઇલ પેજ પર દેખાય છે.</p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
