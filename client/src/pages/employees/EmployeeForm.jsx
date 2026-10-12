import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { employeeApi, departmentApi, designationApi, shiftApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { Button, Checkbox, Input, Modal, Select, Textarea } from '../../components/ui';
import { fmtDateInput } from '../../lib/utils';

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'પૂર્ણ સમય' },
  { value: 'part_time', label: 'આંશિક સમય' },
  { value: 'contract', label: 'કોન્ટ્રાક્ટ' },
  { value: 'intern', label: 'ઇન્ટર્ન' },
  { value: 'consultant', label: 'કન્સલ્ટન્ટ' },
];

const EMPLOYMENT_STATUS = [
  { value: 'active', label: 'સક્રિય' },
  { value: 'probation', label: 'પ્રોબેશન' },
  { value: 'notice_period', label: 'નોટિસ પીરિયડ' },
  { value: 'resigned', label: 'રાજીનામું' },
  { value: 'terminated', label: 'સેવામુક્ત' },
  { value: 'retired', label: 'નિવૃત્ત' },
  { value: 'inactive', label: 'નિષ્ક્રિય' },
];

const GENDERS = [
  { value: 'male', label: 'પુરુષ' },
  { value: 'female', label: 'સ્ત્રી' },
  { value: 'other', label: 'અન્ય' },
  { value: 'prefer_not_to_say', label: 'જણાવવું નથી' },
];

const CATEGORIES = [
  { value: 'permanent', label: 'કાયમી' },
  { value: 'probationer', label: 'પ્રોબેશનર' },
  { value: 'contractual', label: 'કરાર આધારિત' },
  { value: 'intern', label: 'ઇન્ટર્ન' },
  { value: 'consultant', label: 'કન્સલ્ટન્ટ' },
  { value: 'trainee', label: 'તાલીમાર્થી' },
];

const ROLE_OPTIONS = [
  { value: 'employee', label: 'કર્મચારી' },
  { value: 'team_leader', label: 'ટીમ લીડર' },
  { value: 'department_manager', label: 'ડિપાર્ટમેન્ટ મેનેજર' },
  { value: 'hr_manager', label: 'HR મેનેજર' },
  { value: 'hr_admin', label: 'HR એડમિન' },
  { value: 'super_admin', label: 'સુપર એડમિન' },
];

