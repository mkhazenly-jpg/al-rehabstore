import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Users, ClipboardList, BarChart3, Eye, PieChart as PieChartIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const PIE_COLORS = ['#16a34a', '#f97316', '#2563eb', '#ef4444', '#8b5cf6', '#ec4899'];

export function DashboardContent() {
  const { t, lang } = useLanguage();
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [additions, setAdditions] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [damagedLostAssignments, setDamagedLostAssignments] = useState<any[]>([]);
  const [allApprovedAssignments, setAllApprovedAssignments] = useState<any[]>([]);
  const [allViolations, setAllViolations] = useState<any[]>([]);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [attritionUseLocation, setAttritionUseLocation] = useState<boolean>(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    const [stockRes, empRes, assignRes, additionsRes, allAssignRes, damagedLostRes, approvedAssignRes, violationsRes] = await Promise.all([
      supabase.from('stock_items').select('*'),
      supabase.from('employees').select('status, location, hire_date, termination_date'),
      supabase.from('assignments').select('status, stock_item_id, quantity_assigned, created_at, employee_id, employees(location)'),
      supabase.from('stock_additions').select('*'),
      supabase.from('assignments').select('stock_item_id, quantity_assigned, status, created_at, employee_id, employees(location)').in('status', ['approved', 'pending']),
      supabase.from('assignments').select('stock_item_id, quantity_assigned, notes, created_at, status, employee_id, employees(location)').not('notes', 'is', null),
      supabase.from('assignments').select('stock_item_id, quantity_assigned, status, assignment_date, employee_id, unit_price_at_assignment, employees(name, location, status, termination_date), stock_items(name, unit_price, category)').eq('status', 'approved'),
      supabase.from('employee_violations').select('id, action_taken, deduction_amount, daily_wage, violation_date, violation_description, employee_id, employees(name, location, job_title)'),
    ]);

    const items = stockRes.data || [];
    const employees = empRes.data || [];

    setAllEmployees(employees);
    setStockItems(items);
    setAdditions(additionsRes.data || []);
    setAssignments(allAssignRes.data || []);
    setDamagedLostAssignments(damagedLostRes.data || []);
    setAllApprovedAssignments(approvedAssignRes.data || []);
    setAllViolations(violationsRes.data || []);
  };

  const stats = useMemo(() => {
    // Determine the active period from year/month filters
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (selectedYear !== 'all') {
      const y = Number(selectedYear);
      if (selectedMonth !== 'all') {
        const m = Number(selectedMonth);
        periodStart = new Date(y, m, 1);
        periodEnd = new Date(y, m + 1, 0, 23, 59, 59);
      } else {
        periodStart = new Date(y, 0, 1);
        periodEnd = new Date(y, 11, 31, 23, 59, 59);
      }
    }

    // Active employees: only those with status === 'active', filtered by location
    const filteredEmployees = allEmployees.filter((e: any) => {
      if (selectedLocation !== 'all' && e.location !== selectedLocation) return false;
      return e.status === 'active';
    });

    // Pending assignments filtered by period (created_at) + location
    const pending = assignments.filter((a: any) => {
      if (a.status !== 'pending') return false;
      if (selectedLocation !== 'all' && a.employees?.location !== selectedLocation) return false;
      if (periodStart && periodEnd) {
        const d = new Date(a.created_at).getTime();
        if (d < periodStart.getTime() || d > periodEnd.getTime()) return false;
      }
      return true;
    });

    // Filter stock items by location
    const filteredStockItems = stockItems.filter((s: any) =>
      selectedLocation === 'all' || s.location === selectedLocation
    );
    const stockIdsForLoc = new Set(filteredStockItems.map((s: any) => s.id));

    // Total stock quantity: when filtering by period, sum additions in that period; else sum quantity_in_stock
    let totalStock = filteredStockItems.reduce((sum: number, s: any) => sum + (s.quantity_in_stock || 0), 0);
    if (periodStart && periodEnd) {
      totalStock = additions.reduce((sum: number, a: any) => {
        if (selectedLocation !== 'all' && !stockIdsForLoc.has(a.stock_item_id)) return sum;
        const d = new Date(a.added_at).getTime();
        if (d < periodStart!.getTime() || d > periodEnd!.getTime()) return sum;
        return sum + (a.quantity_added || 0);
      }, 0);
    }

    // Total distinct items count (filtered by location; period not applied here)
    const totalItemsCount = filteredStockItems.length;

    return {
      totalStock,
      totalItemsCount,
      totalEmployees: filteredEmployees.length,
      pendingAssignments: pending.length,
    };
  }, [allEmployees, stockItems, assignments, selectedLocation, selectedYear, selectedMonth, additions]);

  // Get available years from all date sources, plus current year and a few recent years as fallback
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const now = new Date().getFullYear();
    for (let i = 0; i < 5; i++) years.add(now - i);
    additions.forEach(a => { if (a.added_at) years.add(new Date(a.added_at).getFullYear()); });
    assignments.forEach(a => { if (a.created_at) years.add(new Date(a.created_at).getFullYear()); });
    allViolations.forEach((v: any) => { if (v.violation_date) years.add(new Date(v.violation_date).getFullYear()); });
    allEmployees.forEach((e: any) => { if (e.hire_date) years.add(new Date(e.hire_date).getFullYear()); });
    return Array.from(years).sort((a, b) => b - a);
  }, [additions, assignments, allViolations, allEmployees]);

  const monthNames: Record<string, string> = {
    '0': t('january'), '1': t('february'), '2': t('march'), '3': t('april'),
    '4': t('may'), '5': t('june'), '6': t('july'), '7': t('august'),
    '8': t('september'), '9': t('october'), '10': t('november'), '11': t('december'),
  };

  // Helper: stock item ids that match the selected location filter
  const stockIdsByLocation = useMemo(() => {
    if (selectedLocation === 'all') return null;
    return new Set(stockItems.filter((s: any) => s.location === selectedLocation).map((s: any) => s.id));
  }, [stockItems, selectedLocation]);

  // Filter additions by selected date AND by stock item location
  const filteredAdditions = useMemo(() => {
    return additions.filter(a => {
      if (stockIdsByLocation && !stockIdsByLocation.has(a.stock_item_id)) return false;
      const d = new Date(a.added_at);
      if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return false;
      if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return false;
      return true;
    });
  }, [additions, selectedYear, selectedMonth, stockIdsByLocation]);

  // Filter assignments by date AND by stock item location (consumption uses item location, not employee location)
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      const d = new Date(a.created_at);
      if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return false;
      if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return false;
      if (stockIdsByLocation && !stockIdsByLocation.has(a.stock_item_id)) return false;
      return true;
    });
  }, [assignments, selectedYear, selectedMonth, stockIdsByLocation]);

  // Filter damaged/lost assignments by date and stock item location
  const filteredDamagedLost = useMemo(() => {
    return damagedLostAssignments.filter(a => {
      const d = new Date(a.created_at);
      if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return false;
      if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return false;
      if (stockIdsByLocation && !stockIdsByLocation.has(a.stock_item_id)) return false;
      return true;
    });
  }, [damagedLostAssignments, selectedYear, selectedMonth, stockIdsByLocation]);

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
  const [violationDeductionsOpen, setViolationDeductionsOpen] = useState(false);
  const [mostConsumedOpen, setMostConsumedOpen] = useState(false);
  const [topViolatorsOpen, setTopViolatorsOpen] = useState(false);
  const [stockDetailsOpen, setStockDetailsOpen] = useState(false);
  const [attritionDetailsOpen, setAttritionDetailsOpen] = useState(false);

  // Per-violation rows (filtered by year/month/location)
  const violationDeductionRows = useMemo(() => {
    return allViolations
      .filter((v: any) => {
        if (v.action_taken !== 'deduction') return false;
        const d = new Date(v.violation_date);
        if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return false;
        if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return false;
        if (selectedLocation !== 'all' && v.employees?.location !== selectedLocation) return false;
        return true;
      })
      .map((v: any) => {
        const wage = Number(v.daily_wage) || 0;
        const days = Number(v.deduction_amount) || 0;
        return {
          id: v.id,
          employeeName: v.employees?.name || '-',
          violationType: v.violation_description || '-',
          description: v.violation_description || '',
          violationDate: v.violation_date,
          dailyWage: wage,
          days,
          deduction: wage * days,
        };
      })
      .sort((a, b) => (a.violationDate < b.violationDate ? 1 : -1));
  }, [allViolations, selectedYear, selectedMonth, selectedLocation]);

  const totalViolationDeductions = useMemo(
    () => violationDeductionRows.reduce((sum, r) => sum + r.deduction, 0),
    [violationDeductionRows]
  );

  // Attrition rate calculation
  // Formula: (terminations in period / average headcount in period) * 100
  // Period is determined by selectedYear + selectedMonth filters.
  // When "all time" is selected we fall back to the trailing 12 months ending today.
  const attrition = useMemo(() => {
    const effectiveLocation = selectedLocation;
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

    // Total employees ever recorded (all-time, by location)
    const totalEverEmployees = filteredEmployees.length;
    // Total who left (resigned/terminated/archived) all-time
    const inactiveSet = new Set(['resigned', 'terminated', 'archived']);
    const totalLeftEmployees = filteredEmployees.filter((e: any) =>
      inactiveSet.has(e.status) || !!e.termination_date
    ).length;

    return {
      rate,
      terminations,
      avgHeadcount,
      startHeadcount,
      endHeadcount,
      totalEverEmployees,
      totalLeftEmployees,
      label,
    };
  }, [allEmployees, selectedYear, selectedMonth, selectedLocation, attritionUseLocation, monthNames, t]);

  // Employees registered (hired) within the selected period & location — for the attrition details dialog
  const attritionDetailRows = useMemo(() => {
    const filteredByLoc = allEmployees.filter((e: any) =>
      selectedLocation === 'all' || e.location === selectedLocation
    );

    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (selectedYear === 'all') {
      periodStart = null;
      periodEnd = null;
    } else if (selectedMonth === 'all') {
      const y = Number(selectedYear);
      periodStart = new Date(y, 0, 1);
      periodEnd = new Date(y, 11, 31, 23, 59, 59);
    } else {
      const y = Number(selectedYear);
      const m = Number(selectedMonth);
      periodStart = new Date(y, m, 1);
      periodEnd = new Date(y, m + 1, 0, 23, 59, 59);
    }

    return filteredByLoc
      .filter((e: any) => {
        if (!periodStart || !periodEnd) return true;
        if (!e.hire_date) return false;
        const ms = new Date(e.hire_date).getTime();
        return ms >= periodStart.getTime() && ms <= periodEnd.getTime();
      })
      .sort((a: any, b: any) => {
        const am = a.hire_date ? new Date(a.hire_date).getTime() : 0;
        const bm = b.hire_date ? new Date(b.hire_date).getTime() : 0;
        return bm - am;
      });
  }, [allEmployees, selectedYear, selectedMonth, selectedLocation]);

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

  // Most consumed items - aggregated by category, with size breakdown for sized items
  const mostConsumedData = (() => {
    const byCategory: Record<string, { totalQty: number; sizes: Record<string, number>; itemNames: Set<string> }> = {};
    filteredAssignments.forEach((a: any) => {
      const item = stockItems.find((i: any) => i.id === a.stock_item_id);
      if (!item) return;
      const cat = item.category || '-';
      if (!byCategory[cat]) byCategory[cat] = { totalQty: 0, sizes: {}, itemNames: new Set() };
      byCategory[cat].totalQty += a.quantity_assigned || 0;
      byCategory[cat].itemNames.add(item.name);
      const size = item.size && item.size !== 'N/A' ? item.size : '-';
      byCategory[cat].sizes[size] = (byCategory[cat].sizes[size] || 0) + (a.quantity_assigned || 0);
    });
    return Object.entries(byCategory)
      .map(([cat, data]) => ({
        category: cat,
        totalQty: data.totalQty,
        itemNames: Array.from(data.itemNames),
        sizes: Object.entries(data.sizes)
          .filter(([s]) => s !== '-')
          .map(([size, qty]) => ({ size, qty }))
          .sort((a, b) => b.qty - a.qty),
      }))
      .sort((a, b) => b.totalQty - a.totalQty);
  })();

  const topConsumedCategory = mostConsumedData[0];

  // Top employees by number of violations (filtered by year/month/location)
  const topViolatorsData = (() => {
    const byEmp: Record<string, { name: string; location: string; jobTitle: string; count: number; actions: Record<string, number> }> = {};
    allViolations.forEach((v: any) => {
      const d = new Date(v.violation_date);
      if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return;
      if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return;
      if (selectedLocation !== 'all' && v.employees?.location !== selectedLocation) return;
      const key = v.employee_id || 'unknown';
      if (!byEmp[key]) byEmp[key] = {
        name: v.employees?.name || '-',
        location: v.employees?.location || '-',
        jobTitle: v.employees?.job_title || '-',
        count: 0,
        actions: {},
      };
      byEmp[key].count += 1;
      const act = v.action_taken || '-';
      byEmp[key].actions[act] = (byEmp[key].actions[act] || 0) + 1;
    });
    return Object.values(byEmp).sort((a, b) => b.count - a.count);
  })();

  const topViolator = topViolatorsData[0];

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

  // Total quantity by category (respects location + period filters)
  // When period is selected: net = added - consumed in period
  // When all-time: use current quantity_in_stock per item (filtered by location)
  const quantityByCategory: Record<string, number> = {};
  if (selectedYear === 'all') {
    stockItems.forEach(item => {
      if (selectedLocation !== 'all' && item.location !== selectedLocation) return;
      const cat = item.category || '-';
      quantityByCategory[cat] = (quantityByCategory[cat] || 0) + (Number(item.quantity_in_stock) || 0);
    });
  } else {
    filteredAdditions.forEach(a => {
      const item = stockItems.find(i => i.id === a.stock_item_id);
      if (!item) return;
      const cat = item.category || '-';
      quantityByCategory[cat] = (quantityByCategory[cat] || 0) + (a.quantity_added || 0);
    });
    filteredAssignments.forEach(a => {
      const item = stockItems.find(i => i.id === a.stock_item_id);
      if (!item) return;
      const cat = item.category || '-';
      quantityByCategory[cat] = (quantityByCategory[cat] || 0) - (a.quantity_assigned || 0);
    });
  }

  const itemConsumption = stockItems
    .filter(item => selectedLocation === 'all' || item.location === selectedLocation)
    .map(item => {
      const added = totalAddedByItem[item.id] || 0;
      const consumed = totalConsumedByItem[item.id] || 0;
      const remaining = item.quantity_in_stock;
      const pct = added > 0 ? Math.round((consumed / added) * 100) : 0;
      return { ...item, added, consumed, remaining, pct };
    }).filter(item => item.added > 0 || item.consumed > 0 || selectedYear === 'all');

  const stockDetailRows = stockItems
    .filter(item => selectedLocation === 'all' || item.location === selectedLocation)
    .map(item => {
      const added = totalAddedByItem[item.id] || 0;
      const consumed = totalConsumedByItem[item.id] || 0;
      const remaining = Number(item.quantity_in_stock) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      return { ...item, added, consumed, remaining, unitPrice, totalValue: remaining * unitPrice };
    })
    .filter(item => selectedYear === 'all' || item.added > 0 || item.consumed > 0)
    .sort((a, b) => {
      const cat = String(a.category || '').localeCompare(String(b.category || ''), lang === 'ar' ? 'ar' : 'en');
      if (cat !== 0) return cat;
      const name = String(a.name || '').localeCompare(String(b.name || ''), lang === 'ar' ? 'ar' : 'en');
      if (name !== 0) return name;
      return b.remaining - a.remaining;
    });

  const stockDetailsByCategory = stockDetailRows.reduce<Record<string, typeof stockDetailRows>>((acc, item) => {
    const key = item.category || '-';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const stockDetailsTotalValue = stockDetailRows.reduce((sum, item) => sum + item.totalValue, 0);

  const categoryNames: Record<string, string> = {
    safety_shoes: t('safetyShoes'),
    'safety shoes': t('safetyShoes'),
    vests: t('vests'),
    helmets: t('helmets'),
    gloves: t('gloves'),
  };

  const cards = [
    { key: 'totalStock', title: t('totalStock'), value: stats.totalStock, icon: Package, gradient: 'from-primary to-primary/80' },
    { key: 'totalItemsCount', title: t('totalItemsCount'), value: stats.totalItemsCount, icon: Package, gradient: 'from-ring to-ring/80' },
    { key: 'activeEmployees', title: t('activeEmployees'), value: stats.totalEmployees, icon: Users, gradient: 'from-success to-success/80' },
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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-primary-foreground/80">{card.title}</p>
                  <p className="text-3xl font-bold text-primary-foreground">{card.value}</p>
                  {card.key === 'totalStock' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3 bg-background/95 text-foreground hover:bg-background"
                      onClick={() => setStockDetailsOpen(true)}
                      disabled={stockDetailRows.length === 0}
                    >
                      <Eye className="h-4 w-4" />
                      {t('viewDetails')}
                    </Button>
              )}
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
                <div>
                  <span className="opacity-80">{t('totalEverEmployees')}:</span>{' '}
                  <span className={`font-bold ${attritionTone.fg}`}>{attrition.totalEverEmployees}</span>
                </div>
                <div>
                  <span className="opacity-80">{t('totalLeftEmployees')}:</span>{' '}
                  <span className={`font-bold ${attritionTone.fg}`}>{attrition.totalLeftEmployees}</span>
                </div>
              </div>
              <p className={`text-[10px] mt-2 ${attritionTone.sub}`}>
                {t('attritionFormulaHint')}
              </p>
              {selectedLocation !== 'all' && (
                <p className={`text-[10px] mt-3 pt-3 border-t border-background/20 ${attritionTone.sub}`}>
                  {t('attritionApplyLocation')} ({selectedLocation})
                </p>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="mt-3 bg-background/95 text-foreground hover:bg-background"
                onClick={() => setAttritionDetailsOpen(true)}
              >
                <Eye className="h-4 w-4 me-1" />
                {t('viewDetails')}
              </Button>
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

      {/* Total monetary deductions from violations */}
      <Card className="overflow-hidden border-amber-500/40">
        <div className="bg-gradient-to-br from-amber-400 to-amber-500 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-950">{t('totalViolationDeductions')}</p>
              <p className="mt-1 text-3xl font-bold text-amber-950">
                {totalViolationDeductions.toLocaleString()} {t('currency')}
              </p>
              <p className="mt-2 text-xs text-amber-950/80 leading-relaxed">
                {t('totalViolationDeductionsDesc')}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3 bg-amber-950 text-amber-50 hover:bg-amber-950/90"
                onClick={() => setViolationDeductionsOpen(true)}
                disabled={violationDeductionRows.length === 0}
              >
                <Eye className="h-4 w-4" />
                {t('viewDetails')}
              </Button>
            </div>
            <BarChart3 className="h-8 w-8 text-amber-950/60 shrink-0" />
          </div>
        </div>
      </Card>

      {/* Most Consumed Items */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="bg-gradient-to-br from-amber-400 to-amber-500 p-6">
          {topConsumedCategory ? (
            <div className="flex items-center gap-4 flex-row-reverse">
              {/* Right column: title + ranked list + description */}
              <div className="min-w-0 flex-1 text-right">
                <h3 className="text-xl font-bold text-amber-950 mb-3">{t('mostConsumedItems')}</h3>
                <ul className="space-y-2">
                  {mostConsumedData.slice(0, 3).map((row, idx) => (
                    <li key={row.category} className="text-amber-950 font-bold text-lg leading-tight">
                      <span>{idx + 1}. </span>
                      <span>{categoryNames[row.category] || row.category}</span>
                      <span className="font-semibold"> ({row.totalQty} {t('piece')})</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-amber-950/85 leading-relaxed">
                  {t('mostConsumedItemsDesc')}
                </p>
              </div>
              {/* Left column: white pill button */}
              <div className="shrink-0">
                <Button
                  onClick={() => setMostConsumedOpen(true)}
                  className="bg-white text-amber-900 hover:bg-white/90 rounded-full shadow-md px-5 h-11 font-semibold"
                >
                  <Eye className="h-4 w-4" />
                  {t('viewDetails')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-right">
                <h3 className="text-xl font-bold text-amber-950 mb-2">{t('mostConsumedItems')}</h3>
                <p className="text-sm text-amber-950/80">{t('noConsumption')}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-amber-950/60 shrink-0" />
            </div>
          )}
        </div>
      </Card>

      {/* Top Violators */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="bg-gradient-to-br from-amber-400 to-amber-500 p-6">
          {topViolator ? (
            <div className="flex items-center gap-4 flex-row-reverse">
              <div className="min-w-0 flex-1 text-right">
                <h3 className="text-xl font-bold text-amber-950 mb-3">{t('topViolatorsTitle')}</h3>
                <ul className="space-y-2">
                  {topViolatorsData.slice(0, 3).map((row, idx) => (
                    <li key={row.name + idx} className="text-amber-950 font-bold text-lg leading-tight">
                      <span>{idx + 1}. </span>
                      <span>{row.name}</span>
                      <span className="font-semibold"> ({row.count} {t('violationsCount')})</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-amber-950/85 leading-relaxed">
                  {t('topViolatorsDesc')}
                </p>
              </div>
              <div className="shrink-0">
                <Button
                  onClick={() => setTopViolatorsOpen(true)}
                  className="bg-white text-amber-900 hover:bg-white/90 rounded-full shadow-md px-5 h-11 font-semibold"
                >
                  <Eye className="h-4 w-4" />
                  {t('viewDetails')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-right">
                <h3 className="text-xl font-bold text-amber-950 mb-2">{t('topViolatorsTitle')}</h3>
                <p className="text-sm text-amber-950/80">{t('noViolations')}</p>
              </div>
              <Users className="h-8 w-8 text-amber-950/60 shrink-0" />
            </div>
          )}
        </div>
      </Card>

      <Dialog open={topViolatorsOpen} onOpenChange={setTopViolatorsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('topViolatorsTitle')}</DialogTitle>
            <DialogDescription>{t('topViolatorsDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {topViolatorsData.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('noViolations')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>{t('employee')}</TableHead>
                    <TableHead>{t('jobTitle')}</TableHead>
                    <TableHead>{t('location')}</TableHead>
                    <TableHead className="text-end">{t('violationsCount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topViolatorsData.map((row, idx) => (
                    <TableRow key={row.name + idx}>
                      <TableCell className="font-semibold text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.jobTitle}</TableCell>
                      <TableCell>{row.location}</TableCell>
                      <TableCell className="text-end font-bold text-amber-600">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={stockDetailsOpen} onOpenChange={setStockDetailsOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('stockDetailsTitle')}</DialogTitle>
            <DialogDescription>{t('stockDetailsDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            {stockDetailRows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('noStockDetails')}</p>
            ) : (
              Object.entries(stockDetailsByCategory).map(([category, rows]) => (
                <div key={category} className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-3">
                    <h3 className="font-bold">{categoryNames[category] || category}</h3>
                    <span className="text-sm text-muted-foreground">
                      {rows.reduce((sum, item) => sum + item.remaining, 0).toLocaleString()} {t('piece')}
                    </span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('item')}</TableHead>
                        <TableHead>{t('size')}</TableHead>
                        <TableHead>{t('location')}</TableHead>
                        <TableHead className="text-center">{t('totalAdded')}</TableHead>
                        <TableHead className="text-center">{t('totalConsumed')}</TableHead>
                        <TableHead className="text-center">{t('remaining')}</TableHead>
                        <TableHead className="text-end">{t('totalPrice')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.size || '—'}</TableCell>
                          <TableCell>{item.location || '—'}</TableCell>
                          <TableCell className="text-center">{item.added.toLocaleString()}</TableCell>
                          <TableCell className="text-center">{item.consumed.toLocaleString()}</TableCell>
                          <TableCell className="text-center font-bold text-primary">{item.remaining.toLocaleString()}</TableCell>
                          <TableCell className="text-end font-semibold">{item.totalValue.toLocaleString()} {t('currency')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))
            )}
          </div>
          {stockDetailRows.length > 0 && (
            <div className="border-t pt-3 mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('totalStock')}: </span>
                <span className="font-bold">{stats.totalStock.toLocaleString()} {t('piece')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('grandTotal')}: </span>
                <span className="font-bold text-lg text-primary">{stockDetailsTotalValue.toLocaleString()} {t('currency')}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={attritionDetailsOpen} onOpenChange={setAttritionDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('attritionDetailsTitle')}</DialogTitle>
            <DialogDescription>
              {t('attritionDetailsDesc')} — {attrition.label}
              {selectedLocation !== 'all' ? ` · ${selectedLocation}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {attritionDetailRows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('noEmployeesInPeriod')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('fullName')}</TableHead>
                    <TableHead>{t('location')}</TableHead>
                    <TableHead>{t('registrationDate')}</TableHead>
                    <TableHead>{t('exitStatus')}</TableHead>
                    <TableHead>{t('exitDate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attritionDetailRows.map((e: any) => {
                    const isInactive = ['resigned', 'terminated', 'archived'].includes(e.status) || !!e.termination_date;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell>{e.location || '—'}</TableCell>
                        <TableCell>{e.hire_date ? new Date(e.hire_date).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            isInactive ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'
                          }`}>
                            {isInactive ? t(e.status || 'terminated') : t('stillActive')}
                          </span>
                        </TableCell>
                        <TableCell>{e.termination_date ? new Date(e.termination_date).toLocaleDateString() : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="border-t pt-3 mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">{t('totalEverEmployees')}: </span>
              <span className="font-bold">{attritionDetailRows.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('totalLeftEmployees')}: </span>
              <span className="font-bold text-destructive">
                {attritionDetailRows.filter((e: any) => ['resigned', 'terminated', 'archived'].includes(e.status) || !!e.termination_date).length}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={mostConsumedOpen} onOpenChange={setMostConsumedOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('mostConsumedItems')}</DialogTitle>
            <DialogDescription>{t('mostConsumedItemsDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            {mostConsumedData.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('noConsumption')}</p>
            ) : (
              mostConsumedData.map((row, idx) => (
                <Card key={row.category} className="overflow-hidden">
                  <div className="p-4 bg-muted/30">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                        <p className="font-bold text-lg">{categoryNames[row.category] || row.category}</p>
                      </div>
                      <div className="text-end">
                        <p className="text-xs text-muted-foreground">{t('consumedQty')}</p>
                        <p className="font-bold text-xl text-amber-600">{row.totalQty} {t('piece')}</p>
                      </div>
                    </div>
                    {row.sizes.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">{t('mostConsumedSizes')}:</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('size')}</TableHead>
                              <TableHead className="text-end">{t('consumedQty')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {row.sizes.map(s => (
                              <TableRow key={s.size}>
                                <TableCell className="font-medium">{s.size}</TableCell>
                                <TableCell className="text-end font-semibold">{s.qty}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={violationDeductionsOpen} onOpenChange={setViolationDeductionsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('violationDeductionsBreakdown')}</DialogTitle>
            <DialogDescription>{t('totalViolationDeductionsDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {violationDeductionRows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('noDeductions')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('employee')}</TableHead>
                    <TableHead>{t('violationDescription')}</TableHead>
                    <TableHead>{t('violationDate')}</TableHead>
                    <TableHead className="text-end">{t('deductionValue')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {violationDeductionRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell className="whitespace-pre-wrap">{r.description || r.violationType}</TableCell>
                      <TableCell>{new Date(r.violationDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</TableCell>
                      <TableCell className="text-end font-bold text-amber-600">
                        {r.deduction.toLocaleString()} {t('currency')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {violationDeductionRows.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between">
              <span className="font-bold text-amber-950">{t('grandTotal')}</span>
              <span className="font-bold text-xl text-amber-600">
                {totalViolationDeductions.toLocaleString()} {t('currency')}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Quantity by Category */}
      {Object.keys(quantityByCategory).length > 0 && (
        <>
          <h2 className="text-lg font-bold">{t('quantityByCategory')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(quantityByCategory)
              .filter(([, qty]) => qty !== 0)
              .map(([cat, qty], idx) => (
                <Card key={cat} className="overflow-hidden">
                  <div className={`bg-gradient-to-br ${itemGradients[idx % itemGradients.length]} p-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-primary-foreground/80">{categoryNames[cat] || cat}</p>
                        <p className="text-3xl font-bold text-primary-foreground">{qty.toLocaleString()} {t('piece')}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </>
      )}

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
      {pieData.length > 0 && (() => {
        const totalPie = pieData.reduce((s, d) => s + d.value, 0);
        return (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base font-bold">{t('costDistribution')}</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <PieChartIcon className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={75}
                    outerRadius={120}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="#fff"
                    strokeWidth={3}
                    label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={14}
                    fontWeight={700}
                    fill="#fff"
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()} ${t('currency')}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 pt-4 border-t border-border/60">
              {pieData.map((d, idx) => {
                const color = PIE_COLORS[idx % PIE_COLORS.length];
                const pct = totalPie > 0 ? (d.value / totalPie) * 100 : 0;
                return (
                  <div key={d.name} className="flex flex-col items-center text-center gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-xs font-semibold text-foreground">{d.name}</span>
                    </div>
                    <span className="text-xs font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        );
      })()}

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
