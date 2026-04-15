import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { action, email, newPassword, userId } = await req.json();

    if (action === "reset-password") {
      // Find user by email
      const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) throw listErr;

      const user = users.users.find((u: any) => u.email === email);
      if (!user) {
        return new Response(JSON.stringify({ error: "USER_NOT_FOUND" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-user") {
      // Verify caller is admin via auth header
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { authorization: authHeader } },
      });
      const { data: { user: caller } } = await userClient.auth.getUser();
      if (!caller) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check admin role
      const { data: roleData } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id)
        .maybeSingle();

      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete profile, role, then auth user
      await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
