import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { deleteUserById, resetUserPassword } from '@/lib/admin-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Check, X, Shield, Trash2, Lock, Key, AlertTriangle, Download, Cloud, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
import { exportFullBackup } from '@/lib/backup-export';

type DriveBackupResult = {
  success: boolean;
  file?: string;
  fileId?: string;
  webViewLink?: string;
  deletedOld?: number;
  sizeBytes?: number;
  elapsedMs?: number;
  error?: string;
  at?: string;
};

const PROTECTED_EMAIL = 'm.khazenly@gmail.com';

export function UserManagementContent() {
  const { t, lang } = useLanguage();
  const { profile } = useAuth();
  const isProtectedAdmin = profile?.email === PROTECTED_EMAIL;
  const [backingUp, setBackingUp] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ email: string; name: string } | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [resetting, setResetting] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [wiping, setWiping] = useState(false);
  const [driveRunning, setDriveRunning] = useState(false);
  const [driveResult, setDriveResult] = useState<DriveBackupResult | null>(null);

  const handleDriveBackup = async () => {
    setDriveRunning(true);
    setDriveResult(null);
    try {
      const res = await fetch('/api/public/hooks/auto-backup', { method: 'POST' });
      const data = (await res.json()) as DriveBackupResult;
      const result: DriveBackupResult = { ...data, at: new Date().toISOString() };
      setDriveResult(result);
      if (res.ok && data.success) {
        toast.success(t('driveBackupSuccess'));
      } else {
        toast.error(data.error || t('driveBackupError'));
      }
    } catch (err: any) {
      const msg = err?.message || t('driveBackupError');
      setDriveResult({ success: false, error: msg, at: new Date().toISOString() });
      toast.error(msg);
    }
    setDriveRunning(false);
  };

  const handleWipeAll = async () => {
    if (wipeConfirm !== 'DELETE') return;
    setWiping(true);
    try {
      const { error } = await supabase.rpc('wipe_all_data' as any);
      if (error) throw error;
      toast.success(t('wipeAllDataSuccess'));
      setWipeOpen(false);
      setWipeConfirm('');
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    }
    setWiping(false);
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      await exportFullBackup({ lang, t: t as (k: string) => string });
      toast.success(t('backupSuccess'));
    } catch (err: any) {
      toast.error(err?.message || t('backupError'));
    }
    setBackingUp(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: roles } = await supabase.from('user_roles').select('*');
    const merged = (profiles || []).map(p => ({
      ...p,
      role: roles?.find(r => r.user_id === p.user_id)?.role || 'staff',
    }));
    setUsers(merged);
  };

  const toggleApproval = async (userId: string, currentlyApproved: boolean) => {
    await supabase.from('profiles').update({ is_approved: !currentlyApproved }).eq('user_id', userId);
    loadUsers();
  };

  const changeRole = async (userId: string, newRole: 'admin' | 'staff') => {
    await supabase.from('user_roles').update({ role: newRole }).eq('user_id', userId);
    loadUsers();
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm(t('confirm') + '?')) return;
    setDeleting(userId);
    try {
      await deleteUserById(userId);
      loadUsers();
    } catch (err) {
      console.error('Delete user error:', err);
    }
    setDeleting(null);
  };

  const handleResetPassword = async () => {
    if (!resetTarget || newPwd.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setResetting(true);
    try {
      await resetUserPassword(resetTarget.email, newPwd);
      toast.success(t('passwordUpdated'));
      setResetTarget(null);
      setNewPwd('');
    } catch (err: any) {
      const msg = err.message || 'Failed';
      if (msg.toLowerCase().includes('weak') || msg.toLowerCase().includes('pwned')) {
        toast.error('كلمة المرور ضعيفة أو مسربة. استخدم كلمة أقوى (8+ أحرف، أرقام ورموز).');
      } else {
        toast.error(msg);
      }
    }
    setResetting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{t('userManagement')}</h1>
      </div>

      <Card className="border-primary/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Download className="h-6 w-6 text-primary shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-primary">{t('fullBackup')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('fullBackupDesc')}</p>
            </div>
            <Button onClick={handleBackup} disabled={backingUp}>
              <Download className="h-4 w-4 me-1" />
              {backingUp ? t('preparingBackup') : t('downloadBackup')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <Cloud className="h-6 w-6 text-primary shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-primary">{t('driveBackup')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('driveBackupDesc')}</p>
            </div>
            <Button onClick={handleDriveBackup} disabled={driveRunning}>
              <Cloud className="h-4 w-4 me-1" />
              {driveRunning ? t('runningBackup') : t('runBackupNow')}
            </Button>
          </div>

          {driveResult && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                driveResult.success
                  ? 'border-success/40 bg-success/10'
                  : 'border-destructive/40 bg-destructive/10'
              }`}
            >
              <div className="flex items-center gap-2 font-medium mb-2">
                {driveResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-success">{t('driveBackupSuccess')}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">{t('driveBackupError')}</span>
                  </>
                )}
              </div>

              {driveResult.success ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  {driveResult.file && (
                    <div><span className="font-medium text-foreground">{t('fileName')}:</span> {driveResult.file}</div>
                  )}
                  {typeof driveResult.sizeBytes === 'number' && (
                    <div><span className="font-medium text-foreground">{t('fileSize')}:</span> {(driveResult.sizeBytes / 1024).toFixed(1)} KB</div>
                  )}
                  {typeof driveResult.elapsedMs === 'number' && (
                    <div><span className="font-medium text-foreground">{t('duration')}:</span> {(driveResult.elapsedMs / 1000).toFixed(2)}s</div>
                  )}
                  {typeof driveResult.deletedOld === 'number' && (
                    <div><span className="font-medium text-foreground">{t('deletedOldFiles')}:</span> {driveResult.deletedOld}</div>
                  )}
                  {driveResult.at && (
                    <div className="sm:col-span-2">
                      <span className="font-medium text-foreground">{t('lastBackupAt')}:</span>{' '}
                      {new Date(driveResult.at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                    </div>
                  )}
                  {driveResult.webViewLink && (
                    <div className="sm:col-span-2 mt-2">
                      <a
                        href={driveResult.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t('openInDrive')}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-destructive/90 break-all">{driveResult.error}</p>
              )}
            </div>
          )}</CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('fullName')}</TableHead>
                  <TableHead>{t('email')}</TableHead>
                  <TableHead>{t('role')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => {
                  const isProtected = user.email === PROTECTED_EMAIL;
                  return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name || '-'}
                      {isProtected && <Lock className="inline h-4 w-4 ms-1 text-primary" />}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {isProtected ? (
                        <span className="text-sm font-medium">{t('admin')}</span>
                      ) : isProtectedAdmin ? (
                      <Select value={user.role} onValueChange={(v: any) => changeRole(user.user_id, v)}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{t('admin')}</SelectItem>
                          <SelectItem value="staff">{t('staff')}</SelectItem>
                        </SelectContent>
                      </Select>
                      ) : (
                        <span className="text-sm">{user.role === 'admin' ? t('admin') : t('staff')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        user.is_approved ? 'bg-success/20 text-success' : 'bg-accent/20 text-accent-foreground'
                      }`}>
                        {user.is_approved ? t('active') : t('pendingApproval')}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isProtected ? (
                        <span className="text-xs text-muted-foreground">{t('protectedAccount')}</span>
                      ) : isProtectedAdmin ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleApproval(user.user_id, user.is_approved)}
                        >
                          {user.is_approved ? (
                            <><X className="h-4 w-4 me-1 text-destructive" />{t('rejectUser')}</>
                          ) : (
                            <><Check className="h-4 w-4 me-1 text-success" />{t('approveUser')}</>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteUser(user.user_id)}
                          disabled={deleting === user.user_id}
                        >
                          <Trash2 className="h-4 w-4 me-1 text-destructive" />
                          {t('delete')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setResetTarget({ email: user.email, name: user.full_name || user.email }); setNewPwd(''); }}
                        >
                          <Key className="h-4 w-4 me-1 text-primary" />
                          {t('resetPassword')}
                        </Button>
                      </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {isProtectedAdmin && (
        <Card className="border-destructive/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-1" />
              <div className="flex-1">
                <h2 className="text-lg font-bold text-destructive">{t('dangerZone')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t('wipeAllDataDesc')}</p>
              </div>
              <Button variant="destructive" onClick={() => { setWipeOpen(true); setWipeConfirm(''); }}>
                <Trash2 className="h-4 w-4 me-1" />
                {t('wipeAllData')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={wipeOpen} onOpenChange={(o) => { setWipeOpen(o); if (!o) setWipeConfirm(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t('wipeAllData')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm">{t('wipeAllDataConfirm')}</p>
            <Input
              placeholder={t('typeDeleteToConfirm')}
              value={wipeConfirm}
              onChange={(e) => setWipeConfirm(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWipeOpen(false)} disabled={wiping}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleWipeAll} disabled={wiping || wipeConfirm !== 'DELETE'}>
              {wiping ? '...' : t('wipeAllData')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('resetPassword')} — {resetTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-pwd">{t('newPassword')}</Label>
            <Input
              id="new-pwd"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              minLength={6}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetting}>
              {t('cancel')}
            </Button>
            <Button onClick={handleResetPassword} disabled={resetting || newPwd.length < 6}>
              {resetting ? '...' : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
