import { supabase } from '@/integrations/supabase/client';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function authHeaders() {
  // Re-validate with the Auth server so a stale/expired local session
  // doesn't send a dead token to the edge function (causes 401).
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
  }
  return {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${session.access_token}`,
  };
}

export async function resetUserPassword(email: string, newPassword: string) {
  const headers = await authHeaders();
  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'reset-password', email, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function deleteUserById(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'delete-user', userId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}
