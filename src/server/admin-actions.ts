import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const resetUserPassword = createServerFn({ method: 'POST' })
  .inputValidator((input: { email: string; newPassword: string }) => {
    if (!input.email || !input.newPassword || input.newPassword.length < 6) {
      throw new Error('Invalid input');
    }
    return input;
  })
  .handler(async ({ data }) => {
    // Find user by email
    const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);

    const user = users.users.find(u => u.email === data.email);
    if (!user) throw new Error('USER_NOT_FOUND');

    // Update password
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);

    return { success: true };
  });

export const deleteUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input.userId) throw new Error('Invalid input');
    return input;
  })
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', context.userId)
      .maybeSingle();

    if (roleData?.role !== 'admin') {
      throw new Error('Unauthorized');
    }

    // Delete profile and role first (cascade should handle, but be safe)
    await supabaseAdmin.from('profiles').delete().eq('user_id', data.userId);
    await supabaseAdmin.from('user_roles').delete().eq('user_id', data.userId);

    // Delete from auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    return { success: true };
  });
