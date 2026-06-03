import { supabase } from '@/integrations/supabase/client';

export const MASTER_ADMIN_EMAIL = 'm.khazenly@gmail.com';

export type PendingTable = 'stock_items' | 'stock_additions' | 'employee_violations' | 'assignments' | 'employees';
export type PendingAction = 'insert' | 'update' | 'delete';

interface RequestArgs {
  table: PendingTable;
  recordId: string;          // For insert: pre-generated UUID (use crypto.randomUUID())
  action: PendingAction;
  payload?: Record<string, any> | null;
  snapshot?: Record<string, any> | null;
  description?: string;
}

/**
 * Convert any Supabase / fetch error into a clear Arabic message.
 */
export function formatSupabaseError(err: any, lang: 'ar' | 'en' = 'ar'): string {
  const msg = err?.message || String(err || '');
  const lower = msg.toLowerCase();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (
    offline ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('aborted') ||
    lower.includes('timeout')
  ) {
    return lang === 'ar'
      ? 'فشل الاتصال بالخادم — تحقق من الإنترنت وحاول مرة أخرى'
      : 'Connection to server failed — check your internet and try again';
  }

  return msg || (lang === 'ar' ? 'حدث خطأ غير معروف' : 'Unknown error');
}

export async function requestPendingChange(args: RequestArgs): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle();

    const { error } = await supabase.from('pending_changes' as any).insert({
      table_name: args.table,
      record_id: args.recordId,
      action: args.action,
      payload: args.payload ?? null,
      snapshot: args.snapshot ?? null,
      description: args.description ?? null,
      requested_by: user.id,
      requested_by_email: profile?.email ?? null,
    });

    if (error) return { ok: false, error: formatSupabaseError(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatSupabaseError(e) };
  }
}

export function isMasterAdminEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}

/** Arabic labels for common fields shown in the pending diff view. */
export const FIELD_LABELS_AR: Record<string, string> = {
  // Common
  name: 'الاسم',
  notes: 'ملاحظات',
  status: 'الحالة',
  quantity_assigned: 'الكمية',
  quantity_in_stock: 'الكمية بالمخزن',
  quantity_added: 'الكمية المضافة',
  unit_price: 'سعر الوحدة',
  unit_price_at_addition: 'سعر الوحدة عند الإضافة',
  // Stock
  category: 'الفئة',
  size: 'المقاس',
  unit: 'الوحدة',
  location: 'الموقع',
  // Violations
  violation_description: 'وصف المخالفة',
  violation_location: 'مكان المخالفة',
  violation_date: 'تاريخ المخالفة',
  action_taken: 'الإجراء المتخذ',
  deduction_amount: 'مقدار الخصم',
  daily_wage: 'الأجر اليومي',
  // Assignment
  assignment_date: 'تاريخ التسليم',
  employee_id: 'الموظف',
  stock_item_id: 'الصنف',
  // Employee
  hire_date: 'تاريخ التعيين',
  termination_date: 'تاريخ الإنهاء',
  department: 'القسم',
  shift: 'الشفت',
  mobile: 'الموبايل',
  job_title: 'الوظيفة',
  emergency_contact: 'جهة الطوارئ',
};

/** Format a field value for display. */
export function formatFieldValue(key: string, value: any, lookups: { employees?: Record<string, string>; stock?: Record<string, string> } = {}): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'employee_id' && lookups.employees?.[value]) return lookups.employees[value];
  if (key === 'stock_item_id' && lookups.stock?.[value]) return lookups.stock[value];
  if (key.endsWith('_date') || key === 'violation_date' || key === 'assignment_date') {
    try {
      return new Date(value).toLocaleString('ar-EG');
    } catch { return String(value); }
  }
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  return String(value);
}
