import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDown, Wallet } from 'lucide-react';
import { exportToExcel } from '@/lib/export';
import { toast } from 'sonner';

type AssignmentRow = {
  status: string;
  notes: string | null;
  stock_item_id: string;
  employee_id: string;
  quantity_assigned: number;
  assignment_date: string;
  return_date: string | null;
  unit_price_at_assignment: number;
  employees: { name: string; location: string | null; status: string; termination_date: string | null } | null;
  stock_items: { name: string; unit_price: number; category: string } | null;
};

const getRenewalMonths = (combined: string): number | null => {
  const c = combined.toLowerCase();
  if (/shoe|حذاء|بوت|boot|سيفتي|safety/.test(c)) return 12;
  if (/glove|جوانتي|قفاز|vest|فيست|سترة|helmet|خوذة/.test(c)) return 4;
  return null;
};

export function AssignmentDeductionsContent() {
  const { t, lang } = useLanguage();
  const [approved, setApproved] = useState<AssignmentRow[]>([]);
  const [replacedLost, setReplacedLost] = useState<AssignmentRow[]>([]);
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | 'regular' | 'lost'>('all');

  useEffect(() => {
    (async () => {
      const [aRes, rRes] = await Promise.all([
        supabase
          .from('assignments')
          .select('status, notes, stock_item_id, employee_id, quantity_assigned, assignment_date, return_date, unit_price_at_assignment, employees(name, location, status, termination_date), stock_items(name, unit_price, category)')
          .eq('status', 'approved'),
        supabase
          .from('assignments')
          .select('status, notes, stock_item_id, employee_id, quantity_assigned, assignment_date, return_date, unit_price_at_assignment, employees(name, location, status, termination_date), stock_items(name, unit_price, category)')
          .not('notes', 'is', null),
      ]);
      setApproved((aRes.data as unknown as AssignmentRow[]) || []);
      setReplacedLost((rRes.data as unknown as AssignmentRow[]) || []);
    })();
  }, []);

  const locations = useMemo(() => {
    const s = new Set<string>();
    [...approved, ...replacedLost].forEach((a) => { if (a.employees?.location) s.add(a.employees.location); });
    return Array.from(s).sort();
  }, [approved, replacedLost]);

  const availableYears = useMemo(() => {
    const s = new Set<number>();
    const now = new Date().getFullYear();
    for (let i = 0; i < 5; i++) s.add(now - i);
    [...approved, ...replacedLost].forEach((a) => {
      const d = a.return_date || a.assignment_date;
      if (d) s.add(new Date(d).getFullYear());
    });
    return Array.from(s).sort((a, b) => b - a);
  }, [approved, replacedLost]);

  const monthNames: Record<string, string> = {
    '0': t('january'), '1': t('february'), '2': t('march'), '3': t('april'),
    '4': t('may'), '5': t('june'), '6': t('july'), '7': t('august'),
    '8': t('september'), '9': t('october'), '10': t('november'), '11': t('december'),
  };

  const regularRows = useMemo(() => {
    const inactive = new Set(['resigned', 'terminated', 'archived']);
    const rows: Array<{
      key: string; type: 'regular'; employeeName: string; location: string; itemName: string; category: string;
      quantity: number; unitPrice: number; deduction: number; daysElapsed: number; daysRemaining: number; refDate: string;
    }> = [];
    approved.forEach((a, idx) => {
      const emp = a.employees;
      if (!emp || !inactive.has(emp.status)) return;
      if (selectedLocation !== 'all' && emp.location !== selectedLocation) return;
      const refDate = emp.termination_date ? new Date(emp.termination_date) : new Date(a.assignment_date);
      if (selectedYear !== 'all' && refDate.getFullYear() !== Number(selectedYear)) return;
      if (selectedMonth !== 'all' && refDate.getMonth() !== Number(selectedMonth)) return;
      const months = getRenewalMonths(`${a.stock_items?.name || ''} ${a.stock_items?.category || ''}`);
      if (months === null) return;
      const msInDay = 1000 * 60 * 60 * 24;
      const daysElapsed = Math.floor((Date.now() - new Date(a.assignment_date).getTime()) / msInDay);
      const totalDays = Math.round(months * 30.4375);
      if (daysElapsed >= totalDays) return;
      const daysRemaining = Math.max(0, totalDays - daysElapsed);
      const unitPrice = Number(a.unit_price_at_assignment) || Number(a.stock_items?.unit_price) || 0;
      const qty = a.quantity_assigned || 0;
      rows.push({
        key: `r-${a.employee_id}-${a.stock_item_id}-${idx}`,
        type: 'regular',
        employeeName: emp.name || '—',
        location: emp.location || '—',
        itemName: a.stock_items?.name || '—',
        category: a.stock_items?.category || '',
        quantity: qty,
        unitPrice,
        deduction: unitPrice * qty,
        daysElapsed,
        daysRemaining,
        refDate: a.assignment_date,
      });
    });
    return rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [approved, selectedLocation, selectedYear, selectedMonth]);

  const lostRows = useMemo(() => {
    const lostKeys = new Set(
      replacedLost
        .filter((r) => {
          if (r.status !== 'approved') return false;
          const n = (r.notes || '').toLowerCase();
          return n.includes('فقدان') || n.includes('مفقود') || n.includes('lost');
        })
        .map((r) => `${r.employee_id}-${r.stock_item_id}`)
    );
    const rows: Array<{
      key: string; type: 'lost'; employeeName: string; location: string; itemName: string; category: string;
      quantity: number; unitPrice: number; deduction: number; refDate: string;
    }> = [];
    replacedLost.forEach((a, idx) => {
      if (a.status !== 'replaced') return;
      const n = (a.notes || '').toLowerCase();
      const isLost = n.includes('فقدان') || n.includes('مفقود') || n.includes('lost') || lostKeys.has(`${a.employee_id}-${a.stock_item_id}`);
      if (!isLost) return;
      if (selectedLocation !== 'all' && a.employees?.location !== selectedLocation) return;
      const refDate = new Date(a.return_date || a.assignment_date);
      if (selectedYear !== 'all' && refDate.getFullYear() !== Number(selectedYear)) return;
      if (selectedMonth !== 'all' && refDate.getMonth() !== Number(selectedMonth)) return;
      const unitPrice = Number(a.unit_price_at_assignment) || Number(a.stock_items?.unit_price) || 0;
      const qty = a.quantity_assigned || 0;
      rows.push({
        key: `l-${a.employee_id}-${a.stock_item_id}-${idx}`,
        type: 'lost',
        employeeName: a.employees?.name || '—',
        location: a.employees?.location || '—',
        itemName: a.stock_items?.name || '—',
        category: a.stock_items?.category || '',
        quantity: qty,
        unitPrice,
        deduction: unitPrice * qty,
        refDate: a.return_date || a.assignment_date,
      });
    });
    return rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [replacedLost, selectedLocation, selectedYear, selectedMonth]);

  const visibleRows = useMemo(() => {
    if (selectedType === 'regular') return regularRows;
    if (selectedType === 'lost') return lostRows;
    return [...regularRows, ...lostRows].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [regularRows, lostRows, selectedType]);

  const grandTotal = useMemo(() => visibleRows.reduce((s, r) => s + r.deduction, 0), [visibleRows]);

  const handleExport = () => {
    if (visibleRows.length === 0) {
      toast.error(t('noDeductions'));
      return;
    }
    const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
    const data = visibleRows.map((r) => ({
      [t('employee')]: r.employeeName,
      [t('location')]: r.location,
      [t('item')]: r.itemName,
      [t('category')]: r.category,
      [t('deductionType')]: r.type === 'lost' ? t('lostDeduction') : t('regularDeduction'),
      [t('quantity')]: r.quantity,
      [t('unitPrice')]: r.unitPrice,
      [t('deductionValue')]: r.deduction,
      [r.type === 'lost' ? t('lostDate') : t('assignmentDate')]: new Date(r.refDate).toLocaleDateString(locale),
    }));
    const stamp = new Date().toISOString().split('T')[0];
    exportToExcel(data, `assignment-deductions-${stamp}`);
    toast.success(t('backupSuccess'));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-amber-600" />
          <h1 className="text-2xl font-bold">{t('assignmentDeductionsPageTitle')}</h1>
        </div>
        <Button onClick={handleExport} className="gap-2">
          <FileDown className="h-4 w-4" />
          {t('exportSheet')}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{t('assignmentDeductionsPageDesc')}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); if (v === 'all') setSelectedMonth('all'); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === 'ar' ? 'كل السنوات' : 'All years'}</SelectItem>
                {availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={selectedYear === 'all'}>
              <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'الشهر' : 'Month'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === 'ar' ? 'كل الشهور' : 'All months'}</SelectItem>
                {Object.entries(monthNames).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allLocations')}</SelectItem>
                {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedType} onValueChange={(v) => setSelectedType(v as 'all' | 'regular' | 'lost')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === 'ar' ? 'كل الأنواع' : 'All types'}</SelectItem>
                <SelectItem value="regular">{t('regularDeduction')}</SelectItem>
                <SelectItem value="lost">{t('lostDeduction')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-auto">
          {visibleRows.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">{t('noDeductions')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('employee')}</TableHead>
                  <TableHead>{t('location')}</TableHead>
                  <TableHead>{t('item')}</TableHead>
                  <TableHead>{t('deductionType')}</TableHead>
                  <TableHead className="text-center">{t('quantity')}</TableHead>
                  <TableHead className="text-end">{t('unitPrice')}</TableHead>
                  <TableHead className="text-end">{t('deductionValue')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((r) => (
                  <TableRow key={r.key} className={r.type === 'lost' ? 'bg-rose-50/60' : ''}>
                    <TableCell className="font-medium">{r.employeeName}</TableCell>
                    <TableCell>{r.location}</TableCell>
                    <TableCell>{r.itemName}</TableCell>
                    <TableCell>
                      <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${r.type === 'lost' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                        {r.type === 'lost' ? t('lostDeduction') : t('regularDeduction')}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{r.quantity}</TableCell>
                    <TableCell className="text-end">{r.unitPrice.toLocaleString()} {t('currency')}</TableCell>
                    <TableCell className="text-end font-bold text-amber-700">{r.deduction.toLocaleString()} {t('currency')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {visibleRows.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-amber-950">{t('grandTotal')}</span>
          <span className="font-bold text-xl text-amber-700">{grandTotal.toLocaleString()} {t('currency')}</span>
        </div>
      )}
    </div>
  );
}
