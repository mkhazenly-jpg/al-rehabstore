import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

export function PendingApprovalPage() {
  const { t } = useLanguage();
  const { signOut, refreshAuth } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-accent">
            <Clock className="h-7 w-7 text-accent-foreground" />
          </div>
          <CardTitle>{t('pendingApproval')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{t('pendingApprovalMsg')}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => refreshAuth()}>
              <RefreshCw className="h-4 w-4 me-2" />
              {t('submit')}
            </Button>
            <Button variant="ghost" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 me-2" />
              {t('logout')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
