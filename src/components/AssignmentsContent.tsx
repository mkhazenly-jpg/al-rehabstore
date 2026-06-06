import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { requestPendingChange, formatSupabaseError, isMasterAdminEmail, notifyPendingQueued } from '@/lib/pending-changes';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { useProfilesMap } from '@/hooks/use-profiles';
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus, Download, RotateCcw, Trash2, CalendarIcon, AlertTriangle, Pencil, Check, ChevronsUpDown, Layers } from 'lucide-react';
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
  const profiles = useProfilesMap();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [lines, setLines] = useState<AssignmentLine[]>([{ stock_item_id: '', quantity_assigned: 1, reassign_reason: '' }]);
  const [notes, setNotes] = useState('');
  const [assignmentDate, setAssignmentDate] = useState<Date>(new Date());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
  const [batchesDialogOpen, setBatchesDialogOpen] = useState(false);
  const [batchesAssignment, setBatchesAssignment] = useState<any>(null);
  const [batchesData, setBatchesData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadAll(); }, []);

  const filteredAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((a: any) => (a.employees?.name || '').toLowerCase().includes(q));
  }, [assignments, searchQuery]);

  const loadAll = async () => {
    const [aRes, eRes, sRes] = await Promise.all([
      supabase.from('assignments').select('*, employees(name, location), stock_items(name, category, size, quantity_in_stock)').order('created_at', { ascending: false }),
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

  // Helper: detect if assignment notes mark it as damaged/lost
  const isDamagedOrLostNote = (notes: string | null | undefined) => {
    if (!notes?.startsWith('[')) return false;
    const n = notes.toLowerCase();
    return n.includes('تالف') || n.includes('damaged') || n.includes('فقدان') || n.includes('مفقود') || n.includes('lost');
  };

  const openDialog = (assignment?: any) => {
    if (assignment) {
      setEditingAssignment(assignment);
      setEmployeeId(assignment.employee_id);
      setLines([{ stock_item_id: assignment.stock_item_id, quantity_assigned: assignment.quantity_assigned, reassign_reason: '' }]);
      setNotes(assignment.notes?.startsWith('[') ? assignment.notes.replace(/^\[.*?\]\s*/, '') : (assignment.notes || ''));
      const parsedDate = new Date(assignment.assignment_date);
      setAssignmentDate(!isNaN(parsedDate.getTime()) ? parsedDate : new Date());
    } else {
      setEditingAssignment(null);
      setEmployeeId('');
      setLines([{ stock_item_id: '', quantity_assigned: 1, reassign_reason: '' }]);
      setNotes('');
      setAssignmentDate(new Date());
    }
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

  const handleSave = async () => {
    if (saving) return;
    setError('');

    if (editingAssignment) {
      const line = lines[0];
      if (!line.stock_item_id || !employeeId) return;
      if (line.quantity_assigned < 1) return;

      setSaving(true);
      try {
        const reasonNote = line.reassign_reason
          ? `[${line.reassign_reason === 'lost' ? t('lost') : t('damaged')}] ${notes || ''}`
          : (notes || null);

        const oldA = editingAssignment;

        // Non-master admins: queue for approval rather than executing.
        const { data: { user: cu } } = await supabase.auth.getUser();
        const { data: prof } = await supabase.from('profiles').select('email').eq('user_id', cu?.id || '').maybeSingle();
        if (!isMasterAdminEmail(prof?.email)) {
          const res = await requestPendingChange({
            table: 'assignments',
            recordId: oldA.id,
            action: 'update',
            payload: {
              employee_id: employeeId,
              stock_item_id: line.stock_item_id,
              quantity_assigned: line.quantity_assigned,
              notes: reasonNote,
              assignment_date: assignmentDate.toISOString(),
            },
            snapshot: { ...oldA },
            description: 'تعديل تسليم',
          });
          if (!res.ok) { setError(res.error || ''); toast.error(res.error || 'Error'); setSaving(false); return; }
          notifyPendingQueued('تعديل التسليم');
          setDialogOpen(false);
          setSaving(false);
          return;
        }

        if (oldA.status === 'approved') {
          const { error: retErr } = await supabase.rpc('return_with_fifo', { _assignment_id: oldA.id });
          if (retErr) { setError(formatSupabaseError(retErr)); toast.error(formatSupabaseError(retErr)); setSaving(false); return; }
        }

        const { error: updErr } = await supabase.from('assignments').update({
          employee_id: employeeId,
          stock_item_id: line.stock_item_id,
          quantity_assigned: line.quantity_assigned,
          notes: reasonNote,
          assignment_date: assignmentDate.toISOString(),
          status: 'pending',
        }).eq('id', oldA.id);

        if (updErr) { setError(formatSupabaseError(updErr)); toast.error(formatSupabaseError(updErr)); setSaving(false); return; }

        const { error: appErr } = await supabase.rpc('assign_with_fifo', { _assignment_id: oldA.id });
        if (appErr) { setError(formatSupabaseError(appErr)); toast.error(formatSupabaseError(appErr)); setSaving(false); return; }

        setDialogOpen(false);
        await loadAll();
      } catch (e) {
        const msg = formatSupabaseError(e);
        setError(msg);
        toast.error(msg);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Create mode
    for (const line of lines) {
      if (!line.stock_item_id) continue;
      const stock = stockItems.find(s => s.id === line.stock_item_id);
      if (!stock) return;
      if (line.quantity_assigned > stock.quantity_in_stock) {
        setError(`${t('insufficientStock')}: ${stock.name}`);
        return;
      }
      if (line.quantity_assigned < 1) return;
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
        // Auto-replace: when the new assignment is a replacement (reassign_reason set
        // to damaged/lost), mark ALL existing approved assignments for the same
        // employee+item as replaced. Also keep the legacy behavior of detecting
        // damaged/lost markers in the OLD notes for backward compatibility.
        const oldDamagedLost = assignments.filter((a: any) =>
          a.employee_id === employeeId &&
          a.stock_item_id === line.stock_item_id &&
          a.status === 'approved' &&
          (line.reassign_reason === 'damaged' || line.reassign_reason === 'lost' || isDamagedOrLostNote(a.notes))
        );

        const replacementMarker = line.reassign_reason
          ? (line.reassign_reason === 'lost' ? t('lost') : t('damaged'))
          : '';

        for (const oldA of oldDamagedLost) {
          // Mark as replaced WITHOUT returning the quantity to stock,
          // because the item was actually damaged/lost (not physically returned).
          const { error: replErr } = await supabase.rpc('mark_as_replaced' as any, { _assignment_id: oldA.id });
          if (replErr) { setError(replErr.message); setSaving(false); return; }
          if (replacementMarker) {
            const oldNoteText = oldA.notes?.startsWith('[') ? oldA.notes.replace(/^\[.*?\]\s*/, '') : (oldA.notes || '');
            const { error: noteErr } = await supabase.from('assignments').update({
              notes: `[${replacementMarker}] ${oldNoteText || notes || ''}`,
            }).eq('id', oldA.id);
            if (noteErr) { setError(noteErr.message); setSaving(false); return; }
          }
        }

        const reasonNote = line.reassign_reason
          ? `[${line.reassign_reason === 'lost' ? t('lost') : t('damaged')}] ${notes || ''}`
          : (notes || null);

        const { data: { user: currentUser } } = await supabase.auth.getUser();

        // Inserts are applied directly without approval
        const { data: assignment, error: insertErr } = await supabase.from('assignments').insert({
          employee_id: employeeId,
          stock_item_id: line.stock_item_id,
          quantity_assigned: line.quantity_assigned,
          notes: reasonNote,
          assignment_date: assignmentDate.toISOString(),
          created_by: currentUser?.id ?? null,
        } as any).select('id').single();

        if (insertErr) {
          setError(insertErr.message);
          setSaving(false);
          return;
        }

        if (assignment) {
          const { error: approveErr } = await supabase.rpc('assign_with_fifo', { _assignment_id: assignment.id });
          if (approveErr) {
            setError(approveErr.message);
            setSaving(false);
            return;
          }
        }
      }
      toast.success(lang === 'ar' ? 'تم التسليم بنجاح' : 'Delivered successfully');
      setDialogOpen(false);
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async (id: string) => {
    await supabase.rpc('return_with_fifo', { _assignment_id: id });
    loadAll();
  };

  const openBatches = async (a: any) => {
    setBatchesAssignment(a);
    setBatchesDialogOpen(true);
    const { data } = await supabase
      .from('assignment_batches' as any)
      .select('*, stock_additions(added_at)')
      .eq('assignment_id', a.id)
      .order('created_at', { ascending: true });
    setBatchesData((data as any[]) || []);
  };

  const getReasonFromNotes = (notes: string | null) => {
    if (!notes?.startsWith('[')) return '-';
    if (notes.includes(t('lost'))) return t('lost');
    if (notes.includes(t('damaged'))) return t('damaged');
    return '-';
  };

  const handleExport = () => {
    exportToExcel(
      assignments.map((a: any) => {
        const price = a.unit_price_at_assignment || 0;
        return {
          [t('employee')]: a.employees?.name,
          [t('location')]: a.employees?.location || '-',
          [t('stockItem')]: a.stock_items?.name,
          [t('quantityAssigned')]: a.quantity_assigned,
          [t('priceAtAssignment')]: price,
          [t('totalPrice')]: price * a.quantity_assigned,
          [t('status')]: t(a.status as any),
          [t('assignmentDate')]: new Date(a.assignment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'),
          [t('reassignReason')]: getReasonFromNotes(a.notes),
          [t('returnDate')]: a.return_date ? new Date(a.return_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-',
        };
      }),
      'assignments'
    );
  };

  const handleDelete = async (assignment: any) => {
    try {
      const { data: { user: cu } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from('profiles').select('email').eq('user_id', cu?.id || '').maybeSingle();
      if (!isMasterAdminEmail(prof?.email)) {
        const res = await requestPendingChange({
          table: 'assignments',
          recordId: assignment.id,
          action: 'delete',
          snapshot: { quantity_assigned: assignment.quantity_assigned, status: assignment.status },
          description: 'حذف تسليم',
        });
        if (!res.ok) { toast.error(res.error || 'Error'); return; }
        notifyPendingQueued('حذف التسليم');
        setDeleteConfirmId(null);
        return;
      }
      if (assignment.status === 'approved') {
        const { error: retErr } = await supabase.rpc('return_with_fifo', { _assignment_id: assignment.id });
        if (retErr) { toast.error(formatSupabaseError(retErr)); return; }
      }
      const { error: delErr } = await supabase.from('assignments').delete().eq('id', assignment.id);
      if (delErr) { toast.error(formatSupabaseError(delErr)); return; }
      toast.success('تم الحذف');
      setDeleteConfirmId(null);
      await loadAll();
    } catch (e) {
      toast.error(formatSupabaseError(e));
    }
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
          <Button size="sm" onClick={() => openDialog()}>
            <Plus className="h-4 w-4 me-1" />{t('newAssignment')}
          </Button>
      </div>

      <Input
        placeholder={t('searchEmployee')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('employee')}</TableHead>
                  <TableHead>{t('location')}</TableHead>
                  <TableHead>{t('stockItem')}</TableHead>
                  <TableHead>{t('quantityAssigned')}</TableHead>
                  <TableHead>{t('priceAtAssignment')}</TableHead>
                  <TableHead>{t('totalPrice')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('assignmentDate')}</TableHead>
                  <TableHead>{t('reassignReason')}</TableHead>
                  <TableHead>{t('returnDate')}</TableHead>
                  <TableHead>{t('createdBy')}</TableHead>
                  {isAdmin && <TableHead>{t('actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.employees?.name}</TableCell>
                    <TableCell>
                      {a.employees?.location ? (
                        <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs font-semibold">{a.employees.location}</span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{a.stock_items?.name} {a.stock_items?.size !== 'N/A' ? `(${a.stock_items?.size})` : ''}</TableCell>
                    <TableCell>{a.quantity_assigned}</TableCell>
                    <TableCell>{a.unit_price_at_assignment > 0 ? `${a.unit_price_at_assignment} ${t('currency')}` : '-'}</TableCell>
                    <TableCell>{a.unit_price_at_assignment > 0 ? `${a.unit_price_at_assignment * a.quantity_assigned} ${t('currency')}` : '-'}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        a.status === 'approved' ? 'bg-success/20 text-success' :
                        a.status === 'pending' ? 'bg-accent/20 text-accent-foreground' :
                        a.status === 'replaced' ? 'bg-primary/20 text-primary' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {t(a.status as any)}
                      </span>
                    </TableCell>
                    <TableCell>{a.assignment_date && !isNaN(new Date(a.assignment_date).getTime()) ? new Date(a.assignment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-'}</TableCell>
                    <TableCell>
                      {a.notes?.startsWith('[') ? (
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                          a.notes.includes(t('lost')) ? 'bg-destructive/20 text-destructive' : 'bg-amber-500/20 text-amber-600'
                        }`}>
                          {a.notes.includes(t('lost')) ? t('lost') : a.notes.includes(t('damaged')) ? t('damaged') : '-'}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{a.return_date && !isNaN(new Date(a.return_date).getTime()) ? new Date(a.return_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-'}</TableCell>
                    <TableCell className="text-xs">{a.created_by ? (profiles[a.created_by] || '-') : '-'}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          {(a.status === 'approved' || a.status === 'returned' || a.status === 'replaced') && (
                            <Button variant="ghost" size="icon" onClick={() => openBatches(a)} title={t('batchDetails')}>
                              <Layers className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => openDialog(a)} title={t('edit')}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {a.status === 'approved' && (
                            <Button variant="ghost" size="icon" onClick={() => handleReturn(a.id)} title={t('return')}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(a.id)} title={t('delete')}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {filteredAssignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">-</TableCell>
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
            <DialogTitle>{editingAssignment ? t('edit') : t('newAssignment')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee select */}
            <div className="space-y-2">
              <Label>{t('employee')}</Label>
              <Popover open={employeePopoverOpen} onOpenChange={setEmployeePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn("w-full justify-between font-normal", !employeeId && "text-muted-foreground")}
                  >
                    {employeeId
                      ? employees.find(e => e.id === employeeId)?.name
                      : t('selectEmployee')}
                    <ChevronsUpDown className="h-4 w-4 opacity-50 ms-2 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t('searchEmployee')} />
                    <CommandList>
                      <CommandEmpty>{t('noEmployeeFound')}</CommandEmpty>
                      <CommandGroup>
                        {employees.map(e => (
                          <CommandItem
                            key={e.id}
                            value={`${e.name} ${(e as any).location || ''}`}
                            onSelect={() => {
                              setEmployeeId(e.id);
                              setLines(prev => prev.map(l => ({ ...l, reassign_reason: '' })));
                              setEmployeePopoverOpen(false);
                            }}
                          >
                            <Check className={cn("h-4 w-4 me-2", employeeId === e.id ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1">{e.name}</span>
                            {(e as any).location && (
                              <span className="ms-2 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs font-semibold">
                                {(e as any).location}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {employeeId && (() => {
                const emp = employees.find(e => e.id === employeeId) as any;
                if (!emp?.location) return null;
                return (
                  <div className="flex items-center gap-2 rounded-md border bg-primary/5 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t('employeeLocation')}:</span>
                    <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs font-semibold">{emp.location}</span>
                  </div>
                );
              })()}
            </div>

            {/* Assignment date picker */}
            <div className="space-y-2">
              <Label>{t('assignmentDateLabel')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-start font-normal", !assignmentDate && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 me-2" />
                    {assignmentDate && !isNaN(assignmentDate.getTime()) ? format(assignmentDate, 'yyyy-MM-dd') : t('assignmentDateLabel')}
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
                {!editingAssignment && (
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="h-3 w-3 me-1" />{t('addItem')}
                  </Button>
                )}
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
                          {(() => {
                            const emp = employees.find(e => e.id === employeeId) as any;
                            const empLoc = emp?.location;
                            const filtered = empLoc
                              ? stockItems.filter(s => (s as any).location === empLoc)
                              : stockItems;
                            return filtered.map(s => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name} ({s.category}{s.size !== 'N/A' ? ` - ${s.size}` : ''}){(s as any).location ? ` - ${(s as any).location}` : ''}
                              </SelectItem>
                            ));
                          })()}
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
                onClick={handleSave}
                disabled={!employeeId || lines.every(l => !l.stock_item_id) || saving}
              >
                {t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('confirm')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('delete')}?</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>{t('cancel')}</Button>
            <Button variant="destructive" onClick={() => {
              const a = assignments.find((x: any) => x.id === deleteConfirmId);
              if (a) handleDelete(a);
            }}>{t('delete')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* FIFO batch breakdown dialog */}
      <Dialog open={batchesDialogOpen} onOpenChange={setBatchesDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t('batchDetails')} - {batchesAssignment?.employees?.name} / {batchesAssignment?.stock_items?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pulledFromBatch')}</TableHead>
                  <TableHead>{t('quantity')}</TableHead>
                  <TableHead>{t('unitPrice')}</TableHead>
                  <TableHead>{t('totalPrice')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchesData.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      {b.stock_additions?.added_at
                        ? new Date(b.stock_additions.added_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')
                        : '-'}
                    </TableCell>
                    <TableCell className="font-medium">{b.quantity}</TableCell>
                    <TableCell>{b.unit_price > 0 ? `${b.unit_price} ${t('currency')}` : '-'}</TableCell>
                    <TableCell>{b.unit_price > 0 ? `${(b.unit_price * b.quantity).toFixed(2)} ${t('currency')}` : '-'}</TableCell>
                  </TableRow>
                ))}
                {batchesData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {batchesData.length > 0 && (
            <div className="mt-3 space-y-1 p-3 rounded-lg bg-muted text-sm">
              <div className="flex justify-between font-medium">
                <span>{t('totalPrice')}</span>
                <span>{batchesData.reduce((s, b) => s + (b.unit_price * b.quantity), 0).toFixed(2)} {t('currency')}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>{t('weightedAverage')}</span>
                <span>{batchesAssignment?.unit_price_at_assignment > 0 ? `${Number(batchesAssignment.unit_price_at_assignment).toFixed(2)} ${t('currency')}` : '-'}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
