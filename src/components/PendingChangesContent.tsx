import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, Trash2, Edit, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatSupabaseError } from '@/lib/pending-changes';

interface PendingRow {
  id: string;
  table_name: 'stock_items' | 'employee_violations' | 'assignments';
  record_id: string;
  action: 'update' | 'delete';
  payload: any;
  snapshot: any;
  description: string | null;
  status: string;
  requested_by: string;
  requested_by_email: string | null;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
}

const TABLE_LABEL_AR: Record<string, string> = {
  stock_items: 'المخزون',
  employee_violations: 'المخالفات',
  assignments: 'التسليمات',
};
const TABLE_LABEL_EN: Record<string, string> = {
  stock_items: 'Stock',
  employee_violations: 'Violations',
  assignments: 'Assignments',
};

export function PendingChangesContent() {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    const query = supabase.from('pending_changes' as any).select('*').order('created_at', { ascending: false });
    const { data, error } = filter === 'pending' ? await query.eq('status', 'pending') : await query.limit(100);
    if (error) toast.error(formatSupabaseError(error, lang));
    setRows((data as any[]) || []);
    setLoading(false);
  }, [filter, lang]);

  useEffect(() => { load(); }, [load]);

  const approve = async (row: PendingRow) => {
    setProcessingId(row.id);
    try {
      let execError: any = null;

      if (row.action === 'delete') {
        const { error } = await (supabase as any).from(row.table_name).delete().eq('id', row.record_id);
        execError = error;
      } else if (row.action === 'update' && row.payload) {
        const { error } = await (supabase as any).from(row.table_name).update(row.payload).eq('id', row.record_id);
        execError = error;
      }

      if (execError) {
        toast.error(formatSupabaseError(execError, lang));
        return;
      }

      const { error: updErr } = await supabase
        .from('pending_changes' as any)
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (updErr) {
        toast.error(formatSupabaseError(updErr, lang));
        return;
      }

      toast.success(lang === 'ar' ? 'تمت الموافقة وتنفيذ الطلب' : 'Approved and applied');
      load();
    } catch (e) {
      toast.error(formatSupabaseError(e, lang));
    } finally {
      setProcessingId(null);
    }
  };

  const reject = async (row: PendingRow) => {
    setProcessingId(row.id);
    try {
      const { error } = await supabase
        .from('pending_changes' as any)
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) {
        toast.error(formatSupabaseError(error, lang));
        return;
      }
      toast.success(lang === 'ar' ? 'تم رفض الطلب' : 'Rejected');
      load();
    } finally {
      setProcessingId(null);
    }
  };

  const renderPayload = (row: PendingRow) => {
    if (row.action === 'delete') {
      const snap = row.snapshot || {};
      const label = snap.name || snap.violation_description || snap.employee_name || row.record_id.slice(0, 8);
      return <span className="text-destructive">{lang === 'ar' ? `حذف: ${label}` : `Delete: ${label}`}</span>;
    }
    const p = row.payload || {};
    const fields = Object.entries(p).slice(0, 6);
    return (
      <div className="space-y-1">
        {fields.map(([k, v]) => (
          <div key={k} className="text-xs">
            <span className="font-semibold">{k}:</span>{' '}
            <span className="text-muted-foreground">{String(v ?? '—')}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{lang === 'ar' ? 'الطلبات المعلقة للموافقة' : 'Pending Approval Requests'}</h1>
        <div className="flex gap-2">
          <Button size="sm" variant={filter === 'pending' ? 'default' : 'outline'} onClick={() => setFilter('pending')}>
            {lang === 'ar' ? 'المعلقة' : 'Pending'}
          </Button>
          <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>
            {lang === 'ar' ? 'الكل' : 'All'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <AlertCircle className="mb-2 h-10 w-10 opacity-50" />
            <p>{lang === 'ar' ? 'لا توجد طلبات' : 'No requests'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className={row.status === 'pending' ? 'border-amber-500/50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {row.action === 'delete' ? <Trash2 className="h-4 w-4 text-destructive" /> : <Edit className="h-4 w-4 text-primary" />}
                    <span>{lang === 'ar' ? TABLE_LABEL_AR[row.table_name] : TABLE_LABEL_EN[row.table_name]}</span>
                    <Badge variant="outline">{lang === 'ar' ? (row.action === 'delete' ? 'حذف' : 'تعديل') : row.action}</Badge>
                    <Badge
                      variant={row.status === 'pending' ? 'secondary' : row.status === 'approved' ? 'default' : 'destructive'}
                    >
                      {lang === 'ar'
                        ? row.status === 'pending'
                          ? 'معلق'
                          : row.status === 'approved'
                            ? 'موافَق'
                            : 'مرفوض'
                        : row.status}
                    </Badge>
                  </CardTitle>
                  <div className="text-xs text-muted-foreground">
                    {row.requested_by_email} • {new Date(row.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {row.description && <p className="text-sm text-muted-foreground">{row.description}</p>}
                <div className="rounded-md border bg-muted/30 p-3">{renderPayload(row)}</div>
                {row.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve(row)} disabled={processingId === row.id}>
                      <Check className="h-4 w-4 me-1" />
                      {lang === 'ar' ? 'موافقة وتنفيذ' : 'Approve & Apply'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reject(row)} disabled={processingId === row.id}>
                      <X className="h-4 w-4 me-1" />
                      {lang === 'ar' ? 'رفض' : 'Reject'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
