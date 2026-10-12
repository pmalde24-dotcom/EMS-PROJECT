import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Download, FileSpreadsheet, Filter, Pencil, Plus, Search, Trash2, Upload, UserCheck, UserX, Users, X,
} from 'lucide-react';
import { employeeApi, departmentApi, designationApi, uploadApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';
import EmployeeForm, { EMPLOYMENT_STATUS, EMPLOYMENT_TYPES } from './EmployeeForm';
import {
  Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Modal, PageHeader,
  Pagination, SearchInput, Select, StatCard, TableSkeleton, TableWrap,
} from '../../components/ui';
import { fmtDate } from '../../lib/utils';

export default function EmployeeList() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useList(['employees'], employeeApi.list, { limit: 20 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);

  const { data: departments } = useQuery({ queryKey: ['departments', 'all'], queryFn: () => departmentApi.list({ limit: 200 }) });
  const { data: designations } = useQuery({ queryKey: ['designations', 'all'], queryFn: () => designationApi.list({ limit: 300 }) });
  const { data: stats } = useQuery({ queryKey: ['employees', 'stats'], queryFn: employeeApi.stats });

  const removeMutation = useMutation({
    mutationFn: ({ id, reassignTo }) => employeeApi.remove(id, reassignTo ? { reassignTo } : {}),
    onSuccess: (res) => {
      toast.success(res?.message || 'કર્મચારી આર્કાઇવ થયો');
      qc.invalidateQueries({ queryKey: ['employees'] });
      setConfirm(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const importMutation = useMutation({
    mutationFn: (formData) => employeeApi.importCsv(formData, importPreview ? { commit: 'true' } : { previewOnly: 'true' }),
    onSuccess: (res) => {
      if (importPreview) {
        toast.success(`${res.data?.created || 0} કર્મચારી ઉમેરાયા`);
        setImportOpen(false); setImportFile(null); setImportPreview(null);
        qc.invalidateQueries({ queryKey: ['employees'] });
      } else {
        setImportPreview(res.data);
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const s = stats?.data || {};

  return (
    <div>
      <PageHeader
        title="કર્મચારી નિર્દેશિકા"
        subtitle="કંપનીના તમામ કર્મચારીઓ — શોધો, ફિલ્ટર કરો, સંપાદિત કરો"
        actions={(
          <>
            <a href="/api/employees?export=csv&limit=1000" className="btn-secondary"><Download className="h-4 w-4" /> CSV એક્સપોર્ટ</a>
            {can('employees:create') && (
              <>
                <Button variant="secondary" icon={Upload} onClick={() => setImportOpen(true)}>ઇમ્પોર્ટ</Button>
                <Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true); }}>નવો કર્મચારી</Button>
              </>
            )}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="કુલ કર્મચારી" value={s.total ?? '—'} icon={Users} tone="brand" />
        <StatCard label="સક્રિય" value={s.active ?? '—'} icon={UserCheck} tone="emerald" />
        <StatCard label="પ્રોબેશન પર" value={s.onProbation ?? '—'} icon={Users} tone="amber" />
        <StatCard label="નિષ્ક્રિય / છૂટા" value={s.inactive ?? '—'} icon={UserX} tone="rose" />
      </div>

      <Card>
        <CardHeader
          title="કર્મચારી યાદી"
          subtitle={list.meta ? `કુલ ${list.meta.total} રેકોર્ડ` : ''}
          icon={Filter}
          action={(
            <form onSubmit={list.submitSearch} className="flex flex-wrap items-center gap-2">
              <SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="નામ, ID, ઇમેઇલ…" className="w-full sm:w-64" />
              <Button type="submit" variant="secondary" size="xs" icon={Search}>શોધો</Button>
              {list.params.q && <Button variant="ghost" size="xs" icon={X} onClick={list.reset}>રીસેટ</Button>}
            </form>
          )}
        />

        <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Select
            wrapperClassName="w-full sm:w-52" placeholder="બધા ડિપાર્ટમેન્ટ"
            options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))}
            value={list.params.department || ''}
            onChange={(e) => list.patch({ department: e.target.value || undefined })}
          />
          <Select
            wrapperClassName="w-full sm:w-52" placeholder="બધા હોદ્દા"
            options={(designations?.data || []).map((d) => ({ value: d._id, label: d.title }))}
            value={list.params.designation || ''}
            onChange={(e) => list.patch({ designation: e.target.value || undefined })}
          />
          <Select
            wrapperClassName="w-full sm:w-44" placeholder="બધી સ્થિતિ" options={EMPLOYMENT_STATUS}
            value={list.params.employmentStatus || ''}
            onChange={(e) => list.patch({ employmentStatus: e.target.value || undefined })}
          />
          <Select
            wrapperClassName="w-full sm:w-44" placeholder="બધા પ્રકાર" options={EMPLOYMENT_TYPES}
            value={list.params.employmentType || ''}
            onChange={(e) => list.patch({ employmentType: e.target.value || undefined })}
          />
        </div>

        {list.isLoading ? <TableSkeleton rows={8} cols={6} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : list.rows.length === 0 ? (
          <EmptyState title="કોઈ કર્મચારી મળ્યો નથી" message="ફિલ્ટર બદલો અથવા નવો કર્મચારી ઉમેરો." />
        ) : (
          <>
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="th">કર્મચારી</th>
                  <th className="th">ડિપાર્ટમેન્ટ</th>
                  <th className="th">હોદ્દો</th>
                  <th className="th">જોડાયા</th>
                  <th className="th">સ્થિતિ</th>
                  <th className="th">રિપોર્ટિંગ</th>
                  <th className="th text-right">ક્રિયાઓ</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((e) => (
                  <tr key={e._id} className="row">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <Avatar src={e.profilePhoto} name={`${e.firstName} ${e.lastName}`} size="sm" />
                        <div className="min-w-0">
                          <Link to={`/employees/${e._id}`} className="block truncate font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100">
                            {e.firstName} {e.lastName}
                          </Link>
                          <span className="block truncate text-xs text-slate-500">{e.employeeId} · {e.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="td">{e.department?.name || '—'}</td>
                    <td className="td">{e.designation?.title || '—'}</td>
                    <td className="td">{fmtDate(e.joiningDate)}</td>
                    <td className="td"><Badge value={e.employmentStatus} /></td>
                    <td className="td">{e.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName || ''}` : '—'}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Link to={`/employees/${e._id}`} className="btn-ghost btn-xs">જુઓ</Link>
                        {can('employees:update') && <button className="btn-ghost btn-xs" onClick={() => { setEditing(e); setFormOpen(true); }}><Pencil className="h-3.5 w-3.5" /></button>}
                        {can('employees:delete') && (
                          <button className="btn-ghost btn-xs text-rose-600" onClick={() => setConfirm(e)}><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={list.meta} onPage={list.setPage} />
          </>
        )}
      </Card>

      <EmployeeForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} employee={editing} canCreateLogin={can('users:create')} />

      <ConfirmDialog
        open={!!confirm}
        title="કર્મચારી આર્કાઇવ કરો?"
        message={`${confirm?.firstName} ${confirm?.lastName} ને આર્કાઇવ (સોફ્ટ ડિલીટ) કરવામાં આવશે. તેમનો રેકોર્ડ સચવાય રહેશે અને જરૂર પડે તો પુનઃસ્થાપિત થઈ શકે છે.`}
        confirmLabel="આર્કાઇવ કરો"
        loading={removeMutation.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => removeMutation.mutate({ id: confirm._id })}
      />

      <Modal
        open={importOpen}
        onClose={() => { setImportOpen(false); setImportFile(null); setImportPreview(null); }}
        title="કર્મચારી CSV ઇમ્પોર્ટ"
        subtitle="પહેલા પ્રિવ્યૂ કરો, પછી કમિટ કરો — ડુપ્લિકેટ અને ખોટા રેકોર્ડ અટકાવવા માટે"
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setImportOpen(false); setImportPreview(null); }}>બંધ કરો</Button>
            <a href={employeeApi.importTemplateUrl} className="btn-ghost"><Download className="h-4 w-4" /> ટેમ્પલેટ</a>
            <Button
              loading={importMutation.isPending}
              disabled={!importFile}
              onClick={() => {
                const fd = new FormData();
                fd.append('file', importFile);
                importMutation.mutate(fd);
              }}
            >
              {importPreview ? 'કમિટ કરો' : 'પ્રિવ્યૂ કરો'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-8 text-center transition hover:border-brand-400 dark:border-slate-700">
            <FileSpreadsheet className="h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{importFile ? importFile.name : 'CSV ફાઇલ પસંદ કરો'}</span>
            <span className="text-xs text-slate-500">મહત્તમ 5 MB · ટેમ્પલેટ ફોર્મેટ વાપરો</span>
            <input
              type="file" accept=".csv,text/csv" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) return toast.error('ફાઇલ 5 MB થી મોટી છે');
                if (!/\.csv$/i.test(file.name)) return toast.error('ફક્ત .csv ફાઇલ માન્ય છે');
                setImportFile(file);
                setImportPreview(null);
                void uploadApi;
              }}
            />
          </label>

          {importPreview && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">માન્ય: {importPreview.validCount ?? importPreview.valid?.length ?? 0}</span>
                <span className="badge bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">ક્ષતિ: {importPreview.invalidCount ?? importPreview.errors?.length ?? 0}</span>
                <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">કુલ: {importPreview.total ?? 0}</span>
              </div>
              {(importPreview.errors || []).slice(0, 6).map((err, i) => (
                <p key={i} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  લાઇન {err.row ?? err.line}: {err.message || err}
                </p>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
