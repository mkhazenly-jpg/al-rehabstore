import { supabase } from '@/integrations/supabase/client';

export const MASTER_ADMIN_EMAIL = 'm.khazenly@gmail.com';

export type PendingTable = 'stock_items' | 'employee_violations' | 'assignments';
export type PendingAction = 'update' | 'delete';

interface RequestArgs {
  table: PendingTable;
  recordId: string;
  action: PendingAction;
  payload?: Record<string, any> | null;
  snapshot?: Record<string, any> | null;
  description?: string;
}

/**
 * Convert any Supabase / fetch error into a clear Arabic message.
 * Detects network/offline/timeout failures and falls back to the original message.
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

/**
 * Insert a pending change request into the approval queue.
 * Returns { ok, error } so callers can show a toast.
 */
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

/** Returns true if the currently signed-in user is the master admin. */
export function isMasterAdminEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}
