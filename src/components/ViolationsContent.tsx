import { useEffect, useState, useMemo } from 'react';
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
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
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

// Compute repeat-count badge color based on occurrence number
export function getRepeatBadgeClass(repeatNumber: number): string {
  if (repeatNumber <= 1) return 'bg-success/20 text-success';
  if (repeatNumber === 2) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
  return 'bg-destructive text-destructive-foreground';
}

// Normalize description for repeat detection (case + whitespace)
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Violation | null>(null);
  const [form, setForm] = useState({
    employee_id: '',
    violation_description: '',
    violation_date: new Date().toISOString().split('T')[0],
    action_taken: 'warning' as ActionType,
    deduction_amount: 0,
    notes: '',
  });

  useEffect(() => { loadData(); }, []);

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

  // Compute repeat numbers per (employee, normalized description) chronologically
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('violations')}</h1>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 me-1" />{t('addViolation')}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="ps-9" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterEmployee} onValueChange={setFilterEmployee}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('employees')}: {t('allCategories')}</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
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
                          {t(v.action_taken as any)}
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
              <Label>{t('violationDescription')}</Label>
              <Textarea value={form.violation_description} onChange={e => setForm({ ...form, violation_description: e.target.value })} placeholder={lang === 'ar' ? 'مثال: عدم ارتداء جوانتي أثناء العمل' : 'e.g. Not wearing gloves while working'} />
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
