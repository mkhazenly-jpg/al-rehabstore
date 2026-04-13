import { createServerFn } from '@tanstack/react-start';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const seedAdminUser = createServerFn({ method: 'POST' })
  .handler(async () => {
    const email = 'm.khazenly@gmail.com';
    const password = 'Aa500500';

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    if (existingUser) {
      // Just ensure they're admin and approved
      await supabaseAdmin.from('profiles').update({ is_approved: true }).eq('user_id', existingUser.id);
      await supabaseAdmin.from('user_roles').upsert({ user_id: existingUser.id, role: 'admin' }, { onConflict: 'user_id,role' });
      return { success: true, message: 'Admin user already exists, updated permissions' };
    }

    // Create user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Admin' },
    });

    if (authError) return { success: false, message: authError.message };

    // The trigger should create profile + staff role. We update to admin + approved
    await supabaseAdmin.from('profiles').update({ is_approved: true }).eq('user_id', authData.user.id);
    await supabaseAdmin.from('user_roles').update({ role: 'admin' }).eq('user_id', authData.user.id);

    return { success: true, message: 'Admin user created' };
  });
