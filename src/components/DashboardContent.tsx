import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Users, ClipboardList, BarChart3 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

const PIE_COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

export function DashboardContent() {
  const { t, lang } = useLanguage();
  const [stats, setStats] = useState({ totalStock: 0, totalEmployees: 0, pendingAssignments: 0 });
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [additions, setAdditions] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [damagedLostAssignments, setDamagedLostAssignments] = useState<any[]>([]);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    const [stockRes, empRes, assignRes, additionsRes, allAssignRes, damagedLostRes] = await Promise.all([
      supabase.from('stock_items').select('*'),
      supabase.from('employees').select('status'),
      supabase.from('assignments').select('status, stock_item_id, quantity_assigned, created_at'),
      supabase.from('stock_additions').select('*'),
      supabase.from('assignments').select('stock_item_id, quantity_assigned, status, created_at').in('status', ['approved', 'pending']),
      supabase.from('assignments').select('stock_item_id, quantity_assigned, notes, created_at').not('notes', 'is', null),
    ]);

    const items = stockRes.data || [];
    const employees = empRes.data || [];
    const allAssignments = assignRes.data || [];

    setStats({
      totalStock: items.length,
      totalEmployees: employees.length,
      pendingAssignments: allAssignments.filter(a => a.status === 'pending').length,
    });

    setStockItems(items);
    setAdditions(additionsRes.data || []);
    setAssignments(allAssignRes.data || []);
    setDamagedLostAssignments(damagedLostRes.data || []);
  };

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
      return true;
    });
  }, [assignments, selectedYear, selectedMonth]);

  // Filter damaged/lost assignments by date
  const filteredDamagedLost = useMemo(() => {
    return damagedLostAssignments.filter(a => {
      const d = new Date(a.created_at);
      if (selectedYear !== 'all' && d.getFullYear() !== Number(selectedYear)) return false;
      if (selectedMonth !== 'all' && d.getMonth() !== Number(selectedMonth)) return false;
      return true;
    });
  }, [damagedLostAssignments, selectedYear, selectedMonth]);

  // Damaged and lost per item
  const damagedByItem: Record<string, number> = {};
  const lostByItem: Record<string, number> = {};
  filteredDamagedLost.forEach(a => {
    if (a.notes?.includes(t('damaged'))) {
      damagedByItem[a.stock_item_id] = (damagedByItem[a.stock_item_id] || 0) + a.quantity_assigned;
    }
    if (a.notes?.includes(t('lost'))) {
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
    'from-accent to-accent/70',
    'from-success to-success/70',
    'from-ring to-ring/70',
    'from-primary/80 to-ring/60',
    'from-accent/80 to-success/60',
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
  }, [additions, assignments, stockItems, selectedYear, monthNames, t]);

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

      {/* Cost by category */}
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
