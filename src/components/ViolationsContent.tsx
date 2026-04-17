import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/export';
import type { Tables as DBTables } from '@/integrations/supabase/types';

type Violation = DBTables<'employee_violations'>;
type Employee = DBTables<'employees'>;

type ActionType = 'warning' | 'verbal_warning' | 'deduction' | 'suspension' | 'termination';

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
  const { isAdmin } = useAuth();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Violation | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    employee_id: '',
    violation_description: '',
    violation_date: new Date().toISOString().split('T')[0],
    action_taken: 'warning' as ActionType,
    deduction_amount: 0,
    notes: '',
  });

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
    const [v, e] = await Promise.all([
      supabase.from('employee_violations').select('*').order('violation_date', { ascending: false }),
      supabase.from('employees').select('*').order('name'),
    ]);
    setViolations(v.data || []);
    setEmployees(e.data || []);
  };

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

  const filtered = violations.filter(v => {
    const empName = empMap[v.employee_id]?.name || '';
    if (search && !empName.toLowerCase().includes(search.toLowerCase()) && !v.violation_description.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterEmployee !== 'all' && v.employee_id !== filterEmployee) return false;
    if (fromDate && new Date(v.violation_date) < new Date(fromDate)) return false;
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      if (new Date(v.violation_date) > end) return false;
    }
    return true;
  });

  const openAdd = () => {
    setEditItem(null);
    setForm({
      employee_id: '',
      violation_description: '',
      violation_date: new Date().toISOString().split('T')[0],
      action_taken: 'warning',
      deduction_amount: 0,
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (v: Violation) => {
    setEditItem(v);
    setForm({
      employee_id: v.employee_id,
      violation_description: v.violation_description,
      violation_date: v.violation_date.split('T')[0],
      action_taken: v.action_taken as ActionType,
      deduction_amount: Number(v.deduction_amount) || 0,
      notes: v.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.employee_id || !form.violation_description.trim()) {
      toast.error(lang === 'ar' ? 'الموظف ووصف المخالفة مطلوبان' : 'Employee and description required');
      return;
    }
    const payload = {
      employee_id: form.employee_id,
      violation_description: form.violation_description.trim(),
      violation_date: new Date(form.violation_date).toISOString(),
      action_taken: form.action_taken,
      deduction_amount: form.deduction_amount,
      notes: form.notes || null,
    };
    if (editItem) {
      const { error } = await supabase.from('employee_violations').update(payload).eq('id', editItem.id);
      if (error) { toast.error(error.message); return; }
      toast.success(lang === 'ar' ? 'تم التحديث' : 'Updated');
    } else {
      const { error } = await supabase.from('employee_violations').insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success(lang === 'ar' ? 'تم الإضافة' : 'Added');
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('employee_violations').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === 'ar' ? 'تم الحذف' : 'Deleted');
    loadData();
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد بيانات للتصدير' : 'No data to export');
      return;
    }
    const rows = filtered.map(v => ({
      [t('employee')]: empMap[v.employee_id]?.name || '-',
      [t('violationDescription')]: v.violation_description,
      [t('repeatCount')]: repeatMap[v.id] || 1,
      [t('actionTaken')]: t(v.action_taken as never) as string,
      [t('deductionAmount')]: Number(v.deduction_amount) || 0,
      [t('violationDate')]: new Date(v.violation_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'),
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                  <TableHead>{t('repeatCount')}</TableHead>
                  <TableHead>{t('actionTaken')}</TableHead>
                  <TableHead>{t('deductionAmount')}</TableHead>
                  <TableHead>{t('violationDate')}</TableHead>
                  {isAdmin && <TableHead>{t('actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(v => {
                  const repeat = repeatMap[v.id] || 1;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{empMap[v.employee_id]?.name || '-'}</TableCell>
                      <TableCell className="max-w-xs truncate" title={v.violation_description}>{v.violation_description}</TableCell>
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
                      <TableCell>{Number(v.deduction_amount) > 0 ? `${v.deduction_amount} ${t('currency')}` : '-'}</TableCell>
                      <TableCell className="text-xs">{new Date(v.violation_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? t('editViolation') : t('addViolation')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('employee')}</Label>
              <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder={t('selectEmployee')} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
            </div>

            <div className="space-y-2">
              <Label>{t('violationDate')}</Label>
              <Input type="date" value={form.violation_date} onChange={e => setForm({ ...form, violation_date: e.target.value })} />
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
              <div className="space-y-2">
                <Label>{t('deductionAmount')} ({t('currency')})</Label>
                <Input type="number" min="0" step="0.01" value={form.deduction_amount} onChange={e => setForm({ ...form, deduction_amount: Number(e.target.value) })} />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
              <Button onClick={handleSave}>{t('save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
