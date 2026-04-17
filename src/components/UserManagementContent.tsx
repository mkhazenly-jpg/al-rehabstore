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
import { Check, X, Shield, Trash2, Lock, Key } from 'lucide-react';

const PROTECTED_EMAIL = 'm.khazenly@gmail.com';

export function UserManagementContent() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const isProtectedAdmin = profile?.email === PROTECTED_EMAIL;
  const [users, setUsers] = useState<any[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ email: string; name: string } | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [resetting, setResetting] = useState(false);

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
                      ) : (
                      <Select value={user.role} onValueChange={(v: any) => changeRole(user.user_id, v)}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{t('admin')}</SelectItem>
                          <SelectItem value="staff">{t('staff')}</SelectItem>
                        </SelectContent>
                      </Select>
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
                      ) : (
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
                        {isProtectedAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setResetTarget({ email: user.email, name: user.full_name || user.email }); setNewPwd(''); }}
                          >
                            <Key className="h-4 w-4 me-1 text-primary" />
                            {t('resetPassword')}
                          </Button>
                        )}
                      </div>
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
