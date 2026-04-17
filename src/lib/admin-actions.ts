import { supabase } from '@/integrations/supabase/client';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
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
