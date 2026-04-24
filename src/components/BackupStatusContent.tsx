import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Cloud,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  History,
  Trash2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

type BackupLog = {
  id: string;
  kind: string;
  status: 'success' | 'error' | string;
  triggered_by: string | null;
  file_name: string | null;
  web_view_link: string | null;
  size_bytes: number | null;
  elapsed_ms: number | null;
  deleted_old: number | null;
  error_message: string | null;
  created_at: string;
};

export function BackupStatusContent() {
  const { t, lang } = useLanguage();
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  const loadLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('backup_logs' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      toast.error(error.message);
    } else {
      setLogs((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const runBackupNow = async () => {
    setRunning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch('/api/public/hooks/auto-backup', {
        method: 'POST',
        headers: {
          'x-trigger-source': 'manual',
          ...(user?.id ? { 'x-triggered-by-user': user.id } : {}),
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t('driveBackupSuccess'));
      } else {
        toast.error(data.error || t('driveBackupError'));
      }
    } catch (err: any) {
      toast.error(err?.message || t('driveBackupError'));
    }
    setRunning(false);
    loadLogs();
  };

  const deleteLog = async (id: string) => {
    const { error } = await supabase.from('backup_logs' as any).delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const last = logs[0];
  const lastSuccess = logs.find((l) => l.status === 'success');
  const lastFailure = logs.find((l) => l.status === 'error');

  const fmtBytes = (b: number | null) => (b == null ? '—' : `${(b / 1024).toFixed(1)} KB`);
  const fmtMs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)}s`);
  const fmtDate = (d: string) => new Date(d).toLocaleString(locale);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t('backupStatus')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 me-1 ${loading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
          <Button onClick={runBackupNow} disabled={running}>
            <Cloud className="h-4 w-4 me-1" />
            {running ? t('runningBackup') : t('runBackupNow')}
          </Button>
        </div>
      </div>

      {/* Last status hero card */}
      <Card
        className={`border-2 ${
          last
            ? last.status === 'success'
              ? 'border-success/50 bg-success/5'
              : 'border-destructive/50 bg-destructive/5'
            : 'border-border'
        }`}
      >
        <CardContent className="p-5">
          {!last ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>{t('noBackupsYet')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {last.status === 'success' ? (
                  <>
                    <CheckCircle2 className="h-7 w-7 text-success" />
                    <h2 className="text-xl font-bold text-success">{t('lastBackupSuccess')}</h2>
                  </>
                ) : (
                  <>
                    <XCircle className="h-7 w-7 text-destructive" />
                    <h2 className="text-xl font-bold text-destructive">{t('lastBackupFailed')}</h2>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="font-medium text-foreground">{t('lastBackupAt')}: </span>
                  <span className="text-muted-foreground">{fmtDate(last.created_at)}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">{t('triggerSource')}: </span>
                  <span className="text-muted-foreground">
                    {last.triggered_by === 'manual' ? t('triggerManual') : t('triggerCron')}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-foreground">{t('duration')}: </span>
                  <span className="text-muted-foreground">{fmtMs(last.elapsed_ms)}</span>
                </div>

                {last.status === 'success' && (
                  <>
                    {last.file_name && (
                      <div className="sm:col-span-2">
                        <span className="font-medium text-foreground">{t('fileName')}: </span>
                        <span className="text-muted-foreground break-all">{last.file_name}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-foreground">{t('fileSize')}: </span>
                      <span className="text-muted-foreground">{fmtBytes(last.size_bytes)}</span>
                    </div>
                    {typeof last.deleted_old === 'number' && (
                      <div>
                        <span className="font-medium text-foreground">{t('deletedOldFiles')}: </span>
                        <span className="text-muted-foreground">{last.deleted_old}</span>
                      </div>
                    )}
                    {last.web_view_link && (
                      <div className="sm:col-span-3">
                        <a
                          href={last.web_view_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {t('openInDrive')}
                        </a>
                      </div>
                    )}
                  </>
                )}

                {last.status === 'error' && last.error_message && (
                  <div className="sm:col-span-3 mt-1">
                    <span className="font-medium text-foreground">{t('errorMessage')}: </span>
                    <span className="text-destructive break-all">{last.error_message}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('totalAttempts')}</div>
            <div className="text-2xl font-bold mt-1">{logs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('lastSuccess')}</div>
            <div className="text-sm font-medium mt-1 text-success">
              {lastSuccess ? fmtDate(lastSuccess.created_at) : '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('lastFailure')}</div>
            <div className="text-sm font-medium mt-1 text-destructive">
              {lastFailure ? fmtDate(lastFailure.created_at) : '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('createdAt')}</TableHead>
                  <TableHead>{t('triggerSource')}</TableHead>
                  <TableHead>{t('fileName')}</TableHead>
                  <TableHead>{t('fileSize')}</TableHead>
                  <TableHead>{t('duration')}</TableHead>
                  <TableHead>{t('details')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                      {loading ? '...' : t('noBackupsYet')}
                    </TableCell>
                  </TableRow>
                )}
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-1 text-xs font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          {t('success')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2 py-1 text-xs font-medium">
                          <XCircle className="h-3 w-3" />
                          {t('failed')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDate(log.created_at)}</TableCell>
                    <TableCell className="text-sm">
                      {log.triggered_by === 'manual' ? t('triggerManual') : t('triggerCron')}
                    </TableCell>
                    <TableCell className="text-sm break-all max-w-[200px]">
                      {log.file_name || '—'}
                    </TableCell>
                    <TableCell className="text-sm">{fmtBytes(log.size_bytes)}</TableCell>
                    <TableCell className="text-sm">{fmtMs(log.elapsed_ms)}</TableCell>
                    <TableCell className="text-sm max-w-[260px]">
                      {log.status === 'success' ? (
                        log.web_view_link ? (
                          <a
                            href={log.web_view_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t('openInDrive')}
                          </a>
                        ) : (
                          '—'
                        )
                      ) : (
                        <span className="text-destructive break-all">{log.error_message || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteLog(log.id)}
                        title={t('delete')}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
