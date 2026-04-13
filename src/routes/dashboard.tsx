import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/AppLayout';
import { DashboardContent } from '@/components/DashboardContent';
import { useEffect } from 'react';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
  head: () => ({
    meta: [{ title: 'مخزن الرحاب - لوحة التحكم' }],
  }),
});

function DashboardPage() {
  return (
    <AuthGuard>
      <AppLayout>
        <DashboardContent />
      </AppLayout>
    </AuthGuard>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, isApproved, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isApproved)) navigate({ to: '/' });
    else if (!isLoading && !isAdmin) navigate({ to: '/unauthorized' });
  }, [isLoading, isAuthenticated, isApproved, isAdmin, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !isApproved || !isAdmin) return null;
  return <>{children}</>;
}
