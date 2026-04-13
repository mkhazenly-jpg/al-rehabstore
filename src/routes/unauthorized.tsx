import { createFileRoute, Link } from '@tanstack/react-router';
import { useLanguage } from '@/hooks/use-language';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

export const Route = createFileRoute('/unauthorized')({
  component: UnauthorizedPage,
  head: () => ({ meta: [{ title: 'مخزن الرحاب - غير مصرح' }] }),
});

function UnauthorizedPage() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <ShieldX className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">{t('unauthorized')}</h1>
        <p className="text-muted-foreground">{t('unauthorizedMessage')}</p>
        <Button asChild>
          <Link to={isAdmin ? '/dashboard' : '/employees'}>{t('goBack')}</Link>
        </Button>
      </div>
    </div>
  );
}
