import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/AppLayout';
import { BackupStatusContent } from '@/components/BackupStatusContent';
import { useEffect } from 'react';

export const Route = createFileRoute('/admin/backups')({
  component: AdminBackupsPage,
  head: () => ({ meta: [{ title: 'مخزن الرحاب - حالة النسخ الاحتياطي' }] }),
});

function AdminBackupsPage() {
  return (
    <AdminGuard>
      <AppLayout><BackupStatusContent /></AppLayout>
    </AdminGuard>
  );
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, isApproved, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isApproved)) navigate({ to: '/' });
    else if (!isLoading && !isAdmin) navigate({ to: '/unauthorized' });
  }, [isLoading, isAuthenticated, isApproved, isAdmin, navigate]);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!isAuthenticated || !isApproved || !isAdmin) return null;
  return <>{children}</>;
}
