import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Users, ClipboardList, BarChart3, Eye } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const PIE_COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

export function DashboardContent() {
  const { t, lang } = useLanguage();
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [additions, setAdditions] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [damagedLostAssignments, setDamagedLostAssignments] = useState<any[]>([]);
  const [allApprovedAssignments, setAllApprovedAssignments] = useState<any[]>([]);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [attritionUseLocation, setAttritionUseLocation] = useState<boolean>(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    const [stockRes, empRes, assignRes, additionsRes, allAssignRes, damagedLostRes, approvedAssignRes] = await Promise.all([
      supabase.from('stock_items').select('*'),
      supabase.from('employees').select('status, location, hire_date, termination_date'),
      supabase.from('assignments').select('status, stock_item_id, quantity_assigned, created_at, employee_id, employees(location)'),
      supabase.from('stock_additions').select('*'),
      supabase.from('assignments').select('stock_item_id, quantity_assigned, status, created_at, employee_id, employees(location)').in('status', ['approved', 'pending']),
      supabase.from('assignments').select('stock_item_id, quantity_assigned, notes, created_at, status, employee_id, employees(location)').not('notes', 'is', null),
      supabase.from('assignments').select('stock_item_id, quantity_assigned, status, assignment_date, employee_id, unit_price_at_assignment, employees(name, location, status, termination_date), stock_items(name, unit_price, category)').eq('status', 'approved'),
    ]);

    const items = stockRes.data || [];
    const employees = empRes.data || [];

    setAllEmployees(employees);
    setStockItems(items);
    setAdditions(additionsRes.data || []);
    setAssignments(allAssignRes.data || []);
    setDamagedLostAssignments(damagedLostRes.data || []);
    setAllApprovedAssignments(approvedAssignRes.data || []);
  };

  const stats = useMemo(() => {
    const filteredEmployees = allEmployees.filter((e: any) => selectedLocation === 'all' || e.location === selectedLocation);
    const pending = assignments.filter((a: any) => a.status === 'pending' && (selectedLocation === 'all' || a.employees?.location === selectedLocation));
    return {
      totalStock: stockItems.length,
      totalEmployees: filteredEmployees.length,
      pendingAssignments: pending.length,
    };
  }, [allEmployees, stockItems, assignments, selectedLocation]);

  // Get available years from additions
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    additions.forEach(a => years.add(new Date(a.added_at).getFullYear()));
    assignments.forEach(a => years.add(new Date(a.created_at).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [additions, assignments]);

  const monthNames: Record<string, string> = {
    '0': t('january'), '1': t('february'), '2': t('march'), '3': t('april'),
    '4': t('may'), '5': t('june'), '6': t('july'), '7': t('august'),
    '8': t('september'), '9': t('october'), '10': t('november'), '11': t('december'),
  };

  // Filter additions and assignments by selected date
  const filteredAdditions = useMemo(() => {
    return additions.filter(a => {
      const d = new Date(a.added_at);
      if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return false;
      if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return false;
      return true;
    });
  }, [additions, selectedYear, selectedMonth]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      const d = new Date(a.created_at);
      if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return false;
      if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return false;
      if (selectedLocation !== 'all' && a.employees?.location !== selectedLocation) return false;
      return true;
    });
  }, [assignments, selectedYear, selectedMonth, selectedLocation]);

  // Filter damaged/lost assignments by date
  const filteredDamagedLost = useMemo(() => {
    return damagedLostAssignments.filter(a => {
      const d = new Date(a.created_at);
      if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return false;
      if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return false;
      if (selectedLocation !== 'all' && a.employees?.location !== selectedLocation) return false;
      return true;
    });
  }, [damagedLostAssignments, selectedYear, selectedMonth, selectedLocation]);

  // Filter approved assignments by date and calculate renewal needed
  const filteredApprovedAssignments = useMemo(() => {
    return allApprovedAssignments.filter(a => {
      const d = new Date(a.assignment_date);
      if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return false;
      if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return false;
      if (selectedLocation !== 'all' && a.employees?.location !== selectedLocation) return false;
      return true;
    });
  }, [allApprovedAssignments, selectedYear, selectedMonth, selectedLocation]);

  // Helper: detect renewal window (months) per item
  const getRenewalMonths = (item: any): number | null => {
    if (!item) return null;
    const combined = (item.name + ' ' + item.category).toLowerCase();
    const isShoes = /shoe|حذاء|بوت|boot|سيفتي|safety/.test(combined);
    const isGlovesOrVest = /glove|جوانتي|قفاز|vest|فيست|سترة|helmet|خوذة/.test(combined);
    if (isShoes) return 12;
    if (isGlovesOrVest) return 4;
    return null;
  };

  // Calculate renewal needed by item (safety shoes: 12 months, gloves/vests: 4 months)
  const renewalNeededByItem: Record<string, number> = {};
  filteredApprovedAssignments.forEach(a => {
    const item = stockItems.find(i => i.id === a.stock_item_id);
    const months = getRenewalMonths(item);
    if (months === null) return;
    const monthsElapsed = (Date.now() - new Date(a.assignment_date).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
    if (monthsElapsed >= months) {
      renewalNeededByItem[a.stock_item_id] = (renewalNeededByItem[a.stock_item_id] || 0) + a.quantity_assigned;
    }
  });

  const deductionRows = useMemo(() => {
    const inactiveStatuses = new Set(['resigned', 'terminated', 'archived']);
    const rows: Array<{
      key: string;
      employeeName: string;
      itemName: string;
      category: string;
      quantity: number;
      unitPrice: number;
      deduction: number;
      daysElapsed: number;
      daysRemaining: number;
      assignmentDate: string;
    }> = [];

    allApprovedAssignments.forEach((a: any, idx: number) => {
      const emp = a.employees;
      if (!emp || !inactiveStatuses.has(emp.status)) return;
      if (selectedLocation !== 'all' && emp.location !== selectedLocation) return;

      const refDate = emp.termination_date ? new Date(emp.termination_date) : new Date(a.assignment_date);
      if (selectedYear !== 'all' && refDate.getFullYear() !== Number(selectedYear)) return;
      if (selectedMonth !== 'all' && refDate.getMonth() !== Number(selectedMonth)) return;

      const item = stockItems.find(i => i.id === a.stock_item_id);
      const months = getRenewalMonths(item || a.stock_items);
      if (months === null) return;

      const msInDay = 1000 * 60 * 60 * 24;
      const daysElapsed = Math.floor((Date.now() - new Date(a.assignment_date).getTime()) / msInDay);
      const totalWindowDays = Math.round(months * 30.4375);
      if (daysElapsed >= totalWindowDays) return; // expired → no deduction

      const daysRemaining = Math.max(0, totalWindowDays - daysElapsed);
      const unitPrice = Number(a.unit_price_at_assignment) || Number(a.stock_items?.unit_price) || Number(item?.unit_price) || 0;
      const qty = a.quantity_assigned || 0;
      const deduction = unitPrice * qty;

      rows.push({
        key: `${a.employee_id}-${a.stock_item_id}-${idx}`,
        employeeName: emp.name || '—',
        itemName: a.stock_items?.name || item?.name || '—',
        category: a.stock_items?.category || item?.category || '',
        quantity: qty,
        unitPrice,
        deduction,
        daysElapsed,
        daysRemaining,
        assignmentDate: a.assignment_date,
      });
    });

    rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return rows;
  }, [allApprovedAssignments, stockItems, selectedYear, selectedMonth, selectedLocation]);

  const totalAssignmentDeductions = useMemo(
    () => deductionRows.reduce((sum, r) => sum + r.deduction, 0),
    [deductionRows]
  );
  const totalDeductionDays = useMemo(
    () => deductionRows.reduce((sum, r) => sum + r.daysRemaining, 0),
    [deductionRows]
  );

  const [deductionsOpen, setDeductionsOpen] = useState(false);

  // Attrition rate calculation
  // Formula: (terminations in period / average headcount in period) * 100
  // Period is determined by selectedYear + selectedMonth filters.
  // When "all time" is selected we fall back to the trailing 12 months ending today.
  const attrition = useMemo(() => {
    const effectiveLocation = attritionUseLocation ? selectedLocation : 'all';
    const filteredEmployees = allEmployees.filter((e: any) =>
      effectiveLocation === 'all' || e.location === effectiveLocation
    );

    let periodStart: Date;
    let periodEnd: Date;
    let label: string;

    if (selectedYear === 'all') {
      periodEnd = new Date();
      periodStart = new Date();
      periodStart.setFullYear(periodEnd.getFullYear() - 1);
      label = t('attritionTrailing12');
    } else if (selectedMonth === 'all') {
      const y = Number(selectedYear);
      periodStart = new Date(y, 0, 1);
      periodEnd = new Date(y, 11, 31, 23, 59, 59);
      label = `${y}`;
    } else {
      const y = Number(selectedYear);
      const m = Number(selectedMonth);
      periodStart = new Date(y, m, 1);
      periodEnd = new Date(y, m + 1, 0, 23, 59, 59);
      label = `${monthNames[String(m)]} ${y}`;
    }

    const startMs = periodStart.getTime();
    const endMs = periodEnd.getTime();

    // Headcount at a given date = hired on/before date AND not terminated before/on date
    const headcountAt = (date: Date) => {
      const ms = date.getTime();
      return filteredEmployees.filter((e: any) => {
        const hireMs = e.hire_date ? new Date(e.hire_date).getTime() : null;
        const termMs = e.termination_date ? new Date(e.termination_date).getTime() : null;
        if (hireMs === null || hireMs > ms) return false;
        if (termMs !== null && termMs <= ms) return false;
        return true;
      }).length;
    };

    const startHeadcount = headcountAt(periodStart);
    const endHeadcount = headcountAt(periodEnd);
    const avgHeadcount = (startHeadcount + endHeadcount) / 2;

    const terminations = filteredEmployees.filter((e: any) => {
      if (!e.termination_date) return false;
      const t = new Date(e.termination_date).getTime();
      return t >= startMs && t <= endMs;
    }).length;

    const rate = avgHeadcount > 0 ? (terminations / avgHeadcount) * 100 : 0;

    return {
      rate,
      terminations,
      avgHeadcount,
      startHeadcount,
      endHeadcount,
      label,
    };
  }, [allEmployees, selectedYear, selectedMonth, selectedLocation, attritionUseLocation, monthNames, t]);

  const attritionTone = attrition.rate < 10
    ? { bg: 'from-success to-success/70', fg: 'text-primary-foreground', sub: 'text-primary-foreground/80', badge: t('attritionExcellent') }
    : attrition.rate < 15
    ? { bg: 'from-primary to-primary/70', fg: 'text-primary-foreground', sub: 'text-primary-foreground/80', badge: t('attritionGood') }
    : attrition.rate < 20
    ? { bg: 'from-amber-400 to-amber-500', fg: 'text-amber-950', sub: 'text-amber-950/80', badge: t('attritionFair') }
    : { bg: 'from-destructive to-destructive/80', fg: 'text-destructive-foreground', sub: 'text-destructive-foreground/80', badge: t('attritionHigh') };



  // Damaged and lost per item (exclude replaced ones — those were already swapped)
  const damagedByItem: Record<string, number> = {};
  const lostByItem: Record<string, number> = {};
  filteredDamagedLost.forEach(a => {
    if (a.status === 'replaced' || a.status === 'returned') return;
    const notes = (a.notes || '').toLowerCase();
    if (notes.includes('تالف') || notes.includes('damaged')) {
      damagedByItem[a.stock_item_id] = (damagedByItem[a.stock_item_id] || 0) + a.quantity_assigned;
    }
    if (notes.includes('فقدان') || notes.includes('مفقود') || notes.includes('lost')) {
      lostByItem[a.stock_item_id] = (lostByItem[a.stock_item_id] || 0) + a.quantity_assigned;
    }
  });


  const totalAddedByItem: Record<string, number> = {};
  filteredAdditions.forEach(a => {
    totalAddedByItem[a.stock_item_id] = (totalAddedByItem[a.stock_item_id] || 0) + a.quantity_added;
  });

  const totalConsumedByItem: Record<string, number> = {};
  filteredAssignments.forEach(a => {
    totalConsumedByItem[a.stock_item_id] = (totalConsumedByItem[a.stock_item_id] || 0) + a.quantity_assigned;
  });

  const totalPurchaseCost = stockItems.reduce((sum, item) => {
    const added = totalAddedByItem[item.id] || 0;
    return sum + (item.unit_price * added);
  }, 0);

  const costByCategory: Record<string, number> = {};
  stockItems.forEach(item => {
    const added = totalAddedByItem[item.id] || 0;
    const cost = item.unit_price * added;
    if (cost > 0) {
      const cat = item.category;
      costByCategory[cat] = (costByCategory[cat] || 0) + cost;
    }
  });

  const itemConsumption = stockItems.map(item => {
    const added = totalAddedByItem[item.id] || 0;
    const consumed = totalConsumedByItem[item.id] || 0;
    const remaining = item.quantity_in_stock;
    const pct = added > 0 ? Math.round((consumed / added) * 100) : 0;
    return { ...item, added, consumed, remaining, pct };
  }).filter(item => item.added > 0 || item.consumed > 0 || selectedYear === 'all');

  const categoryNames: Record<string, string> = {
    safety_shoes: t('safetyShoes'),
    'safety shoes': t('safetyShoes'),
    vests: t('vests'),
    helmets: t('helmets'),
    gloves: t('gloves'),
  };

  const cards = [
    { title: t('totalStock'), value: stats.totalStock, icon: Package, gradient: 'from-primary to-primary/80' },
    { title: t('activeEmployees'), value: stats.totalEmployees, icon: Users, gradient: 'from-success to-success/80' },
  ];

  const itemGradients = [
    'from-primary to-primary/70',
    'from-success to-success/70',
    'from-ring to-ring/70',
    'from-primary/80 to-ring/60',
    'from-success/80 to-primary/60',
    'from-ring/80 to-success/60',
  ];

  // Pie chart data
  const pieData = Object.entries(costByCategory).map(([cat, cost]) => ({
    name: categoryNames[cat] || cat,
    value: cost,
  }));

  // Bar chart data - monthly purchases vs consumption for selected year
  const barChartData = useMemo(() => {
    if (selectedYear === 'all') return [];
    const year = Number(selectedYear);
    return Array.from({ length: 12 }, (_, i) => {
      const monthAdditions = additions.filter(a => {
        const d = new Date(a.added_at);
        return d.getFullYear() === year && d.getMonth() === i;
      });
      const monthAssigns = assignments.filter(a => {
        const d = new Date(a.created_at);
        if (selectedLocation !== 'all' && a.employees?.location !== selectedLocation) return false;
        return d.getFullYear() === year && d.getMonth() === i;
      });
      const purchaseCost = monthAdditions.reduce((sum, a) => {
        const item = stockItems.find(si => si.id === a.stock_item_id);
        return sum + (item ? item.unit_price * a.quantity_added : 0);
      }, 0);
      const consumptionCost = monthAssigns.reduce((sum, a) => {
        const item = stockItems.find(si => si.id === a.stock_item_id);
        return sum + (item ? item.unit_price * a.quantity_assigned : 0);
      }, 0);
      return {
        month: monthNames[String(i)],
        [t('purchases')]: purchaseCost,
        [t('consumption')]: consumptionCost,
      };
    });
  }, [additions, assignments, stockItems, selectedYear, monthNames, t, selectedLocation]);

  // Consumed by category for month view
  const consumedByCategory: Record<string, number> = {};
  filteredAssignments.forEach(a => {
    const item = stockItems.find(i => i.id === a.stock_item_id);
    if (item) {
      const cat = item.category;
      consumedByCategory[cat] = (consumedByCategory[cat] || 0) + a.quantity_assigned;
    }
  });

  const isFiltered = selectedYear !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('overview')}</h1>
        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); if (v === 'all') setSelectedMonth('all'); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder={t('year')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTime')}</SelectItem>
              {availableYears.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedYear !== 'all' && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder={t('month')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allMonths')}</SelectItem>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>{monthNames[String(i)]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder={t('location')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allLocations')}</SelectItem>
              <SelectItem value="RDC">RDC</SelectItem>
              <SelectItem value="SDC">SDC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className="overflow-hidden">
            <div className={`bg-gradient-to-br ${card.gradient} p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-primary-foreground/80">{card.title}</p>
                  <p className="text-3xl font-bold text-primary-foreground">{card.value}</p>
                </div>
                <card.icon className="h-8 w-8 text-primary-foreground/60" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Total purchase cost */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-primary/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-primary-foreground/80">
                {isFiltered ? t('monthlyPurchases') : t('totalPurchaseCost')}
              </p>
              <p className="text-3xl font-bold text-primary-foreground">{totalPurchaseCost.toLocaleString()} {t('currency')}</p>
            </div>
            
          </div>
        </div>
      </Card>

      {/* Employee Attrition Rate */}
      <Card className="overflow-hidden">
        <div className={`bg-gradient-to-br ${attritionTone.bg} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-sm font-medium ${attritionTone.sub}`}>{t('attritionRate')}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-background/25 ${attritionTone.fg}`}>
                  {attritionTone.badge}
                </span>
              </div>
              <p className={`text-3xl font-bold mt-1 ${attritionTone.fg}`}>
                {attrition.rate.toFixed(1)}%
              </p>
              <p className={`text-xs mt-1 ${attritionTone.sub}`}>
                {t('attritionPeriod')}: {attrition.label}
              </p>
              <div className={`grid grid-cols-2 gap-2 mt-3 text-xs ${attritionTone.sub}`}>
                <div>
                  <span className="opacity-80">{t('attritionTerminations')}:</span>{' '}
                  <span className={`font-bold ${attritionTone.fg}`}>{attrition.terminations}</span>
                </div>
                <div>
                  <span className="opacity-80">{t('attritionAvgHeadcount')}:</span>{' '}
                  <span className={`font-bold ${attritionTone.fg}`}>{attrition.avgHeadcount.toFixed(1)}</span>
                </div>
              </div>
              <p className={`text-[10px] mt-2 ${attritionTone.sub}`}>
                {t('attritionFormulaHint')}
              </p>
            </div>
            <Users className={`h-8 w-8 shrink-0 ${attritionTone.sub}`} />
          </div>
        </div>
      </Card>

      {/* Total assignment deductions for inactive employees */}
      <Card className="overflow-hidden border-amber-500/40">
        <div className="bg-gradient-to-br from-amber-400 to-amber-500 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-950">{t('totalAssignmentDeductions')}</p>
              <p className="mt-1 text-3xl font-bold text-amber-950">
                {totalAssignmentDeductions.toLocaleString()} {t('currency')}
              </p>
              <p className="mt-2 text-xs text-amber-950/80 leading-relaxed">
                {t('totalAssignmentDeductionsDesc')}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3 bg-amber-950 text-amber-50 hover:bg-amber-950/90"
                onClick={() => setDeductionsOpen(true)}
                disabled={deductionRows.length === 0}
              >
                <Eye className="h-4 w-4" />
                {t('viewDetails')}
              </Button>
            </div>
            <BarChart3 className="h-8 w-8 text-amber-950/60 shrink-0" />
          </div>
        </div>
      </Card>

      <Dialog open={deductionsOpen} onOpenChange={setDeductionsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('deductionsBreakdown')}</DialogTitle>
            <DialogDescription>{t('totalAssignmentDeductionsDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {deductionRows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('noDeductions')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('employee')}</TableHead>
                    <TableHead>{t('item')}</TableHead>
                    <TableHead className="text-center">{t('quantity')}</TableHead>
                    <TableHead className="text-center">{t('daysElapsed')}</TableHead>
                    <TableHead className="text-center">{t('daysRemaining')}</TableHead>
                    <TableHead className="text-end">{t('deductionValue')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deductionRows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell>{r.itemName}</TableCell>
                      <TableCell className="text-center">{r.quantity}</TableCell>
                      <TableCell className="text-center">{r.daysElapsed}</TableCell>
                      <TableCell className="text-center font-semibold text-amber-700">{r.daysRemaining}</TableCell>
                      <TableCell className="text-end font-semibold">
                        {r.deduction.toLocaleString()} {t('currency')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {deductionRows.length > 0 && (
            <div className="border-t pt-3 mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('totalDays')}: </span>
                <span className="font-bold">{totalDeductionDays}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('grandTotal')}: </span>
                <span className="font-bold text-lg text-amber-700">
                  {totalAssignmentDeductions.toLocaleString()} {t('currency')}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <h2 className="text-lg font-bold">{t('categoryCost')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(costByCategory).map(([cat, cost], idx) => (
          <Card key={cat} className="overflow-hidden">
            <div className={`bg-gradient-to-br ${itemGradients[idx % itemGradients.length]} p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-primary-foreground/80">{categoryNames[cat] || cat}</p>
                  <p className="text-3xl font-bold text-primary-foreground">{cost.toLocaleString()} {t('currency')}</p>
                </div>
                
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Damaged Items */}
      {Object.keys(damagedByItem).length > 0 && (
        <>
          <h2 className="text-lg font-bold">{t('damagedItems')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(damagedByItem).map(([itemId, qty], idx) => {
              const item = stockItems.find(i => i.id === itemId);
              if (!item) return null;
              return (
                <Card key={itemId} className="overflow-hidden">
                  <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-primary-foreground/80">{item.name}</p>
                        <p className="text-3xl font-bold text-primary-foreground">{qty} {t('piece')}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Lost Items */}
      {Object.keys(lostByItem).length > 0 && (
        <>
          <h2 className="text-lg font-bold">{t('lostItems')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(lostByItem).map(([itemId, qty], idx) => {
              const item = stockItems.find(i => i.id === itemId);
              if (!item) return null;
              return (
                <Card key={itemId} className="overflow-hidden">
                  <div className="bg-gradient-to-br from-destructive to-destructive/80 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-primary-foreground/80">{item.name}</p>
                        <p className="text-3xl font-bold text-primary-foreground">{qty} {t('piece')}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Renewal Needed Items */}
      {Object.keys(renewalNeededByItem).length > 0 && (
        <>
          <h2 className="text-lg font-bold text-destructive">{t('renewalNeededItems')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(renewalNeededByItem).map(([itemId, qty]) => {
              const item = stockItems.find(i => i.id === itemId);
              if (!item) return null;
              return (
                <Card key={itemId} className="overflow-hidden border-destructive">
                  <div className="bg-gradient-to-br from-destructive to-destructive/80 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-primary-foreground/80">{item.name}</p>
                        <p className="text-3xl font-bold text-primary-foreground">{qty} {t('piece')}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('costDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()} ${t('currency')}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bar Chart - Monthly comparison */}
      {selectedYear !== 'all' && barChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('monthlyComparison')} - {selectedYear}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()} ${t('currency')}`} />
                  <Legend />
                  <Bar dataKey={t('purchases')} fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={t('consumption')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {isFiltered && Object.keys(consumedByCategory).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('monthlyConsumption')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(consumedByCategory).map(([cat, qty]) => (
                <Card key={cat} className="overflow-hidden">
                  <div className="bg-gradient-to-br from-accent to-accent/70 p-4">
                    <p className="text-sm font-medium text-primary-foreground/80">{categoryNames[cat] || cat}</p>
                    <p className="text-2xl font-bold text-primary-foreground">{qty} {t('piece')}</p>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Consumption overview per item - colorful cards */}
      <div>
        <h2 className="text-lg font-bold mb-4">{t('consumptionOverview')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {itemConsumption.map((item, idx) => (
            <Card key={item.id} className="overflow-hidden">
              <div className={`bg-gradient-to-br ${itemGradients[idx % itemGradients.length]} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-primary-foreground">{item.name}</p>
                  <span className="text-xs text-primary-foreground/70">{categoryNames[item.category] || item.category}</span>
                </div>
                {item.size !== 'N/A' && (
                  <p className="text-xs text-primary-foreground/70 mb-2">{t('size')}: {item.size}</p>
                )}
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('totalAdded')}</p>
                    <p className="text-lg font-bold">{item.added}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('totalConsumed')}</p>
                    <p className="text-lg font-bold">{item.consumed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('remaining')}</p>
                    <p className="text-lg font-bold">{item.remaining}</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{t('consumptionOverview')}</span>
                    <span>{item.pct}%</span>
                  </div>
                  <Progress value={item.pct} className="h-2" />
                </div>
                <div className="text-center border-t pt-2">
                  <p className="text-xs text-muted-foreground">{t('totalPrice')}</p>
                  <p className="text-sm font-bold">{(item.unit_price * item.added).toLocaleString()} {t('currency')}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {stats.pendingAssignments > 0 && (
        <Card className="border-ring">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {t('pendingApproval')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{stats.pendingAssignments} {t('assignments')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
