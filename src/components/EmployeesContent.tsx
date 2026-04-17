import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { useDebounce } from '@/hooks/use-debounce';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DataPagination } from '@/components/ui/data-pagination';
import { Plus, Pencil, Trash2, Download, Search, Eye, Upload } from 'lucide-react';
import { exportToExcel } from '@/lib/export';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import type { Tables as DBTables } from '@/integrations/supabase/types';

type Employee = DBTables<'employees'>;

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-success/20 text-success',
  resigned: 'bg-accent/20 text-accent-foreground',
  terminated: 'bg-destructive/20 text-destructive',
};

const PAGE_SIZE = 50;

export function EmployeesContent() {
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [filterShift, setFilterShift] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => { setPage(0); }, [debouncedSearch, filterShift, filterDept]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [empViolations, setEmpViolations] = useState<any[]>([]);
  const [editItem, setEditItem] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: '', hire_date: '', status: 'active' as 'active' | 'resigned' | 'terminated', termination_date: '', department: '', notes: '', shift: '' as '' | 'morning' | 'night', mobile: '', job_title: '' });

  // Departments list — small, cache long
  const { data: departments = [] } = useQuery({
    queryKey: ['employees_departments'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('department').not('department', 'is', null);
      return [...new Set((data || []).map((e: any) => e.department).filter(Boolean))] as string[];
    },
    staleTime: 5 * 60_000,
  });

  // Paginated employees
  const { data: empData, isLoading } = useQuery({
    queryKey: ['employees', { search: debouncedSearch, shift: filterShift, dept: filterDept, page }],
    queryFn: async () => {
      let q = supabase.from('employees').select('*', { count: 'exact' });
      if (debouncedSearch.trim()) q = q.ilike('name', `%${debouncedSearch.trim()}%`);
      if (filterShift !== 'all') q = q.eq('shift', filterShift);
      if (filterDept !== 'all') q = q.eq('department', filterDept);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await q.order('created_at', { ascending: false }).range(from, to);
      return { items: (data || []) as Employee[], total: count || 0 };
    },
  });

  const employees = empData?.items || [];
  const total = empData?.total || 0;

  const invalidateEmployees = () => {
    qc.invalidateQueries({ queryKey: ['employees'] });
    qc.invalidateQueries({ queryKey: ['employees_departments'] });
  };

  const openAdd = () => {
    setEditItem(null);
    setForm({ name: '', hire_date: new Date().toISOString().split('T')[0], status: 'active', termination_date: '', department: '', notes: '', shift: '', mobile: '', job_title: '' });
    setDialogOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditItem(emp);
    setForm({
      name: emp.name,
      hire_date: emp.hire_date,
      status: emp.status,
      termination_date: emp.termination_date || '',
      department: emp.department || '',
      notes: emp.notes || '',
      shift: (emp as any).shift || '',
      mobile: (emp as any).mobile || '',
      job_title: (emp as any).job_title || '',
    });
    setDialogOpen(true);
  };

  const viewDetails = async (emp: Employee) => {
    setSelectedEmployee(emp);
    const [assignRes, violRes] = await Promise.all([
      supabase
        .from('assignments')
        .select('*, stock_items(name, category, size, unit_price)')
        .eq('employee_id', emp.id)
        .order('assignment_date', { ascending: false }),
      supabase
        .from('employee_violations')
        .select('*')
        .eq('employee_id', emp.id)
        .order('violation_date', { ascending: false }),
    ]);
    setAssignments(assignRes.data || []);
    setEmpViolations(violRes.data || []);
    setDetailOpen(true);
  };

  const handleSave = async () => {
    const payload: any = {
      name: form.name,
      hire_date: form.hire_date,
      status: form.status,
      department: form.department || null,
      notes: form.notes || null,
      termination_date: form.status !== 'active' ? (form.termination_date || null) : null,
      shift: form.shift || null,
      mobile: form.mobile || null,
      job_title: form.job_title || null,
    };
    if (editItem) {
      await supabase.from('employees').update(payload).eq('id', editItem.id);
    } else {
      await supabase.from('employees').insert(payload);
    }
    setDialogOpen(false);
    invalidateEmployees();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('employees').delete().eq('id', id);
    invalidateEmployees();
  };

  const handleExport = async () => {
    // Export ALL filtered rows (not just current page)
    let q = supabase.from('employees').select('*');
    if (debouncedSearch.trim()) q = q.ilike('name', `%${debouncedSearch.trim()}%`);
    if (filterShift !== 'all') q = q.eq('shift', filterShift);
    if (filterDept !== 'all') q = q.eq('department', filterDept);
    const { data: dataToExport } = await q.order('created_at', { ascending: false });
    const rows0 = (dataToExport || []) as Employee[];

    if (rows0.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد بيانات للتصدير' : 'No data to export');
      return;
    }

    const { data: allAssignments } = await supabase
      .from('assignments')
      .select('*, stock_items(name, category, size)')
      .in('employee_id', rows0.map(e => e.id));

    const assignmentsByEmp: Record<string, any[]> = {};
    (allAssignments || []).forEach((a: any) => {
      if (!assignmentsByEmp[a.employee_id]) assignmentsByEmp[a.employee_id] = [];
      assignmentsByEmp[a.employee_id].push(a);
    });

    const rows = rows0.flatMap(e => {
      const empAssignments = assignmentsByEmp[e.id] || [];
      if (empAssignments.length === 0) {
        return [{
          [t('name')]: e.name,
          [t('jobTitle')]: e.job_title || '-',
          [t('status')]: t(e.status as any),
          [t('shift')]: e.shift ? t(e.shift as any) : '-',
          [t('department')]: e.department || '-',
          [t('mobile')]: e.mobile || '-',
          [t('hireDate')]: e.hire_date,
          [t('stockItem')]: '-',
          [t('quantityAssigned')]: '-',
          [t('assignmentDate')]: '-',
          [t('reassignReason')]: '-',
          [t('returnDate')]: '-',
        }];
      }
      const getReasonFromNotes = (notes: string | null) => {
        if (!notes?.startsWith('[')) return '-';
        if (notes.includes(t('lost'))) return t('lost');
        if (notes.includes(t('damaged'))) return t('damaged');
        return '-';
      };
      return empAssignments.map((a: any, i: number) => ({
        [t('name')]: i === 0 ? e.name : '',
        [t('jobTitle')]: i === 0 ? (e.job_title || '-') : '',
        [t('status')]: i === 0 ? t(e.status as any) : '',
        [t('shift')]: i === 0 ? (e.shift ? t(e.shift as any) : '-') : '',
        [t('department')]: i === 0 ? (e.department || '-') : '',
        [t('mobile')]: i === 0 ? (e.mobile || '-') : '',
        [t('hireDate')]: i === 0 ? e.hire_date : '',
        [t('stockItem')]: `${a.stock_items?.name || ''} ${a.stock_items?.size !== 'N/A' ? `(${a.stock_items?.size})` : ''}`.trim(),
        [t('quantityAssigned')]: a.quantity_assigned,
        [t('assignmentDate')]: new Date(a.assignment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'),
        [t('reassignReason')]: getReasonFromNotes(a.notes),
        [t('returnDate')]: a.return_date ? new Date(a.return_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-',
      }));
    });

    exportToExcel(rows, 'employees');
    toast.success(lang === 'ar' ? `تم تصدير ${rows0.length} موظف` : `Exported ${rows0.length} employees`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      if (rows.length === 0) {
        toast.error(lang === 'ar' ? 'الملف فارغ' : 'File is empty');
        return;
      }

      let imported = 0;
      for (const row of rows) {
        const name = (row[t('name')] || row['Name'] || row['الاسم'] || '').toString().trim();
        if (!name) continue;

        const payload: any = {
          name,
          hire_date: row[t('hireDate')] || row['Hire Date'] || row['تاريخ التعيين'] || new Date().toISOString().split('T')[0],
          status: 'active',
          department: (row[t('department')] || row['Department'] || row['القسم'] || '').toString().trim() || null,
          job_title: (row[t('jobTitle')] || row['Job Title'] || row['الوظيفة'] || '').toString().trim() || null,
          mobile: (row[t('mobile')] || row['Mobile'] || row['رقم الموبايل'] || '').toString().trim() || null,
          shift: null as string | null,
          notes: (row[t('notes')] || row['Notes'] || row['ملاحظات'] || '').toString().trim() || null,
        };

        const shiftVal = (row[t('shift')] || row['Shift'] || row['الشفت'] || '').toString().trim().toLowerCase();
        if (shiftVal.includes('morning') || shiftVal.includes('صباح')) payload.shift = 'morning';
        else if (shiftVal.includes('night') || shiftVal.includes('مسائ')) payload.shift = 'night';

        const statusVal = (row[t('status')] || row['Status'] || row['الحالة'] || '').toString().trim().toLowerCase();
        if (statusVal.includes('resigned') || statusVal.includes('مستقيل')) payload.status = 'resigned';
        else if (statusVal.includes('terminated') || statusVal.includes('منتهي')) payload.status = 'terminated';

        const { error } = await supabase.from('employees').insert(payload);
        if (!error) imported++;
      }

      toast.success(lang === 'ar' ? `تم استيراد ${imported} موظف` : `Imported ${imported} employees`);
      invalidateEmployees();
    } catch {
      toast.error(lang === 'ar' ? 'خطأ في قراءة الملف' : 'Error reading file');
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('employees')}</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 me-1" />{t('exportExcel')}
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 me-1" />{lang === 'ar' ? 'استيراد' : 'Import'}
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 me-1" />{t('addEmployee')}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="ps-9" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterShift} onValueChange={setFilterShift}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={t('shift')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('shift')}: {t('allCategories')}</SelectItem>
            <SelectItem value="morning">{t('morning')}</SelectItem>
            <SelectItem value="night">{t('night')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={t('department')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('department')}: {t('allCategories')}</SelectItem>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('jobTitle')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('shift')}</TableHead>
                  <TableHead>{t('department')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(emp => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <button className="font-medium text-primary hover:underline" onClick={() => viewDetails(emp)}>
                        {emp.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs">{(emp as any).job_title || '-'}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[emp.status]}`}>
                        {t(emp.status as any)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{(emp as any).shift ? t((emp as any).shift as any) : '-'}</TableCell>
                    <TableCell className="text-xs">{emp.department || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => viewDetails(emp)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(emp.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {employees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {isLoading ? t('loading') : '-'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DataPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? t('editEmployee') : t('addEmployee')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('name')}</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('hireDate')}</Label>
              <Input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('status')}</Label>
              <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('active')}</SelectItem>
                  <SelectItem value="resigned">{t('resigned')}</SelectItem>
                  <SelectItem value="terminated">{t('terminated')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.status !== 'active' && (
              <div className="space-y-2">
                <Label>{t('terminationDate')}</Label>
                <Input type="date" value={form.termination_date} onChange={e => setForm({ ...form, termination_date: e.target.value })} />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('department')}</Label>
              <Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('jobTitle')}</Label>
              <Input value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('mobile')}</Label>
              <Input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('shift')}</Label>
              <Select value={form.shift} onValueChange={(v: any) => setForm({ ...form, shift: v })}>
                <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">{t('morning')}</SelectItem>
                  <SelectItem value="night">{t('night')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedEmployee?.name}</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">{t('jobTitle')}:</span> {(selectedEmployee as any).job_title || '-'}</div>
                <div><span className="text-muted-foreground">{t('department')}:</span> {selectedEmployee.department || '-'}</div>
                <div><span className="text-muted-foreground">{t('shift')}:</span> {(selectedEmployee as any).shift ? t((selectedEmployee as any).shift as any) : '-'}</div>
                <div><span className="text-muted-foreground">{t('mobile')}:</span> {(selectedEmployee as any).mobile || '-'}</div>
                <div><span className="text-muted-foreground">{t('hireDate')}:</span> {selectedEmployee.hire_date}</div>
                <div><span className="text-muted-foreground">{t('status')}:</span> {t(selectedEmployee.status as any)}</div>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">{t('assignments')}</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('stockItem')}</TableHead>
                        <TableHead>{t('quantityAssigned')}</TableHead>
                        <TableHead>{t('assignmentDate')}</TableHead>
                        <TableHead>{t('returnDate')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignments.map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.stock_items?.name} {a.stock_items?.size !== 'N/A' ? `(${a.stock_items?.size})` : ''}</TableCell>
                          <TableCell>{a.quantity_assigned}</TableCell>
                          <TableCell>{new Date(a.assignment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</TableCell>
                          <TableCell>{a.return_date ? new Date(a.return_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-'}</TableCell>
                        </TableRow>
                      ))}
                      {assignments.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">-</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {empViolations.length > 0 && (
                <div>
                  <h3 className="mb-2 font-semibold">{t('violationHistory')}</h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('violationDescription')}</TableHead>
                          <TableHead>{t('actionTaken')}</TableHead>
                          <TableHead>{t('violationDate')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {empViolations.map((v: any) => (
                          <TableRow key={v.id}>
                            <TableCell>{v.violation_description}</TableCell>
                            <TableCell>{t(v.action_taken as any)}</TableCell>
                            <TableCell>{new Date(v.violation_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
