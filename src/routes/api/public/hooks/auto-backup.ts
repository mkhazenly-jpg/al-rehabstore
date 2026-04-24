import { createFileRoute } from '@tanstack/react-router';
import { buildBackupBuffer } from '@/lib/backup-export.server';
import { uploadBackupToDrive } from '@/lib/google-drive.server';

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

// Cron-triggered endpoint: builds the full xlsx backup and uploads to Google Drive,
// keeping only the latest single backup file.
export const Route = createFileRoute('/api/public/hooks/auto-backup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const triggeredBy = request.headers.get('x-trigger-source') === 'manual' ? 'manual' : 'cron';
        const triggeredByUser = request.headers.get('x-triggered-by-user') || null;

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
          return new Response(JSON.stringify({ success: false, error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