export default function EmployeeForm({ open, onClose, employee, canCreateLogin }) {
  const qc = useQueryClient();
  const isEdit = !!employee?._id;

  const { data: departments } = useQuery({ queryKey: ['departments', 'options'], queryFn: () => departmentApi.list({ limit: 200 }), enabled: open });
  const { data: designations } = useQuery({ queryKey: ['designations', 'options'], queryFn: () => designationApi.list({ limit: 300 }), enabled: open });
  const { data: shifts } = useQuery({ queryKey: ['shifts', 'options'], queryFn: () => shiftApi.list({ limit: 50 }), enabled: open });
  const { data: managers } = useQuery({
    queryKey: ['employees', 'manager-options'],
    queryFn: () => employeeApi.list({ limit: 300, employmentStatus: 'active' }),
    enabled: open,
  });

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    defaultValues: {
      firstName: '', lastName: '', email: '', phone: '', workEmail: '',
      dateOfBirth: '', gender: '', maritalStatus: '', bloodGroup: '',
      joiningDate: fmtDateInput(new Date()), employmentType: 'full_time', employmentStatus: 'active', employeeCategory: 'permanent',
      department: '', designation: '', reportingManager: '', teamLeader: '', shift: '', workLocation: '',
      probationEndDate: '', noticePeriodDays: 30, notes: '',
      createLogin: false, role: 'employee', sendWelcomeEmail: true,
      bank: { accountHolderName: '', accountNumber: '', ifsc: '', bankName: '', branch: '', accountType: 'savings' },
      address: { line1: '', line2: '', city: '', state: '', country: 'India', pincode: '' },
      emergencyContact: { name: '', relationship: '', phone: '' },
    },
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      reset({
        ...employee,
        department: employee.department?._id || employee.department || '',
        designation: employee.designation?._id || employee.designation || '',
        reportingManager: employee.reportingManager?._id || employee.reportingManager || '',
        teamLeader: employee.teamLeader?._id || employee.teamLeader || '',
        shift: employee.shift?._id || employee.shift || '',
        dateOfBirth: fmtDateInput(employee.dateOfBirth),
        joiningDate: fmtDateInput(employee.joiningDate),
        probationEndDate: fmtDateInput(employee.probationEndDate),
        createLogin: false,
      });
    } else {
      reset({
        firstName: '', lastName: '', email: '', phone: '',
        joiningDate: fmtDateInput(new Date()), employmentType: 'full_time', employmentStatus: 'active', employeeCategory: 'permanent',
        department: '', designation: '', reportingManager: '', shift: '', createLogin: false, role: 'employee', sendWelcomeEmail: true,
        bank: { accountHolderName: '', accountNumber: '', ifsc: '', bankName: '', branch: '', accountType: 'savings' },
      });
    }
  }, [open, employee, isEdit, reset]);

  const mutation = useMutation({
    mutationFn: (values) => {
      const payload = { ...values };
      if (!payload.probationEndDate) delete payload.probationEndDate;
      if (!payload.dateOfBirth) delete payload.dateOfBirth;
      if (!payload.reportingManager) payload.reportingManager = null;
      if (!payload.teamLeader) payload.teamLeader = null;
      if (!payload.shift) payload.shift = null;
      if (!isEdit) delete payload.employmentStatus;
      return isEdit ? employeeApi.update(employee._id, payload) : employeeApi.create(payload);
    },
    onSuccess: (res) => {
      toast.success(isEdit ? 'કર્મચારીની માહિતી અપડેટ થઈ' : 'નવો કર્મચારી ઉમેરાયો');
      if (res?.data?.temporaryPassword) toast.info(`લોગિન પાસવર્ડ: ${res.data.temporaryPassword}`, { duration: 12000 });
      qc.invalidateQueries({ queryKey: ['employees'] });
      onClose?.();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const createLogin = watch('createLogin');

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'કર્મચારી સંપાદિત કરો' : 'નવો કર્મચારી ઉમેરો'}
      subtitle={isEdit ? `${employee?.firstName} ${employee?.lastName} · ${employee?.employeeId}` : 'બધી ફરજિયાત માહિતી ભરો'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>રદ કરો</Button>
          <Button icon={Save} loading={mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v))}>
            {isEdit ? 'અપડેટ કરો' : 'ઉમેરો'}
          </Button>
        </>
      )}
    >
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">વ્યક્તિગત માહિતી</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="પ્રથમ નામ" required error={errors.firstName?.message} {...register('firstName', { required: 'જરૂરી છે' })} />
            <Input label="અટક" required error={errors.lastName?.message} {...register('lastName', { required: 'જરૂરી છે' })} />
            <Input label="ઇમેઇલ" type="email" required error={errors.email?.message} {...register('email', { required: 'જરૂરી છે' })} />
            <Input label="મોબાઇલ નંબર" {...register('phone')} placeholder="+91 98xxxxxxxx" />
            <Input label="જન્મ તારીખ" type="date" {...register('dateOfBirth')} />
            <Select label="જાતિ" placeholder="પસંદ કરો" options={GENDERS} {...register('gender')} />
            <Input label="લોહીનો ગ્રુપ" {...register('bloodGroup')} placeholder="O+" />
            <Input label="વૈવાહિક સ્થિતિ" {...register('maritalStatus')} placeholder="single / married" />
            <Input label="કાર્યસ્થળ" {...register('workLocation')} placeholder="Ahmedabad HQ" />
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">નોકરીની માહિતી</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="જોડાવાની તારીખ" type="date" required error={errors.joiningDate?.message} {...register('joiningDate', { required: 'જરૂરી છે' })} />
            <Select label="ડિપાર્ટમેન્ટ" required placeholder="પસંદ કરો" options={(departments?.data || []).map((d) => ({ value: d._id, label: d.name }))} {...register('department', { required: 'જરૂરી છે' })} />
            <Select label="હોદ્દો" required placeholder="પસંદ કરો" options={(designations?.data || []).map((d) => ({ value: d._id, label: d.title }))} {...register('designation', { required: 'જરૂરી છે' })} />
            <Select label="રિપોર્ટિંગ મેનેજર" placeholder="પસંદ કરો" options={(managers?.data || []).map((m) => ({ value: m._id, label: `${m.firstName} ${m.lastName} (${m.employeeId})` }))} {...register('reportingManager')} />
            <Select label="ટીમ લીડર" placeholder="પસંદ કરો" options={(managers?.data || []).map((m) => ({ value: m._id, label: `${m.firstName} ${m.lastName}` }))} {...register('teamLeader')} />
            <Select label="શિફ્ટ" placeholder="પસંદ કરો" options={(shifts?.data || []).map((s) => ({ value: s._id, label: `${s.name} (${s.startTime}–${s.endTime})` }))} {...register('shift')} />
            <Select label="રોજગાર પ્રકાર" options={EMPLOYMENT_TYPES} {...register('employmentType')} />
            {isEdit && <Select label="રોજગાર સ્થિતિ" options={EMPLOYMENT_STATUS} {...register('employmentStatus')} />}
            <Select label="કર્મચારી શ્રેણી" options={CATEGORIES} {...register('employeeCategory')} />
            <Input label="પ્રોબેશન સમાપ્તિ" type="date" {...register('probationEndDate')} />
            <Input label="નોટિસ પીરિયડ (દિવસ)" type="number" {...register('noticePeriodDays')} />
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">બેંક વિગત (સંવેદનશીલ — માત્ર અધિકૃત ભૂમિકા)</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="ખાતાધારકનું નામ" {...register('bank.accountHolderName')} />
            <Input label="ખાતા નંબર" {...register('bank.accountNumber')} placeholder="સંપૂર્ણ નંબર" />
            <Input label="IFSC" {...register('bank.ifsc')} placeholder="HDFC0001234" />
            <Input label="બેંક" {...register('bank.bankName')} />
            <Input label="શાખા" {...register('bank.branch')} />
            <Select label="ખાતાનો પ્રકાર" options={[{ value: 'savings', label: 'બચત' }, { value: 'current', label: 'ચાલુ' }]} {...register('bank.accountType')} />
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">સરનામું અને ઇમરજન્સી સંપર્ક</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="સરનામું લાઇન 1" {...register('address.line1')} />
            <Input label="સરનામું લાઇન 2" {...register('address.line2')} />
            <Input label="શહેર" {...register('address.city')} />
            <Input label="રાજ્ય" {...register('address.state')} />
            <Input label="પિનકોડ" {...register('address.pincode')} />
            <Input label="ઇમરજન્સી સંપર્ક નામ" {...register('emergencyContact.name')} />
            <Input label="સંબંધ" {...register('emergencyContact.relationship')} />
            <Input label="ઇમરજન્સી ફોન" {...register('emergencyContact.phone')} />
          </div>
        </section>

        {!isEdit && canCreateLogin && (
          <section className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">લોગિન એકાઉન્ટ</h4>
            <Checkbox label="આ કર્મચારી માટે સિસ્ટમ લોગિન બનાવો" {...register('createLogin')} />
            {createLogin && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Select label="ભૂમિકા" options={ROLE_OPTIONS} {...register('role')} />
                <div className="flex items-end">
                  <Checkbox label="સ્વાગત ઇમેઇલ મોકલો" {...register('sendWelcomeEmail')} />
                </div>
              </div>
            )}
          </section>
        )}

        <Textarea label="નોંધ" rows={2} {...register('notes')} />
      </form>
    </Modal>
  );
}

export { EMPLOYMENT_TYPES, EMPLOYMENT_STATUS };
