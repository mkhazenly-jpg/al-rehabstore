import { createFileRoute } from '@tanstack/react-router';
import { buildBackupBuffer } from '@/lib/backup-export.server';
import { uploadBackupToDrive } from '@/lib/google-drive.server';
import { createClient } from '@supabase/supabase-js';

// Direct REST insert to bypass any supabase-js client cold-start issues in the Worker.
// Uses the service role key, which bypasses RLS.
async function insertBackupLog(payload: Record<string, unknown>): Promise<void> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[auto-backup] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env');
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/backup_logs`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[auto-backup] backup_logs insert failed [${res.status}]:`, text);
    } else {
      console.log('[auto-backup] backup_logs row inserted', {
        status: payload.status,
        triggered_by: payload.triggered_by,
      });
    }
  } catch (err) {
    console.error('[auto-backup] backup_logs insert threw:', err);
  }
}

// Constant-time string comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorize(request: Request): Promise<{ ok: boolean; userId: string | null }> {
  // Allow cron with shared secret
  const cronSecret = process.env.CRON_SECRET;
  const providedCronSecret = request.headers.get('x-cron-secret');
  if (cronSecret && providedCronSecret && timingSafeEqual(cronSecret, providedCronSecret)) {
    return { ok: true, userId: null };
  }

  // Allow cron with Supabase anon key in apikey header (canonical pg_cron pattern)
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const providedApiKey = request.headers.get('apikey');
  if (anonKey && providedApiKey && timingSafeEqual(anonKey, providedApiKey)) {
    return { ok: true, userId: null };
  }


  // Allow authenticated admin users (manual trigger from UI)
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, userId: null };
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return { ok: false, userId: null };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return { ok: false, userId: null };

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return { ok: false, userId: null };
    const userId = userRes.user.id;
    const { data: roleRow, error: roleErr } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleErr || !roleRow) return { ok: false, userId: null };
    return { ok: true, userId };
  } catch (err) {
    console.error('[auto-backup] auth check failed:', err);
    return { ok: false, userId: null };
  }
}

// Cron-triggered endpoint: builds the full xlsx backup and uploads to Google Drive,
// keeping only the latest single backup file.
export const Route = createFileRoute('/api/public/hooks/auto-backup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authorize(request);
        if (!auth.ok) {
          return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const startedAt = Date.now();
        const triggeredBy = auth.userId ? 'manual' : 'cron';
        const triggeredByUser = auth.userId;

        try {
          const buffer = await buildBackupBuffer();
          const result = await uploadBackupToDrive(buffer);
          const elapsedMs = Date.now() - startedAt;

          await insertBackupLog({
            kind: 'drive',
            status: 'success',
            triggered_by: triggeredBy,
            triggered_by_user: triggeredByUser,
            file_name: result.fileName,
            file_id: result.fileId,
            web_view_link: result.webViewLink,
            size_bytes: buffer.length,
            elapsed_ms: elapsedMs,
            deleted_old: result.deletedOld,
          });

          console.log('[auto-backup] success', { ...result, sizeBytes: buffer.length, elapsedMs });
          return new Response(
            JSON.stringify({
              success: true,
              file: result.fileName,
              fileId: result.fileId,
              deletedOld: result.deletedOld,
              sizeBytes: buffer.length,
              elapsedMs,
              webViewLink: result.webViewLink,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const elapsedMs = Date.now() - startedAt;

          await insertBackupLog({
            kind: 'drive',
            status: 'error',
            triggered_by: triggeredBy,
            triggered_by_user: triggeredByUser,
            elapsed_ms: elapsedMs,
            error_message: message,
          });

          console.error('[auto-backup] failed:', message);
          return new Response(JSON.stringify({ success: false, error: 'Backup failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
