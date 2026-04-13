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
import { Plus, Download, Check, RotateCcw } from 'lucide-react';
import { exportToExcel } from '@/lib/export';
import type { Tables } from '@/integrations/supabase/types';

type Assignment = Tables<'assignments'>;
type Employee = Tables<'employees'>;
type StockItem = Tables<'stock_items'>;

export function AssignmentsContent() {
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', stock_item_id: '', quantity_assigned: 1, notes: '' });
  const [error, setError] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [aRes, eRes, sRes] = await Promise.all([
      supabase.from('assignments').select('*, employees(name), stock_items(name, category, size, quantity_in_stock)').order('created_at', { ascending: false }),
      supabase.from('employees').select('*').eq('status', 'active'),
      supabase.from('stock_items').select('*'),
    ]);
    setAssignments(aRes.data || []);
    setEmployees(eRes.data || []);
    setStockItems(sRes.data || []);
  };

  const handleCreate = async () => {
    setError('');
    const selectedStock = stockItems.find(s => s.id === form.stock_item_id);
    if (!selectedStock) return;
    if (form.quantity_assigned > selectedStock.quantity_in_stock) {
      setError(t('insufficientStock'));
      return;
    }
    if (form.quantity_assigned < 1) return;

    await supabase.from('assignments').insert({
      employee_id: form.employee_id,
      stock_item_id: form.stock_item_id,
      quantity_assigned: form.quantity_assigned,
      notes: form.notes || null,
    });
    setDialogOpen(false);
    loadAll();
  };

  const handleApprove = async (id: string) => {
    await supabase.rpc('approve_assignment', { _assignment_id: id });
    loadAll();
  };

  const handleReturn = async (id: string) => {
    await supabase.rpc('return_assignment', { _assignment_id: id });
    loadAll();
  };

  const handleExport = () => {
    exportToExcel(
      assignments.map((a: any) => ({
        [t('employee')]: a.employees?.name,
        [t('stockItem')]: a.stock_items?.name,
        [t('quantityAssigned')]: a.quantity_assigned,
        [t('status')]: t(a.status as any),
        [t('assignmentDate')]: new Date(a.assignment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'),
        [t('returnDate')]: a.return_date ? new Date(a.return_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-',
      })),
      'assignments'
    );
  };

  const selectedStock = stockItems.find(s => s.id === form.stock_item_id);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('assignments')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 me-1" />{t('exportExcel')}
          </Button>
          <Button size="sm" onClick={() => { setForm({ employee_id: '', stock_item_id: '', quantity_assigned: 1, notes: '' }); setError(''); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 me-1" />{t('newAssignment')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('employee')}</TableHead>
                  <TableHead>{t('stockItem')}</TableHead>
                  <TableHead>{t('quantityAssigned')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('assignmentDate')}</TableHead>
                  <TableHead>{t('returnDate')}</TableHead>
                  {isAdmin && <TableHead>{t('actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.employees?.name}</TableCell>
                    <TableCell>{a.stock_items?.name}</TableCell>
                    <TableCell>{a.quantity_assigned}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        a.status === 'approved' ? 'bg-success/20 text-success' :
                        a.status === 'pending' ? 'bg-accent/20 text-accent-foreground' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {t(a.status as any)}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(a.assignment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</TableCell>
                    <TableCell>{a.return_date ? new Date(a.return_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-'}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          {a.status === 'pending' && (
                            <Button variant="ghost" size="icon" onClick={() => handleApprove(a.id)} title={t('approve')}>
                              <Check className="h-4 w-4 text-success" />
                            </Button>
                          )}
                          {a.status === 'approved' && (
                            <Button variant="ghost" size="icon" onClick={() => handleReturn(a.id)} title={t('return')}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {assignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">-</TableCell>
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
            <DialogTitle>{t('newAssignment')}</DialogTitle>
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
              <Label>{t('stockItem')}</Label>
              <Select value={form.stock_item_id} onValueChange={v => setForm({ ...form, stock_item_id: v })}>
                <SelectTrigger><SelectValue placeholder={t('selectItem')} /></SelectTrigger>
                <SelectContent>
                  {stockItems.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.category}{s.size !== 'N/A' ? ` - ${s.size}` : ''}) - {t('available')}: {s.quantity_in_stock}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedStock && (
              <p className="text-sm text-muted-foreground">{t('available')}: {selectedStock.quantity_in_stock} {selectedStock.unit}</p>
            )}
            <div className="space-y-2">
              <Label>{t('quantityAssigned')}</Label>
              <Input type="number" min={1} max={selectedStock?.quantity_in_stock || 999} value={form.quantity_assigned} onChange={e => setForm({ ...form, quantity_assigned: parseInt(e.target.value) || 1 })} />
            </div>
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
              <Button onClick={handleCreate} disabled={!form.employee_id || !form.stock_item_id}>{t('save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
