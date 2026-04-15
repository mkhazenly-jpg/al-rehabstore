import { useState } from 'react';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { resetUserPassword } from '@/lib/admin-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Warehouse } from 'lucide-react';

type View = 'login' | 'signup' | 'forgot';

export function LoginPage() {
  const { t, lang, setLang } = useLanguage();
  const { signIn, signUp } = useAuth();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (view === 'login') {
      const res = await signIn(email, password);
      if (res.error) setError(res.error);
    } else if (view === 'signup') {
      const res = await signUp(email, password, fullName);
      if (res.error) {
        setError(res.error);
      } else {
        setSignupSuccess(true);
      }
    } else if (view === 'forgot') {
      if (!newPassword || newPassword.length < 6) {
        setError(t('password') + ' (min 6)');
        setLoading(false);
        return;
      }
      try {
        await resetUserPassword(email, newPassword);
        // Auto-login after reset
        const res = await signIn(email, newPassword);
        if (res.error) {
          setResetSent(true); // password changed but login failed
        }
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('USER_NOT_FOUND')) {
          setError(t('email') + ' - ' + 'Not found');
        } else {
          setError(msg);
        }
      }
    }
    setLoading(false);
  };

  const switchView = (v: View) => {
    setView(v);
    setError('');
    setResetSent(false);
    setSignupSuccess(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute top-4 end-4">
        <Button variant="ghost" size="icon" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
          <Globe className="h-4 w-4" />
        </Button>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Warehouse className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">{t('appName')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {view === 'login' ? t('login') : view === 'signup' ? t('signup') : t('resetPassword')}
          </p>
        </CardHeader>
        <CardContent>
          {signupSuccess ? (
            <div className="text-center space-y-3">
              <p className="text-success font-medium">{t('pendingApprovalMsg')}</p>
              <Button variant="outline" onClick={() => switchView('login')}>
                {t('login')}
              </Button>
            </div>
          ) : resetSent ? (
            <div className="text-center space-y-3">
              <p className="font-medium text-primary">{t('passwordUpdated')}</p>
              <Button variant="outline" onClick={() => switchView('login')}>
                {t('backToLogin')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {view === 'signup' && (
                <div className="space-y-2">
                  <Label>{t('fullName')}</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t('email')}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {view !== 'forgot' && (
                <div className="space-y-2">
                  <Label>{t('password')}</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>
              )}
              {view === 'forgot' && (
                <div className="space-y-2">
                  <Label>{t('newPassword')}</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
                </div>
              )}
              {view === 'login' && (
                <div className="text-end">
                  <button type="button" className="text-sm text-primary underline" onClick={() => switchView('forgot')}>
                    {t('forgotPassword')}
                  </button>
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '...' : view === 'login' ? t('login') : view === 'signup' ? t('signup') : t('sendResetLink')}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {view === 'forgot' ? (
                  <button type="button" className="text-primary underline" onClick={() => switchView('login')}>
                    {t('backToLogin')}
                  </button>
                ) : (
                  <>
                    {view === 'login' ? t('noAccount') : t('haveAccount')}{' '}
                    <button type="button" className="text-primary underline" onClick={() => switchView(view === 'login' ? 'signup' : 'login')}>
                      {view === 'login' ? t('signup') : t('login')}
                    </button>
                  </>
                )}
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
