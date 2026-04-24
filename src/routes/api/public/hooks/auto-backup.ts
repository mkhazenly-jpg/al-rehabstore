import { createFileRoute } from '@tanstack/react-router';
import { buildBackupBuffer } from '@/lib/backup-export.server';
import { uploadBackupToDrive } from '@/lib/google-drive.server';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

// Cron-triggered endpoint: builds the full xlsx backup and uploads to Google Drive,
// keeping only the latest single backup file.
export const Route = createFileRoute('/api/public/hooks/auto-backup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        // 'manual' if header set by UI, otherwise treat as cron
        const triggeredBy = request.headers.get('x-trigger-source') === 'manual' ? 'manual' : 'cron';
        const triggeredByUser = request.headers.get('x-triggered-by-user') || null;

        try {
          const buffer = await buildBackupBuffer();
          const result = await uploadBackupToDrive(buffer);
          const elapsedMs = Date.now() - startedAt;

          // Log success
          try {
            const { error: insErr } = await supabaseAdmin.from('backup_logs').insert({
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
            if (insErr) {
              console.error('[auto-backup] insert success log returned error:', insErr);
            } else {
              console.log('[auto-backup] success log inserted', { triggeredBy });
            }
          } catch (logErr) {
            console.error('[auto-backup] failed to log success (threw):', logErr);
          }

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

          // Log failure
          try {
            const { error: insErr } = await supabaseAdmin.from('backup_logs').insert({
              kind: 'drive',
              status: 'error',
              triggered_by: triggeredBy,
              triggered_by_user: triggeredByUser,
              elapsed_ms: elapsedMs,
              error_message: message,
            });
            if (insErr) {
              console.error('[auto-backup] insert error log returned error:', insErr);
            }
          } catch (logErr) {
            console.error('[auto-backup] failed to log error (threw):', logErr);
          }

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
