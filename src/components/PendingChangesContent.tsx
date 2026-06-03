import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, Trash2, Edit, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatSupabaseError, FIELD_LABELS_AR, formatFieldValue } from '@/lib/pending-changes';

interface PendingRow {
  id: string;
  table_name: 'stock_items' | 'stock_additions' | 'employee_violations' | 'assignments' | 'employees';
  record_id: string;
  action: 'insert' | 'update' | 'delete';
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
  stock_items: 'المخزون (صنف)',
  stock_additions: 'إضافة مخزون',
  employee_violations: 'المخالفات',
  assignments: 'التسليمات',
  employees: 'الموظفين',
};

const ACTION_LABEL_AR: Record<string, string> = {
  insert: 'إضافة جديدة',
  update: 'تعديل',
  delete: 'حذف',
};

export function PendingChangesContent() {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [employees, setEmployees] = useState<Record<string, string>>({});
  const [stock, setStock] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const query = supabase.from('pending_changes' as any).select('*').order('created_at', { ascending: false });
    const [pendingRes, empRes, stockRes] = await Promise.all([
      filter === 'pending' ? query.eq('status', 'pending') : query.limit(200),
      supabase.from('employees').select('id, name'),
      supabase.from('stock_items').select('id, name, size, category'),
    ]);
    if (pendingRes.error) toast.error(formatSupabaseError(pendingRes.error, lang));
    setRows((pendingRes.data as any[]) || []);
    const emp: Record<string, string> = {};
    (empRes.data || []).forEach((e: any) => { emp[e.id] = e.name; });
    setEmployees(emp);
    const st: Record<string, string> = {};
    (stockRes.data || []).forEach((s: any) => {
      st[s.id] = `${s.name} ${s.size && s.size !== 'N/A' ? `(${s.size})` : ''} - ${s.category}`.trim();
    });
    setStock(st);
    setLoading(false);
  }, [filter, lang]);

  useEffect(() => { load(); }, [load]);

  const lookups = useMemo(() => ({ employees, stock }), [employees, stock]);

  const approve = async (row: PendingRow) => {
    setProcessingId(row.id);
    try {
      let execError: any = null;
      let postRpcError: any = null;

      if (row.action === 'delete') {
        if (row.table_name === 'assignments') {
          // Return stock first if it was approved
          const { data: a } = await supabase.from('assignments').select('status').eq('id', row.record_id).maybeSingle();
          if (a?.status === 'approved') {
            const { error: retErr } = await supabase.rpc('return_with_fifo', { _assignment_id: row.record_id });
            if (retErr) { toast.error(formatSupabaseError(retErr, lang)); setProcessingId(null); return; }
          }
        }
        const { error } = await (supabase as any).from(row.table_name).delete().eq('id', row.record_id);
        execError = error;
      } else if (row.action === 'update' && row.payload) {
        if (row.table_name === 'assignments') {
          // Return current then re-assign with new payload via FIFO
          const { data: a } = await supabase.from('assignments').select('status').eq('id', row.record_id).maybeSingle();
          if (a?.status === 'approved') {
            const { error: retErr } = await supabase.rpc('return_with_fifo', { _assignment_id: row.record_id });
            if (retErr) { toast.error(formatSupabaseError(retErr, lang)); setProcessingId(null); return; }
          }
          const { error: updErr } = await (supabase as any).from('assignments').update({ ...row.payload, status: 'pending' }).eq('id', row.record_id);
          if (updErr) { toast.error(formatSupabaseError(updErr, lang)); setProcessingId(null); return; }
          const { error: appErr } = await supabase.rpc('assign_with_fifo', { _assignment_id: row.record_id });
          if (appErr) postRpcError = appErr;
        } else {
          const { error } = await (supabase as any).from(row.table_name).update(row.payload).eq('id', row.record_id);
          execError = error;
        }
      } else if (row.action === 'insert' && row.payload) {
        // Insert with the pre-generated id so subsequent FIFO can find it
        const payloadWithId = { ...row.payload, id: row.record_id };
        const { error } = await (supabase as any).from(row.table_name).insert(payloadWithId);
        execError = error;
        // Assignments: also perform FIFO to deduct stock
        if (!execError && row.table_name === 'assignments') {
          const { error: appErr } = await supabase.rpc('assign_with_fifo', { _assignment_id: row.record_id });
          if (appErr) postRpcError = appErr;
        }
        // Stock additions: bump stock_items.quantity_in_stock by quantity_added
        if (!execError && row.table_name === 'stock_additions' && row.payload.stock_item_id && row.payload.quantity_added) {
          const { data: cur } = await supabase.from('stock_items').select('quantity_in_stock').eq('id', row.payload.stock_item_id).maybeSingle();
          if (cur) {
            await supabase.from('stock_items').update({ quantity_in_stock: cur.quantity_in_stock + Number(row.payload.quantity_added) }).eq('id', row.payload.stock_item_id);
          }
        }
      }

      if (execError) {
        toast.error(formatSupabaseError(execError, lang));
        setProcessingId(null);
        return;
      }
      if (postRpcError) {
        toast.error(formatSupabaseError(postRpcError, lang));
      }

      const { error: updErr } = await supabase
        .from('pending_changes' as any)
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', row.id);

      if (updErr) {
        toast.error(formatSupabaseError(updErr, lang));
        return;
      }

      toast.success('تمت الموافقة وتنفيذ الطلب');
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
      if (error) { toast.error(formatSupabaseError(error, lang)); return; }
      toast.success('تم رفض الطلب');
      load();
    } finally {
      setProcessingId(null);
    }
  };

  // Resolve a friendly subject label (employee name, stock item name, etc.)
  const getSubjectLabel = (row: PendingRow): string => {
    const data = { ...(row.snapshot || {}), ...(row.payload || {}) };
    if (data.employee_id && employees[data.employee_id]) return employees[data.employee_id];
    if (data.stock_item_id && stock[data.stock_item_id]) return stock[data.stock_item_id];
    if (data.name) return String(data.name);
    if (data.violation_description) return String(data.violation_description).slice(0, 50);
    return row.record_id.slice(0, 8);
  };

  const renderDiff = (row: PendingRow) => {
    if (row.action === 'insert') {
      const p = row.payload || {};
      const fields = Object.entries(p).filter(([k]) => k !== 'id' && k !== 'created_by' && FIELD_LABELS_AR[k]);
      return (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-success">القيم الجديدة:</div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {fields.map(([k, v]) => (
              <div key={k} className="flex gap-2 rounded-md bg-success/5 p-2 text-xs">
                <span className="font-semibold text-muted-foreground">{FIELD_LABELS_AR[k]}:</span>
                <span>{formatFieldValue(k, v, lookups)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (row.action === 'delete') {
      const snap = row.snapshot || {};
      const fields = Object.entries(snap).filter(([k]) => FIELD_LABELS_AR[k]);
      return (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-destructive">سيتم حذف:</div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {fields.length > 0 ? fields.map(([k, v]) => (
              <div key={k} className="flex gap-2 rounded-md bg-destructive/5 p-2 text-xs">
                <span className="font-semibold text-muted-foreground">{FIELD_LABELS_AR[k]}:</span>
                <span>{formatFieldValue(k, v, lookups)}</span>
              </div>
            )) : <div className="text-xs text-muted-foreground">حذف السجل</div>}
          </div>
        </div>
      );
    }
    // update
    const before = row.snapshot || {};
    const after = row.payload || {};
    const keys = Array.from(new Set([...Object.keys(after)])).filter(k => FIELD_LABELS_AR[k]);
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">المقارنة قبل وبعد التعديل:</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="border p-2 text-start">الحقل</th>
                <th className="border p-2 text-start text-destructive">قبل</th>
                <th className="border p-2 text-start text-success">بعد</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const beforeVal = formatFieldValue(k, before[k], lookups);
                const afterVal = formatFieldValue(k, after[k], lookups);
                const changed = beforeVal !== afterVal;
                return (
                  <tr key={k} className={changed ? 'bg-amber-500/5' : ''}>
                    <td className="border p-2 font-semibold">{FIELD_LABELS_AR[k]}</td>
                    <td className="border p-2 text-destructive/80">{beforeVal}</td>
                    <td className="border p-2 text-success">{afterVal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">الطلبات المعلقة للموافقة</h1>
        <div className="flex gap-2">
          <Button size="sm" variant={filter === 'pending' ? 'default' : 'outline'} onClick={() => setFilter('pending')}>
            المعلقة
          </Button>
          <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>
            الكل
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
            <p>لا توجد طلبات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const ActionIcon = row.action === 'delete' ? Trash2 : row.action === 'insert' ? Plus : Edit;
            const iconClass = row.action === 'delete' ? 'text-destructive' : row.action === 'insert' ? 'text-success' : 'text-primary';
            return (
              <Card key={row.id} className={row.status === 'pending' ? 'border-amber-500/50' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <ActionIcon className={`h-4 w-4 ${iconClass}`} />
                      <span>{TABLE_LABEL_AR[row.table_name]}</span>
                      <Badge variant="outline">{ACTION_LABEL_AR[row.action]}</Badge>
                      <Badge
                        variant={row.status === 'pending' ? 'secondary' : row.status === 'approved' ? 'default' : 'destructive'}
                      >
                        {row.status === 'pending' ? 'معلق' : row.status === 'approved' ? 'موافَق' : 'مرفوض'}
                      </Badge>
                      <span className="text-sm font-normal text-muted-foreground">→</span>
                      <span className="text-sm font-bold text-primary">{getSubjectLabel(row)}</span>
                    </CardTitle>
                    <div className="text-xs text-muted-foreground">
                      {row.requested_by_email} • {new Date(row.created_at).toLocaleString('ar-EG')}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {row.description && <p className="text-sm font-medium">{row.description}</p>}
                  <div className="rounded-md border bg-muted/20 p-3">{renderDiff(row)}</div>
                  {row.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approve(row)} disabled={processingId === row.id}>
                        <Check className="h-4 w-4 me-1" />
                        موافقة وتنفيذ
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reject(row)} disabled={processingId === row.id}>
                        <X className="h-4 w-4 me-1" />
                        رفض
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
