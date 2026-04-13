import { useEffect, useState } from 'react';
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
import { Plus, Pencil, Trash2, Download, Search, Eye } from 'lucide-react';
import { exportToExcel } from '@/lib/export';
import type { Tables } from '@/integrations/supabase/types';

type Employee = Tables<'employees'>;

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-success/20 text-success',
  resigned: 'bg-accent/20 text-accent-foreground',
  terminated: 'bg-destructive/20 text-destructive',
};

export function EmployeesContent() {
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [editItem, setEditItem] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: '', hire_date: '', status: 'active' as 'active' | 'resigned' | 'terminated', termination_date: '', department: '', notes: '' });

  useEffect(() => { loadEmployees(); }, []);

  const loadEmployees = async () => {
    const { data } = await supabase.from('employees').select('*').order('created_at', { ascending: false });
    setEmployees(data || []);
  };

  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => {
    setEditItem(null);
    setForm({ name: '', hire_date: new Date().toISOString().split('T')[0], status: 'active', termination_date: '', department: '', notes: '' });
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
    });
    setDialogOpen(true);
  };

  const viewDetails = async (emp: Employee) => {
    setSelectedEmployee(emp);
    const { data } = await supabase
      .from('assignments')
      .select('*, stock_items(name, category, size)')
      .eq('employee_id', emp.id)
      .order('assignment_date', { ascending: false });
    setAssignments(data || []);
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
    };
    if (editItem) {
      await supabase.from('employees').update(payload).eq('id', editItem.id);
    } else {
      await supabase.from('employees').insert(payload);
    }
    setDialogOpen(false);
    loadEmployees();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('employees').delete().eq('id', id);
    loadEmployees();
  };

  const handleExport = () => {
    exportToExcel(
      filtered.map(e => ({
        [t('name')]: e.name,
        [t('status')]: t(e.status as any),
        [t('hireDate')]: e.hire_date,
        [t('department')]: e.department || '-',
        [t('notes')]: e.notes || '-',
      })),
      'employees'
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('employees')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 me-1" />{t('exportExcel')}
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 me-1" />{t('addEmployee')}
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="ps-9" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('hireDate')}</TableHead>
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
                    <TableCell>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[emp.status]}`}>
                        {t(emp.status as any)}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(emp.hire_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</TableCell>
                    <TableCell>{emp.department || '-'}</TableCell>
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
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
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
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">{t('assignmentHistory')}</h3>
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">-</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {assignments.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                        <div>
                          <p className="font-medium">{a.stock_items?.name} ({a.stock_items?.category})</p>
                          <p className="text-xs text-muted-foreground">
                            {t('quantity')}: {a.quantity_assigned} • {new Date(a.assignment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.status === 'approved' ? 'bg-success/20 text-success' :
                          a.status === 'pending' ? 'bg-accent/20 text-accent-foreground' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {t(a.status as any)}
                        </span>
                      </div>
                    ))}
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
