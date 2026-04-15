import { supabase } from '@/integrations/supabase/client';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`;

export async function resetUserPassword(email: string, newPassword: string) {
  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset-password', email, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

export async function deleteUserById(userId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ action: 'delete-user', userId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}
