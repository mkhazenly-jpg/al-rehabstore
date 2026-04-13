import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { LoginPage } from '@/components/LoginPage';
import { PendingApprovalPage } from '@/components/PendingApprovalPage';
import { useEffect } from 'react';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  return <AuthGate />;
}

function AuthGate() {
  const { isLoading, isAuthenticated, isApproved } = useAuth();
  const navigate = useNavigate();

  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated && isApproved) {
      navigate({ to: isAdmin ? '/dashboard' : '/employees' });
    }
  }, [isLoading, isAuthenticated, isApproved, isAdmin, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;
  if (!isApproved) return <PendingApprovalPage />;
  return null;
}
