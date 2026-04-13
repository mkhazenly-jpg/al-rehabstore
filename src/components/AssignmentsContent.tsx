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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Plus, Download, RotateCcw, Trash2, CalendarIcon, AlertTriangle } from 'lucide-react';
import { exportToExcel } from '@/lib/export';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Employee = Tables<'employees'>;
type StockItem = Tables<'stock_items'>;

interface AssignmentLine {
  stock_item_id: string;
  quantity_assigned: number;
  reassign_reason: string;
}

export function AssignmentsContent() {
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [lines, setLines] = useState<AssignmentLine[]>([{ stock_item_id: '', quantity_assigned: 1, reassign_reason: '' }]);
  const [notes, setNotes] = useState('');
  const [assignmentDate, setAssignmentDate] = useState<Date>(new Date());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

  // Track which stock items the selected employee currently has (approved status)
  const employeeActiveItems = useMemo(() => {
    if (!employeeId) return new Set<string>();
    return new Set(
      assignments
        .filter((a: any) => a.employee_id === employeeId && a.status === 'approved')
        .map((a: any) => a.stock_item_id)
    );
  }, [employeeId, assignments]);

  const openDialog = () => {
    setEmployeeId('');
    setLines([{ stock_item_id: '', quantity_assigned: 1, reassign_reason: '' }]);
    setNotes('');
    setAssignmentDate(new Date());
    setError('');
    setDialogOpen(true);
  };

  const updateLine = (index: number, field: keyof AssignmentLine, value: string | number) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const addLine = () => {
    setLines(prev => [...prev, { stock_item_id: '', quantity_assigned: 1, reassign_reason: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    setError('');

    for (const line of lines) {
      if (!line.stock_item_id) continue;
      const stock = stockItems.find(s => s.id === line.stock_item_id);
      if (!stock) return;
      if (line.quantity_assigned > stock.quantity_in_stock) {
        setError(`${t('insufficientStock')}: ${stock.name}`);
        return;
      }
      if (line.quantity_assigned < 1) return;
      // If duplicate, reason is required
      if (employeeActiveItems.has(line.stock_item_id) && !line.reassign_reason) {
        setError(`${t('selectReason')}: ${stock.name}`);
        return;
      }
    }

    const validLines = lines.filter(l => l.stock_item_id);
    if (validLines.length === 0 || !employeeId) return;

    setSaving(true);
    try {
      for (const line of validLines) {
        const reasonNote = line.reassign_reason
          ? `[${line.reassign_reason === 'lost' ? t('lost') : t('damaged')}] ${notes || ''}`
          : (notes || null);

        const { data: assignment } = await supabase.from('assignments').insert({
          employee_id: employeeId,
          stock_item_id: line.stock_item_id,
          quantity_assigned: line.quantity_assigned,
          notes: reasonNote,
          assignment_date: assignmentDate.toISOString(),
        }).select('id').single();

        if (assignment) {
          await supabase.rpc('approve_assignment', { _assignment_id: assignment.id });
        }
      }
      setDialogOpen(false);
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
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

  const getAvailableQty = (stockId: string, currentIndex: number) => {
    const stock = stockItems.find(s => s.id === stockId);
    if (!stock) return 0;
    const usedByOtherLines = lines
      .filter((l, i) => i !== currentIndex && l.stock_item_id === stockId)
      .reduce((sum, l) => sum + l.quantity_assigned, 0);
    return stock.quantity_in_stock - usedByOtherLines;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('assignments')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 me-1" />{t('exportExcel')}
          </Button>
          <Button size="sm" onClick={openDialog}>
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
                    <TableCell>{a.stock_items?.name} {a.stock_items?.size !== 'N/A' ? `(${a.stock_items?.size})` : ''}</TableCell>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('newAssignment')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee select */}
            <div className="space-y-2">
              <Label>{t('employee')}</Label>
              <Select value={employeeId} onValueChange={v => { setEmployeeId(v); setLines(prev => prev.map(l => ({ ...l, reassign_reason: '' }))); }}>
                <SelectTrigger><SelectValue placeholder={t('selectEmployee')} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Assignment date picker */}
            <div className="space-y-2">
              <Label>{t('assignmentDateLabel')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-start font-normal", !assignmentDate && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 me-2" />
                    {assignmentDate ? format(assignmentDate, 'yyyy-MM-dd') : t('assignmentDateLabel')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={assignmentDate}
                    onSelect={d => d && setAssignmentDate(d)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('items')}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-3 w-3 me-1" />{t('addItem')}
                </Button>
              </div>

              {lines.map((line, index) => {
                const available = getAvailableQty(line.stock_item_id, index);
                const isDuplicate = line.stock_item_id && employeeActiveItems.has(line.stock_item_id);
                return (
                  <div key={index} className="flex gap-2 items-start rounded-lg border p-3">
                    <div className="flex-1 space-y-2">
                      <Select value={line.stock_item_id} onValueChange={v => { updateLine(index, 'stock_item_id', v); updateLine(index, 'reassign_reason', ''); }}>
                        <SelectTrigger><SelectValue placeholder={t('selectItem')} /></SelectTrigger>
                        <SelectContent>
                          {stockItems.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} ({s.category}{s.size !== 'N/A' ? ` - ${s.size}` : ''}) - {s.quantity_in_stock}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {isDuplicate && (
                        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                          <div className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{t('alreadyAssigned')}</span>
                          </div>
                          <Select value={line.reassign_reason} onValueChange={v => updateLine(index, 'reassign_reason', v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={t('selectReason')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lost">{t('lost')}</SelectItem>
                              <SelectItem value="damaged">{t('damaged')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {line.stock_item_id && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={available}
                            value={line.quantity_assigned}
                            onChange={e => updateLine(index, 'quantity_assigned', parseInt(e.target.value) || 1)}
                            className="w-20"
                          />
                          <span className="text-xs text-muted-foreground">{t('available')}: {available}</span>
                        </div>
                      )}
                    </div>
                    {lines.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeLine(index)} className="shrink-0 mt-1">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
              <Button
                onClick={handleCreate}
                disabled={!employeeId || lines.every(l => !l.stock_item_id) || saving}
              >
                {t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
