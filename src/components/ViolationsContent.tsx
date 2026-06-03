import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { requestPendingChange, formatSupabaseError, isMasterAdminEmail } from '@/lib/pending-changes';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { useProfilesMap } from '@/hooks/use-profiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Search, Download, ChevronDown, MessageCircle, Check } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/export';
import type { Tables as DBTables } from '@/integrations/supabase/types';

type Violation = DBTables<'employee_violations'> & { violation_location?: string | null };
type Employee = DBTables<'employees'>;
type ViolationNotification = {
  id: string;
  violation_id: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

type ActionType = 'warning' | 'verbal_warning' | 'deduction' | 'suspension' | 'termination';

const DEDUCTION_DAY_OPTIONS = [0.5, 1, 2, 3, 4, 5];

const ACTION_COLORS: Record<string, string> = {
  warning: 'bg-accent/20 text-accent-foreground',
  verbal_warning: 'bg-muted text-muted-foreground',
  deduction: 'bg-primary/20 text-primary',
  suspension: 'bg-destructive/20 text-destructive',
  termination: 'bg-destructive text-destructive-foreground',
};

export function getRepeatBadgeClass(repeatNumber: number): string {
  if (repeatNumber <= 1) return 'bg-success/20 text-success';
  if (repeatNumber === 2) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
  return 'bg-destructive text-destructive-foreground';
}

function normalizeDescription(desc: string): string {
  return desc.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function ViolationsContent() {
  const { t, lang } = useLanguage();
  const { isAdmin, profile } = useAuth();
  const canSendMessages = profile?.email?.toLowerCase() === 'm.khazenly@gmail.com';
  const profiles = useProfilesMap();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [notifications, setNotifications] = useState<ViolationNotification[]>([]);
  const [search, setSearch] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterRepeats, setFilterRepeats] = useState<number[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [editItem, setEditItem] = useState<Violation | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    employee_id: '',
    violation_description: '',
    violation_location: '',
    violation_date: new Date().toISOString().slice(0, 16),
    action_taken: 'warning' as ActionType,
    deduction_amount: 1,
    daily_wage: 0,
    notes: '',
  });

  // Format day-deduction for display
  const formatDays = (n: number): string => {
    if (n === 0.5) return t('halfDay');
    if (n === 1) return `1 ${t('day')}`;
    return `${n} ${t('days')}`;
  };

  // Preset common violations
  const presets = useMemo(() => [
    t('violationGloves'),
    t('violationShoes'),
    t('violationVest'),
    t('violationUnsafeAct'),
    t('violationUnsafeCondition'),
  ], [t]);

  useEffect(() => { loadData(); }, []);

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputWrapRef.current && !inputWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadData = async () => {
    const [v, e, n] = await Promise.all([
      supabase.from('employee_violations').select('*').order('violation_date', { ascending: false }),
      supabase.from('employees').select('*').order('name'),
      supabase.from('violation_notifications' as any).select('id, violation_id, status, error_message, sent_at, created_at').order('created_at', { ascending: false }),
    ]);
    setViolations(v.data || []);
    setEmployees(e.data || []);
    setNotifications(((n.data as any) || []) as ViolationNotification[]);
  };

  // Latest notification per violation_id
  const notifMap = useMemo(() => {
    const m: Record<string, ViolationNotification> = {};
    notifications.forEach((n) => {
      if (!m[n.violation_id]) m[n.violation_id] = n;
    });
    return m;
  }, [notifications]);

  const empMap = useMemo(() => {
    const m: Record<string, Employee> = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  // Unique past descriptions for autocomplete (history)
  const historyDescriptions = useMemo(() => {
    const set = new Set<string>();
    violations.forEach(v => set.add(v.violation_description.trim()));
    return Array.from(set);
  }, [violations]);

  // Combined suggestions filtered by what user is typing
  const suggestions = useMemo(() => {
    const typed = form.violation_description.trim().toLowerCase();
    const all = Array.from(new Set([...presets, ...historyDescriptions]));
    if (!typed) return all.slice(0, 8);
    return all.filter(s => s.toLowerCase().includes(typed) && s.toLowerCase() !== typed).slice(0, 8);
  }, [form.violation_description, presets, historyDescriptions]);

  const repeatMap = useMemo(() => {
    const sorted = [...violations].sort((a, b) =>
      new Date(a.violation_date).getTime() - new Date(b.violation_date).getTime()
    );
    const counters: Record<string, number> = {};
    const result: Record<string, number> = {};
    sorted.forEach(v => {
      const key = `${v.employee_id}::${normalizeDescription(v.violation_description)}`;
      counters[key] = (counters[key] || 0) + 1;
      result[v.id] = counters[key];
    });
    return result;
  }, [violations]);

  const availableRepeats = useMemo(() => {
    const set = new Set<number>();
    Object.values(repeatMap).forEach(n => set.add(n));
    return Array.from(set).sort((a, b) => a - b);
  }, [repeatMap]);

  const filtered = violations.filter(v => {
    const emp = empMap[v.employee_id];
    const empName = emp?.name || '';
    const empMobile = (emp as any)?.mobile || '';
    const q = search.trim().toLowerCase();
    if (q) {
      const matchName = empName.toLowerCase().includes(q);
      const matchMobile = empMobile.toString().toLowerCase().includes(q);
      const matchDesc = v.violation_description.toLowerCase().includes(q);
      if (!matchName && !matchMobile && !matchDesc) return false;
    }
    if (filterEmployee !== 'all' && v.employee_id !== filterEmployee) return false;
    if (filterRepeats.length > 0 && !filterRepeats.includes(repeatMap[v.id] || 1)) return false;
    if (fromDate && new Date(v.violation_date) < new Date(fromDate)) return false;
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      if (new Date(v.violation_date) > end) return false;
    }
    return true;
  });

  // Monthly counts of violations (current calendar month and per-month breakdown)
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const byMonth: Record<string, number> = {};
    violations.forEach(v => {
      const d = new Date(v.violation_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = (byMonth[key] || 0) + 1;
    });
    return { currentMonth: byMonth[curKey] || 0, byMonth, curKey };
  }, [violations]);

  const toggleRepeat = (n: number) => {
    setFilterRepeats(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  };

  const openAdd = () => {
    setEditItem(null);
    setForm({
      employee_id: '',
      violation_description: '',
      violation_location: '',
      violation_date: (() => {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      })(),
      action_taken: 'warning',
      deduction_amount: 1,
      daily_wage: 0,
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (v: Violation) => {
    setEditItem(v);
    // Convert ISO date to local datetime-local input format (YYYY-MM-DDTHH:mm)
    const d = new Date(v.violation_date);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setForm({
      employee_id: v.employee_id,
      violation_description: v.violation_description,
      violation_location: (v as any).violation_location || '',
      violation_date: local,
      action_taken: v.action_taken as ActionType,
      deduction_amount: Number(v.deduction_amount) || 1,
      daily_wage: Number((v as any).daily_wage) || 0,
      notes: v.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!form.employee_id || !form.violation_description.trim()) {
      toast.error(lang === 'ar' ? 'الموظف ووصف المخالفة مطلوبان' : 'Employee and description required');
      return;
    }
    setIsSaving(true);
    try {
      const violationDateIso = editItem
        ? new Date(form.violation_date).toISOString()
        : new Date().toISOString();

      const payload: any = {
        employee_id: form.employee_id,
        violation_description: form.violation_description.trim(),
        violation_location: form.violation_location.trim() || null,
        violation_date: violationDateIso,
        action_taken: form.action_taken,
        deduction_amount: form.deduction_amount,
        daily_wage: Number(form.daily_wage) || 0,
        notes: form.notes || null,
      };

      if (editItem) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: prof } = await supabase.from('profiles').select('email').eq('user_id', user?.id || '').maybeSingle();
        if (!isMasterAdminEmail(prof?.email)) {
          const res = await requestPendingChange({
            table: 'employee_violations',
            recordId: editItem.id,
            action: 'update',
            payload,
            snapshot: { violation_description: editItem.violation_description },
            description: lang === 'ar' ? 'تعديل مخالفة' : 'Edit violation',
          });
          if (!res.ok) { toast.error(res.error || 'Error'); return; }
          toast.success(lang === 'ar' ? 'تم إرسال طلب التعديل للموافقة' : 'Edit submitted for approval');
          setDialogOpen(false);
          return;
        }
        const { error } = await supabase.from('employee_violations').update(payload).eq('id', editItem.id);
        if (error) { toast.error(formatSupabaseError(error, lang)); return; }
        toast.success(lang === 'ar' ? 'تم التحديث' : 'Updated');
      } else {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const { error } = await supabase.from('employee_violations').insert({ ...payload, created_by: currentUser?.id ?? null });
        if (error) { toast.error(formatSupabaseError(error, lang)); return; }
        toast.success(lang === 'ar' ? 'تم الإضافة' : 'Added');
      }

      if (form.action_taken === 'termination' || form.action_taken === 'suspension') {
        const emp = empMap[form.employee_id];
        const newStatus: 'terminated' | 'archived' =
          form.action_taken === 'termination' ? 'terminated' : 'archived';

        if (emp && emp.status !== newStatus) {
          const violationDay = new Date(violationDateIso).toISOString().split('T')[0];
          const { error: updErr } = await supabase
            .from('employees')
            .update({ status: newStatus, termination_date: emp.termination_date || violationDay })
            .eq('id', form.employee_id);
          if (updErr) toast.error(formatSupabaseError(updErr, lang));
          else toast.success(t('employeeStatusAutoUpdated'));
        }
      }

      setDialogOpen(false);
      loadData();
    } catch (e) {
      toast.error(formatSupabaseError(e, lang));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const target = violations.find((v: any) => v.id === id);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('email').eq('user_id', user?.id || '').maybeSingle();

    if (!isMasterAdminEmail(prof?.email)) {
      const res = await requestPendingChange({
        table: 'employee_violations',
        recordId: id,
        action: 'delete',
        snapshot: { violation_description: target?.violation_description },
        description: lang === 'ar' ? 'حذف مخالفة' : 'Delete violation',
      });
      if (!res.ok) { toast.error(res.error || 'Error'); return; }
      toast.success(lang === 'ar' ? 'تم إرسال طلب الحذف للموافقة' : 'Delete submitted for approval');
      return;
    }
    const { error } = await supabase.from('employee_violations').delete().eq('id', id);
    if (error) { toast.error(formatSupabaseError(error, lang)); return; }
    toast.success(lang === 'ar' ? 'تم الحذف' : 'Deleted');
    loadData();
  };

  // Normalize phone to digits-only for wa.me link.
  // Defaults to Egypt (+20) when number starts with 0 or has no country code.
  const normalizePhoneForWhatsApp = (raw: string): string => {
    let digits = raw.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = '20' + digits.slice(1);
    if (digits.length === 10 && digits.startsWith('1')) digits = '20' + digits;
    return digits;
  };

  const handleSendWhatsapp = async (v: Violation) => {
    const emp = empMap[v.employee_id];
    if (!emp?.mobile || !emp.mobile.trim()) {
      toast.error(t('whatsappNoMobile'));
      return;
    }
    const phone = normalizePhoneForWhatsApp(emp.mobile);
    if (phone.length < 8) {
      toast.error(t('whatsappNoMobile'));
      return;
    }
    const repeat = repeatMap[v.id] || 1;
    const dateObj = new Date(v.violation_date);
    const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
    const dateOnly = dateObj.toLocaleDateString(locale, { dateStyle: 'short' } as any);
    const timeOnly = dateObj.toLocaleTimeString(locale, { timeStyle: 'short' } as any);
    const actionLabel = t(v.action_taken as never) as string;
    const locationStr = (v as any).violation_location || '-';

    // Message with cross-platform standard emojis (Unicode 6.0+ supported on all devices).
    // No deduction value by design.
    const lines = [
      `🦺 *${t('whatsappTitle')}* 🦺`,
      `━━━━━━━━━━━━━━━━━`,
      ``,
      `👤 ${t('whatsappGreeting')}: *${emp.name}*`,
      ``,
      `⚠️ ${t('whatsappIntro')}`,
      ``,
      `📝 *${t('whatsappLabelDescription')}:*`,
      `${v.violation_description}`,
      ``,
      `📍 *${t('whatsappLabelLocation')}:* ${locationStr}`,
      `📅 *${t('whatsappLabelDate')}:* ${dateOnly}`,
      `🕒 *${t('whatsappLabelTime')}:* ${timeOnly}`,
      `🔁 *${t('whatsappLabelRepeat')}:* ${repeat}`,
      `⚖️ *${t('whatsappLabelAction')}:* ${actionLabel}`,
      ``,
      `━━━━━━━━━━━━━━━━━`,
      `✅ ${t('whatsappFooter')}`,
      ``,
      `🛡️ ${t('whatsappSignature')}`,
    ];
    const message = lines.join('\n');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    // Log notification attempt as 'sent' (wa.me opens WhatsApp; user dispatches)
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error: notifErr } = await supabase.from('violation_notifications' as any).insert({
        violation_id: v.id,
        employee_id: v.employee_id,
        channel: 'whatsapp',
        status: 'sent',
        to_number: phone,
        attempt_count: 1,
        triggered_by: userData?.user?.id ?? null,
        sent_at: new Date().toISOString(),
      });
      if (notifErr) {
        console.error('Failed to log WhatsApp notification:', notifErr);
        toast.error(lang === 'ar' ? 'تم فتح واتساب لكن فشل تسجيل الحالة' : 'WhatsApp opened but failed to log status');
      } else {
        await loadData();
      }
    } catch (err) {
      console.error('Notification log error:', err);
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد بيانات للتصدير' : 'No data to export');
      return;
    }
    const rows = filtered.map(v => ({
      [t('employee')]: empMap[v.employee_id]?.name || '-',
      [t('violationDescription')]: v.violation_description,
      [t('violationLocation')]: (v as any).violation_location || '-',
      [t('repeatCount')]: repeatMap[v.id] || 1,
      [t('actionTaken')]: t(v.action_taken as never) as string,
      [t('deductionDays')]: v.action_taken === 'deduction' ? formatDays(Number(v.deduction_amount) || 0) : '-',
      [t('violationDate')]: new Date(v.violation_date).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US'),
      [t('notes')]: v.notes || '',
    }));
    const stamp = new Date().toISOString().split('T')[0];
    exportToExcel(rows, `violations_${stamp}`);
    toast.success(lang === 'ar' ? 'تم التصدير' : 'Exported');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('violations')}</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 me-1" />{t('exportExcel')}
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 me-1" />{t('addViolation')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="ps-9" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterEmployee} onValueChange={setFilterEmployee}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('employees')}: {t('allCategories')}</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between font-normal">
              <span className="truncate">
                {filterRepeats.length === 0
                  ? t('allRepeats')
                  : `${t('repeatCount')}: ${filterRepeats.sort((a, b) => a - b).join(', ')}`}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50 ms-2 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-sm font-medium">{t('repeatCount')}</span>
              {filterRepeats.length > 0 && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setFilterRepeats([])}>
                  {t('cancel')}
                </Button>
              )}
            </div>
            <div className="max-h-64 overflow-auto space-y-1">
              {availableRepeats.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-2">—</div>
              )}
              {availableRepeats.map(n => (
                <label key={n} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer">
                  <Checkbox
                    checked={filterRepeats.includes(n)}
                    onCheckedChange={() => toggleRepeat(n)}
                  />
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${getRepeatBadgeClass(n)}`}>
                    {n}
                  </span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('fromDate')}</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('toDate')}</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('employee')}</TableHead>
                  <TableHead>{t('violationDescription')}</TableHead>
                  <TableHead>{t('violationLocation')}</TableHead>
                  <TableHead>{t('repeatCount')}</TableHead>
                  <TableHead>{t('actionTaken')}</TableHead>
                  <TableHead>{t('deductionDays')}</TableHead>
                  <TableHead>{t('violationDate')}</TableHead>
                  <TableHead>{t('whatsappStatus')}</TableHead>
                  <TableHead>{t('createdBy')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(v => {
                  const repeat = repeatMap[v.id] || 1;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{empMap[v.employee_id]?.name || '-'}</TableCell>
                      <TableCell className="max-w-xs truncate" title={v.violation_description}>{v.violation_description}</TableCell>
                      <TableCell className="text-xs">{(v as any).violation_location || '-'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${getRepeatBadgeClass(repeat)}`}>
                          {repeat}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${ACTION_COLORS[v.action_taken]}`}>
                          {t(v.action_taken as never) as string}
                        </span>
                      </TableCell>
                      <TableCell>{v.action_taken === 'deduction' && Number(v.deduction_amount) > 0 ? formatDays(Number(v.deduction_amount)) : '-'}</TableCell>
                      <TableCell className="text-xs">{new Date(v.violation_date).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                      <TableCell>
                        {(() => {
                          const n = notifMap[v.id];
                          if (!n) return <span className="rounded-full px-2 py-1 text-xs font-medium bg-muted text-muted-foreground">{t('waNotSent')}</span>;
                          if (n.status === 'sent') return <span className="rounded-full px-2 py-1 text-xs font-medium bg-success/20 text-success" title={n.sent_at ? new Date(n.sent_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US') : ''}>✓ {t('waSent')}</span>;
                          if (n.status === 'failed') return <span className="rounded-full px-2 py-1 text-xs font-medium bg-destructive/20 text-destructive" title={n.error_message || ''}>✗ {t('waFailed')}</span>;
                          return <span className="rounded-full px-2 py-1 text-xs font-medium bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">⏳ {t('waPending')}</span>;
                        })()}
                      </TableCell>
                      <TableCell className="text-xs">{(v as any).created_by ? (profiles[(v as any).created_by] || '-') : '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {canSendMessages && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t('sendWhatsapp')}
                              onClick={() => handleSendWhatsapp(v)}
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      {t('noViolations')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle>{editItem ? t('editViolation') : t('addViolation')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-6 pb-2 flex-1">
            <div className="space-y-2">
              <Label>{t('employee')}</Label>
              <Popover open={employeePickerOpen} onOpenChange={setEmployeePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={employeePickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className={cn(!form.employee_id && 'text-muted-foreground')}>
                      {form.employee_id
                        ? (empMap[form.employee_id]?.name || t('selectEmployee'))
                        : t('selectEmployee')}
                    </span>
                    <ChevronDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command
                    filter={(value, search) => {
                      if (!search) return 1;
                      return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                    }}
                  >
                    <CommandInput placeholder={t('searchEmployee')} />
                    <CommandList>
                      <CommandEmpty>{lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</CommandEmpty>
                      <CommandGroup>
                        {employees.map(e => (
                          <CommandItem
                            key={e.id}
                            value={`${e.name} ${e.job_title || ''} ${e.location || ''}`}
                            onSelect={() => {
                              setForm({ ...form, employee_id: e.id });
                              setEmployeePickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'me-2 h-4 w-4',
                                form.employee_id === e.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span>{e.name}</span>
                            {e.job_title && (
                              <span className="ms-auto text-xs text-muted-foreground">{e.job_title}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>{t('commonViolations')}</Label>
              <Select
                value=""
                onValueChange={(v) => setForm(f => ({ ...f, violation_description: v }))}
              >
                <SelectTrigger><SelectValue placeholder={t('selectOrType')} /></SelectTrigger>
                <SelectContent>
                  {presets.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2" ref={inputWrapRef}>
              <Label>{t('violationDescription')}</Label>
              <div className="relative">
                <Textarea
                  value={form.violation_description}
                  onChange={e => { setForm({ ...form, violation_description: e.target.value }); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder={lang === 'ar' ? 'مثال: عدم ارتداء جوانتي أثناء العمل' : 'e.g. Not wearing gloves while working'}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
                    {suggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        className="block w-full px-3 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground"
                        onClick={() => { setForm(f => ({ ...f, violation_description: s })); setShowSuggestions(false); }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(() => {
                if (!form.employee_id || !form.violation_description.trim()) return null;
                const key = normalizeDescription(form.violation_description);
                const priorCount = violations.filter(v =>
                  v.employee_id === form.employee_id &&
                  normalizeDescription(v.violation_description) === key &&
                  (!editItem || v.id !== editItem.id)
                ).length;
                const nextRepeat = priorCount + 1;
                return (
                  <div className={cn('inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold', getRepeatBadgeClass(nextRepeat))}>
                    <span>{lang === 'ar' ? 'رقم تكرار المخالفة' : 'Repeat number'}: {nextRepeat}</span>
                    {priorCount > 0 && (
                      <span className="opacity-80 font-normal">
                        ({lang === 'ar' ? `سبق تسجيلها ${priorCount} مرة` : `previously recorded ${priorCount} time(s)`})
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="space-y-2">
              <Label>{t('violationLocation')}</Label>
              <Input
                value={form.violation_location}
                onChange={e => setForm({ ...form, violation_location: e.target.value })}
                placeholder={lang === 'ar' ? 'مثال: ساحة التحميل، المخزن A' : 'e.g. Loading dock, Warehouse A'}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('violationTime')}</Label>
              <Input type="datetime-local" value={form.violation_date} onChange={e => setForm({ ...form, violation_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('actionTaken')}</Label>
              <Select value={form.action_taken} onValueChange={(v: ActionType) => setForm({ ...form, action_taken: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="verbal_warning">{t('verbal_warning')}</SelectItem>
                  <SelectItem value="warning">{t('warning')}</SelectItem>
                  <SelectItem value="deduction">{t('deduction')}</SelectItem>
                  <SelectItem value="suspension">{t('suspension')}</SelectItem>
                  <SelectItem value="termination">{t('termination')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.action_taken === 'deduction' && (
              <>
                <div className="space-y-2">
                  <Label>{t('deductionDays')}</Label>
                  <Select
                    value={String(form.deduction_amount)}
                    onValueChange={v => setForm({ ...form, deduction_amount: Number(v) })}
                  >
                    <SelectTrigger><SelectValue placeholder={t('selectDeduction')} /></SelectTrigger>
                    <SelectContent>
                      {DEDUCTION_DAY_OPTIONS.map(d => (
                        <SelectItem key={d} value={String(d)}>{formatDays(d)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('dailyWage')} ({t('currency')})</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={form.daily_wage || ''}
                    onChange={e => setForm({ ...form, daily_wage: Number(e.target.value) || 0 })}
                    placeholder={t('dailyWagePlaceholder')}
                  />
                  {form.daily_wage > 0 && form.deduction_amount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('deductionMoney')}: <span className="font-semibold text-foreground">
                        {(form.daily_wage * form.deduction_amount).toLocaleString()} {t('currency')}
                      </span>
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 justify-end p-6 pt-4 border-t shrink-0 bg-background">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : t('save')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
