import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/AppLayout';
import { AssignmentsContent } from '@/components/AssignmentsContent';
import { useEffect } from 'react';

export const Route = createFileRoute('/assignments')({
  component: AssignmentsPage,
  head: () => ({ meta: [{ title: 'مخزن الرحاب - التسليمات' }] }),
});

function AssignmentsPage() {
  return (
    <Guard>
      <AppLayout><AssignmentsContent /></AppLayout>
    </Guard>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, isApproved, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isApproved || !isAdmin)) navigate({ to: '/' });
  }, [isLoading, isAuthenticated, isApproved, isAdmin, navigate]);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!isAuthenticated || !isApproved || !isAdmin) return null;
  return <>{children}</>;
}
