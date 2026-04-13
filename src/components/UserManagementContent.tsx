import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Shield } from 'lucide-react';

export function UserManagementContent() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);

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
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name || '-'}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Select value={user.role} onValueChange={(v: any) => changeRole(user.user_id, v)}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{t('admin')}</SelectItem>
                          <SelectItem value="staff">{t('staff')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        user.is_approved ? 'bg-success/20 text-success' : 'bg-accent/20 text-accent-foreground'
                      }`}>
                        {user.is_approved ? t('active') : t('pendingApproval')}
                      </span>
                    </TableCell>
                    <TableCell>
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
