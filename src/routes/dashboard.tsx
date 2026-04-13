import { createFileRoute } from '@tanstack/react-router';
import { LanguageProvider } from '@/hooks/use-language';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/AppLayout';
import { DashboardContent } from '@/components/DashboardContent';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
  head: () => ({
    meta: [{ title: 'مخزن الرحاب - لوحة التحكم' }],
  }),
});

function DashboardPage() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AuthGuard>
          <AppLayout>
            <DashboardContent />
          </AppLayout>
        </AuthGuard>
      </AuthProvider>
    </LanguageProvider>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, isApproved } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isApproved)) {
      navigate({ to: '/' });
    }
  }, [isLoading, isAuthenticated, isApproved, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !isApproved) return null;
  return <>{children}</>;
}
