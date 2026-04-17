import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/AppLayout';
import { ViolationsContent } from '@/components/ViolationsContent';
import { useEffect } from 'react';

export const Route = createFileRoute('/violations')({
  component: ViolationsPage,
  head: () => ({ meta: [{ title: 'مخزن الرحاب - مخالفات الموظفين' }] }),
});

function ViolationsPage() {
  return (
    <Guard>
      <AppLayout><ViolationsContent /></AppLayout>
    </Guard>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, isApproved } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isApproved)) navigate({ to: '/' });
  }, [isLoading, isAuthenticated, isApproved, navigate]);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!isAuthenticated || !isApproved) return null;
  return <>{children}</>;
}
