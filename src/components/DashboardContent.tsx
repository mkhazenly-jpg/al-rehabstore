import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, AlertTriangle, Users, ClipboardList, DollarSign, BarChart3 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export function DashboardContent() {
  const { t, lang } = useLanguage();
  const [stats, setStats] = useState({ totalStock: 0, lowStock: 0, totalEmployees: 0, pendingAssignments: 0 });
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [additions, setAdditions] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    const [stockRes, empRes, assignRes, recentRes, additionsRes, allAssignRes] = await Promise.all([
      supabase.from('stock_items').select('*'),
      supabase.from('employees').select('status'),
      supabase.from('assignments').select('status'),
      supabase.from('assignments').select('*, employees(name), stock_items(name)').order('created_at', { ascending: false }).limit(5),
      supabase.from('stock_additions').select('*'),
      supabase.from('assignments').select('stock_item_id, quantity_assigned, status').in('status', ['approved', 'pending']),
    ]);

    const items = stockRes.data || [];
    const employees = empRes.data || [];
    const allAssignments = assignRes.data || [];

    setStats({
      totalStock: items.length,
      lowStock: items.filter(i => i.quantity_in_stock < 5).length,
      totalEmployees: employees.length,
      pendingAssignments: allAssignments.filter(a => a.status === 'pending').length,
    });

    setRecentAssignments(recentRes.data || []);
    setStockItems(items);
    setAdditions(additionsRes.data || []);
    setAssignments(allAssignRes.data || []);
  };

  // Calculate total added per item
  const totalAddedByItem: Record<string, number> = {};
  additions.forEach(a => {
    totalAddedByItem[a.stock_item_id] = (totalAddedByItem[a.stock_item_id] || 0) + a.quantity_added;
  });

  // Calculate total consumed (approved/pending assignments) per item
  const totalConsumedByItem: Record<string, number> = {};
  assignments.forEach(a => {
    totalConsumedByItem[a.stock_item_id] = (totalConsumedByItem[a.stock_item_id] || 0) + a.quantity_assigned;
  });

  // Total purchase cost = sum(unit_price * total_added) for each item
  const totalPurchaseCost = stockItems.reduce((sum, item) => {
    const added = totalAddedByItem[item.id] || 0;
    return sum + (item.unit_price * added);
  }, 0);

  // Cost by category
  const costByCategory: Record<string, number> = {};
  stockItems.forEach(item => {
    const added = totalAddedByItem[item.id] || 0;
    const cost = item.unit_price * added;
    const cat = item.category;
    costByCategory[cat] = (costByCategory[cat] || 0) + cost;
  });

  // Per-item consumption data
  const itemConsumption = stockItems.map(item => {
    const added = totalAddedByItem[item.id] || 0;
    const consumed = totalConsumedByItem[item.id] || 0;
    const remaining = item.quantity_in_stock;
    const pct = added > 0 ? Math.round((consumed / added) * 100) : 0;
    return { ...item, added, consumed, remaining, pct };
  });

  const cards = [
    { title: t('totalStock'), value: stats.totalStock, icon: Package, gradient: 'from-primary to-primary/80' },
    { title: t('lowStock'), value: stats.lowStock, icon: AlertTriangle, gradient: 'from-accent to-accent/80' },
    { title: t('activeEmployees'), value: stats.totalEmployees, icon: Users, gradient: 'from-success to-success/80' },
  ];

  const categoryNames: Record<string, string> = {
    safety_shoes: t('safetyShoes'),
    vests: t('vests'),
    helmets: t('helmets'),
    gloves: t('gloves'),
  };

  const itemGradients = [
    'from-primary to-primary/70',
    'from-accent to-accent/70',
    'from-success to-success/70',
    'from-ring to-ring/70',
    'from-primary/80 to-ring/60',
    'from-accent/80 to-success/60',
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('overview')}</h1>

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
              <p className="text-sm font-medium text-primary-foreground/80">{t('totalPurchaseCost')}</p>
              <p className="text-3xl font-bold text-primary-foreground">{totalPurchaseCost.toLocaleString()} {t('currency')}</p>
            </div>
            <DollarSign className="h-10 w-10 text-primary-foreground/60" />
          </div>
        </div>
      </Card>

      {/* Cost by category */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t('categoryCost')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(costByCategory).map(([cat, cost]) => (
              <div key={cat} className="rounded-lg border p-4 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{categoryNames[cat] || cat}</p>
                <p className="text-xl font-bold">{cost.toLocaleString()} {t('currency')}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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

      {stats.lowStock > 0 && (
        <Card className="border-accent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-accent-foreground">
              <AlertTriangle className="h-5 w-5" />
              {t('lowStockWarning')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{stats.lowStock} {t('stock')}</p>
          </CardContent>
        </Card>
      )}

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

      <Card>
        <CardHeader>
          <CardTitle>{t('recentActivity')}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">-</p>
          ) : (
            <div className="space-y-3">
              {recentAssignments.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{a.employees?.name}</p>
                    <p className="text-xs text-muted-foreground">{a.stock_items?.name} × {a.quantity_assigned}</p>
                  </div>
                  <StatusBadge status={a.status} t={t} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: (k: any) => string }) {
  const colors: Record<string, string> = {
    pending: 'bg-accent/20 text-accent-foreground',
    approved: 'bg-success/20 text-success',
    returned: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${colors[status] || ''}`}>
      {t(status as any)}
    </span>
  );
}
