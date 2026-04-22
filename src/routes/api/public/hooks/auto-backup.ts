import { createFileRoute } from '@tanstack/react-router';
import { buildBackupBuffer } from '@/lib/backup-export.server';
import { uploadBackupToDrive } from '@/lib/google-drive.server';

// Cron-triggered endpoint: builds the full xlsx backup and uploads to Google Drive,
// keeping only the latest single backup file.
export const Route = createFileRoute('/api/public/hooks/auto-backup')({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();
        try {
          const buffer = await buildBackupBuffer();
          const result = await uploadBackupToDrive(buffer);
          const elapsedMs = Date.now() - startedAt;
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
