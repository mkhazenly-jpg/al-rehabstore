import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LanguageProvider } from '@/hooks/use-language';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/AppLayout';
import { EmployeesContent } from '@/components/EmployeesContent';
import { useEffect } from 'react';

export const Route = createFileRoute('/employees')({
  component: EmployeesPage,
  head: () => ({ meta: [{ title: 'مخزن الرحاب - الموظفون' }] }),
});

function EmployeesPage() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Guard>
          <AppLayout><EmployeesContent /></AppLayout>
        </Guard>
      </AuthProvider>
    </LanguageProvider>
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
