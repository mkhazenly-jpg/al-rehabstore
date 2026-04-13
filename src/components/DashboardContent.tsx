import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, AlertTriangle, Users, ClipboardList } from 'lucide-react';

export function DashboardContent() {
  const { t } = useLanguage();
  const [stats, setStats] = useState({ totalStock: 0, lowStock: 0, activeEmployees: 0, activeAssignments: 0, pendingAssignments: 0 });
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const [stockRes, empRes, assignRes, recentRes] = await Promise.all([
      supabase.from('stock_items').select('quantity_in_stock'),
      supabase.from('employees').select('status'),
      supabase.from('assignments').select('status'),
      supabase.from('assignments').select('*, employees(name), stock_items(name)').order('created_at', { ascending: false }).limit(5),
    ]);

    const stockItems = stockRes.data || [];
    const employees = empRes.data || [];
    const assignments = assignRes.data || [];

    setStats({
      totalStock: stockItems.length,
      lowStock: stockItems.filter(i => i.quantity_in_stock < 5).length,
      activeEmployees: employees.filter(e => e.status === 'active').length,
      activeAssignments: assignments.filter(a => a.status === 'approved').length,
      pendingAssignments: assignments.filter(a => a.status === 'pending').length,
    });

    setRecentAssignments(recentRes.data || []);
  };

  const cards = [
    { title: t('totalStock'), value: stats.totalStock, icon: Package, gradient: 'from-primary to-primary/80' },
    { title: t('lowStock'), value: stats.lowStock, icon: AlertTriangle, gradient: 'from-accent to-accent/80' },
    { title: t('activeEmployees'), value: stats.activeEmployees, icon: Users, gradient: 'from-success to-success/80' },
    { title: t('activeAssignments'), value: stats.activeAssignments, icon: ClipboardList, gradient: 'from-ring to-ring/80' },
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

      {stats.lowStock > 0 && (
        <Card className="border-accent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-accent-foreground">
              <AlertTriangle className="h-5 w-5" />
              {t('lowStockWarning')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {stats.lowStock} {t('stock')}
            </p>
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
            <p className="text-sm text-muted-foreground">
              {stats.pendingAssignments} {t('assignments')}
            </p>
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
