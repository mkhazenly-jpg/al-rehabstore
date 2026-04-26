import { useEffect, useState, useRef } from 'react';
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
  archived: 'bg-muted text-muted-foreground',
};

type EmployeeStatus = 'active' | 'resigned' | 'terminated' | 'archived';

export function EmployeesContent() {
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [filterShift, setFilterShift] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [empViolations, setEmpViolations] = useState<any[]>([]);
  const [editItem, setEditItem] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: '', hire_date: '', status: 'active' as EmployeeStatus, termination_date: '', department: '', notes: '', shift: '' as '' | 'morning' | 'night', mobile: '', job_title: '', location: '' as '' | 'RDC' | 'SDC' });
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [showJobSuggestions, setShowJobSuggestions] = useState(false);
  const jobInputWrapRef = useRef<HTMLDivElement>(null);

  // Close job suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (jobInputWrapRef.current && !jobInputWrapRef.current.contains(e.target as Node)) {
        setShowJobSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Unique past job titles for autocomplete
  const jobTitleHistory = Array.from(new Set(
    employees.map(e => (e.job_title || '').trim()).filter(Boolean)
  ));
  const jobSuggestions = (() => {
    const typed = form.job_title.trim().toLowerCase();
    if (!typed) return jobTitleHistory.slice(0, 8);
    return jobTitleHistory
      .filter(s => s.toLowerCase().includes(typed) && s.toLowerCase() !== typed)
      .slice(0, 8);
  })();

  useEffect(() => { loadEmployees(); }, []);

  const loadEmployees = async () => {
    const { data } = await supabase.from('employees').select('*').order('created_at', { ascending: false });
    setEmployees(data || []);
  };

  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))];
  const filtered = employees.filter(e => {
    const isArchived = (e.status as string) === 'archived';
    if (showArchived ? !isArchived : isArchived) return false;
    if (!e.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterShift !== 'all' && (e as any).shift !== filterShift) return false;
    if (filterDept !== 'all' && e.department !== filterDept) return false;
    if (filterLocation !== 'all' && (e as any).location !== filterLocation) return false;
    return true;
  });

  const openAdd = () => {
    setEditItem(null);
    setIsAddingDept(false);
    setForm({ name: '', hire_date: new Date().toISOString().split('T')[0], status: 'active', termination_date: '', department: '', notes: '', shift: '', mobile: '', job_title: '', location: '' });
    setDialogOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditItem(emp);
    setIsAddingDept(false);
    setForm({
      name: emp.name,
      hire_date: emp.hire_date,
      status: emp.status as EmployeeStatus,
      termination_date: emp.termination_date || '',
      department: emp.department || '',
      notes: emp.notes || '',
      shift: (emp as any).shift || '',
      mobile: (emp as any).mobile || '',
      job_title: (emp as any).job_title || '',
      location: (emp as any).location || '',
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
    const dept = form.department === '__new__' ? '' : form.department.trim();
    // Auto-archive any non-active status (resigned / terminated / archived all become archived)
    const finalStatus: EmployeeStatus = form.status === 'active' ? 'active' : 'archived';
    const payload: any = {
      name: form.name,
      hire_date: form.hire_date,
      status: finalStatus,
      department: dept || null,
      notes: form.notes || null,
      termination_date: finalStatus !== 'active' ? (form.termination_date || new Date().toISOString().split('T')[0]) : null,
      shift: form.shift || null,
      mobile: form.mobile || null,
      job_title: form.job_title || null,
      location: form.location || null,
    };
    if (editItem) {
      await supabase.from('employees').update(payload).eq('id', editItem.id);
    } else {
      await supabase.from('employees').insert(payload);
    }
    setDialogOpen(false);
    loadEmployees();
  };

  const handleDelete = async (emp: Employee) => {
    // Check if employee has assignments
    const { count } = await supabase
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', emp.id);

    if ((count || 0) > 0) {
      // Has assignments → archive instead
      if (!confirm(t('archiveConfirm'))) return;
      const { error } = await supabase
        .from('employees')
        .update({ status: 'archived' as any })
        .eq('id', emp.id);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success(t('archived'));
        loadEmployees();
      }
      return;
    }

    // No assignments → safe to delete
    if (!confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذا الموظف؟' : 'Are you sure you want to delete this employee?')) return;
    const { error } = await supabase.from('employees').delete().eq('id', emp.id);
    if (error) {
      toast.error(error.message.includes('assignments') ? t('cannotDeleteHasAssignments') : error.message);
    } else {
      loadEmployees();
    }
  };

  const handleUnarchive = async (emp: Employee) => {
    const { error } = await supabase
      .from('employees')
      .update({ status: 'active' as any })
      .eq('id', emp.id);
    if (error) toast.error(error.message);
    else { toast.success(t('active')); loadEmployees(); }
  };

  const handleExport = async () => {
    const dataToExport = filtered.length > 0 ? filtered : employees;
    if (dataToExport.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد بيانات للتصدير' : 'No data to export');
      return;
    }

    // Fetch all assignments with stock item details
    const { data: allAssignments } = await supabase
      .from('assignments')
      .select('*, stock_items(name, category, size)')
      .in('employee_id', dataToExport.map(e => e.id));

    // Group assignments by employee
    const assignmentsByEmp: Record<string, any[]> = {};
    (allAssignments || []).forEach((a: any) => {
      if (!assignmentsByEmp[a.employee_id]) assignmentsByEmp[a.employee_id] = [];
      assignmentsByEmp[a.employee_id].push(a);
    });

    const rows = dataToExport.flatMap(e => {
      const empAssignments = assignmentsByEmp[e.id] || [];
      if (empAssignments.length === 0) {
        return [{
          [t('name')]: e.name,
          [t('jobTitle')]: e.job_title || '-',
          [t('status')]: t(e.status as any),
          [t('shift')]: e.shift ? t(e.shift as any) : '-',
          [t('location')]: (e as any).location || '-',
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
        [t('location')]: i === 0 ? ((e as any).location || '-') : '',
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
    toast.success(lang === 'ar' ? `تم تصدير ${dataToExport.length} موظف` : `Exported ${dataToExport.length} employees`);
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
          location: null as string | null,
          notes: (row[t('notes')] || row['Notes'] || row['ملاحظات'] || '').toString().trim() || null,
        };

        const locVal = (row[t('location')] || row['Location'] || row['الموقع'] || '').toString().trim().toUpperCase();
        if (locVal === 'RDC' || locVal === 'SDC') payload.location = locVal;

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
      loadEmployees();
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
            {departments.map(d => <SelectItem key={d} value={d!}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLocation} onValueChange={setFilterLocation}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={t('location')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('location')}: {t('allLocations')}</SelectItem>
            <SelectItem value="RDC">RDC</SelectItem>
            <SelectItem value="SDC">SDC</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={showArchived ? 'default' : 'outline'} size="sm" onClick={() => setShowArchived(s => !s)}>
          {showArchived ? t('hideArchived') : t('showArchived')}
        </Button>
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
                  <TableHead>{t('location')}</TableHead>
                  <TableHead>{t('department')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(emp => (
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
                    <TableCell className="text-xs">{(emp as any).location || '-'}</TableCell>
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
                            {(emp.status as string) === 'archived' ? (
                              <Button variant="ghost" size="sm" onClick={() => handleUnarchive(emp)} title={t('unarchive')}>
                                {t('unarchive')}
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(emp)} title={t('delete')}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle>{editItem ? t('editEmployee') : t('addEmployee')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-6 pb-2 flex-1">
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
                  <SelectItem value="archived">{t('archived')}</SelectItem>
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
              {departments.length > 0 && !isAddingDept ? (
                <Select
                  value={form.department || '__none__'}
                  onValueChange={v => {
                    if (v === '__new__') {
                      setIsAddingDept(true);
                      setForm({ ...form, department: '' });
                    } else {
                      setForm({ ...form, department: v === '__none__' ? '' : v });
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-</SelectItem>
                    {departments.map(d => <SelectItem key={d!} value={d!}>{d}</SelectItem>)}
                    <SelectItem value="__new__">{t('addNewDepartment')}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder={t('newDepartmentName')}
                    value={form.department}
                    onChange={e => setForm({ ...form, department: e.target.value })}
                    autoFocus
                  />
                  {departments.length > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setIsAddingDept(false); setForm({ ...form, department: '' }); }}>
                      {t('cancel')}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2" ref={jobInputWrapRef}>
              <Label>{t('jobTitle')}</Label>
              <div className="relative">
                <Input
                  value={form.job_title}
                  onChange={e => { setForm({ ...form, job_title: e.target.value }); setShowJobSuggestions(true); }}
                  onFocus={() => setShowJobSuggestions(true)}
                  autoComplete="off"
                />
                {showJobSuggestions && jobSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
                    {jobSuggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        className="block w-full px-3 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground"
                        onClick={() => { setForm(f => ({ ...f, job_title: s })); setShowJobSuggestions(false); }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
              <Label>{t('location')}</Label>
              <Select value={form.location} onValueChange={(v: any) => setForm({ ...form, location: v })}>
                <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RDC">RDC</SelectItem>
                  <SelectItem value="SDC">SDC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 justify-end p-6 pt-4 border-t shrink-0 bg-background">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave}>{t('save')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedEmployee?.name} - {t('details')}</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-semibold">{t('personalInfo')}</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">{t('status')}:</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium w-fit ${STATUS_COLORS[selectedEmployee.status]}`}>
                    {t(selectedEmployee.status as any)}
                  </span>
                  <span className="text-muted-foreground">{t('hireDate')}:</span>
                  <span>{selectedEmployee.hire_date}</span>
                  {selectedEmployee.termination_date && (
                    <>
                      <span className="text-muted-foreground">{t('terminationDate')}:</span>
                      <span>{selectedEmployee.termination_date}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">{t('department')}:</span>
                  <span>{selectedEmployee.department || '-'}</span>
                  <span className="text-muted-foreground">{t('jobTitle')}:</span>
                  <span>{(selectedEmployee as any).job_title || '-'}</span>
                  <span className="text-muted-foreground">{t('mobile')}:</span>
                  <span>{(selectedEmployee as any).mobile || '-'}</span>
                  <span className="text-muted-foreground">{t('shift')}:</span>
                  <span>{(selectedEmployee as any).shift ? t((selectedEmployee as any).shift as any) : '-'}</span>
                  <span className="text-muted-foreground">{t('location')}:</span>
                  <span>{(selectedEmployee as any).location || '-'}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">{t('assignmentHistory')}</h3>
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">-</p>
                ) : (
                  <>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {assignments.map((a: any) => {
                        const price = (a.stock_items?.unit_price || 0) * a.quantity_assigned;
                        const itemName = (a.stock_items?.name || '').toLowerCase();
                        const itemCat = (a.stock_items?.category || '').toLowerCase();
                        const combined = `${itemName} ${itemCat}`;
                        const isShoes = /shoe|حذاء|بوت|boot|سيفتي/.test(combined);
                        const isGlovesOrVest = /glove|جوانتي|قفاز|vest|فيست|سترة/.test(combined);
                        const assignedAt = new Date(a.assignment_date).getTime();
                        const now = Date.now();
                        const monthsElapsed = (now - assignedAt) / (1000 * 60 * 60 * 24 * 30.4375);
                        const isActive = a.status === 'approved';
                        const isExpired = isActive && (
                          (isShoes && monthsElapsed >= 12) ||
                          (isGlovesOrVest && monthsElapsed >= 4)
                        );
                        return (
                          <div key={a.id} className={`flex items-center justify-between rounded-lg border p-2 text-sm ${isExpired ? 'border-destructive bg-destructive/10' : ''}`}>
                            <div>
                              <p className={`font-medium ${isExpired ? 'text-destructive' : ''}`}>
                                {a.stock_items?.name} ({a.stock_items?.category})
                                {a.stock_items?.category?.toLowerCase().includes('safety') && a.stock_items?.size && a.stock_items.size !== 'N/A' && (
                                  <span className="ms-1 text-xs text-muted-foreground">- {t('size')}: {a.stock_items.size}</span>
                                )}
                              </p>
                              <p className={`text-xs ${isExpired ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                                {t('quantity')}: {a.quantity_assigned} • {new Date(a.assignment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                                {a.stock_items?.unit_price > 0 && (
                                  <> • {t('unitPrice')}: {a.stock_items.unit_price} {t('currency')} • {t('totalPrice')}: {price} {t('currency')}</>
                                )}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                a.status === 'approved' ? 'bg-success/20 text-success' :
                                a.status === 'pending' ? 'bg-accent/20 text-accent-foreground' :
                                a.status === 'replaced' ? 'bg-primary/20 text-primary' :
                                a.status === 'returned' ? 'bg-secondary text-secondary-foreground' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {t(a.status as any)}
                              </span>
                              {isExpired && (
                                <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
                                  {t('renewalDue')}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {(() => {
                      const grandTotal = assignments.reduce((sum: number, a: any) => {
                        if (a.status === 'replaced' || a.status === 'returned') return sum;
                        return sum + ((a.stock_items?.unit_price || 0) * a.quantity_assigned);
                      }, 0);
                      return grandTotal > 0 ? (
                        <div className="flex justify-between items-center rounded-lg bg-muted p-2 text-sm font-semibold">
                          <span>{t('totalPrice')}</span>
                          <span>{grandTotal} {t('currency')}</span>
                        </div>
                      ) : null;
                    })()}
                  </>
                )}
              </div>

              {/* Violations section */}
              <div className="space-y-2">
                <h3 className="font-semibold">{t('violationHistory')}</h3>
                {empViolations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noViolations')}</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {(() => {
                      // Compute repeat numbers for this employee chronologically
                      const sorted = [...empViolations].sort((a, b) =>
                        new Date(a.violation_date).getTime() - new Date(b.violation_date).getTime()
                      );
                      const counters: Record<string, number> = {};
                      const repeatById: Record<string, number> = {};
                      sorted.forEach(v => {
                        const key = v.violation_description.trim().toLowerCase().replace(/\s+/g, ' ');
                        counters[key] = (counters[key] || 0) + 1;
                        repeatById[v.id] = counters[key];
                      });
                      const getColor = (n: number) => {
                        if (n <= 1) return 'bg-success/20 text-success';
                        if (n === 2) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
                        return 'bg-destructive text-destructive-foreground';
                      };
                      const actionColors: Record<string, string> = {
                        warning: 'bg-accent/20 text-accent-foreground',
                        verbal_warning: 'bg-muted text-muted-foreground',
                        deduction: 'bg-primary/20 text-primary',
                        suspension: 'bg-destructive/20 text-destructive',
                        termination: 'bg-destructive text-destructive-foreground',
                      };
                      return empViolations.map((v: any) => {
                        const repeat = repeatById[v.id] || 1;
                        return (
                          <div key={v.id} className={`rounded-lg border p-2 text-sm ${repeat >= 3 ? 'border-destructive bg-destructive/10' : repeat === 2 ? 'border-yellow-500/50 bg-yellow-500/5' : ''}`}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium flex-1">{v.violation_description}</p>
                              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getColor(repeat)}`}>
                                {repeat}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{new Date(v.violation_date).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</span>
                              {v.violation_location && (
                                <span>📍 {v.violation_location}</span>
                              )}
                              <span className={`rounded-full px-2 py-0.5 font-medium ${actionColors[v.action_taken]}`}>
                                {t(v.action_taken as any)}
                              </span>
                              {v.action_taken === 'deduction' && Number(v.deduction_amount) > 0 && (
                                <span>
                                  {t('deductionDays')}: {Number(v.deduction_amount) === 0.5 ? t('halfDay') : `${v.deduction_amount} ${Number(v.deduction_amount) === 1 ? t('day') : t('days')}`}
                                </span>
                              )}
                            </div>
                            {v.notes && <p className="mt-1 text-xs text-muted-foreground">{v.notes}</p>}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
