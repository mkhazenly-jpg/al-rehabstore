import { useState } from 'react';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Warehouse } from 'lucide-react';

export function LoginPage() {
  const { t, lang, setLang } = useLanguage();
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isLogin) {
      const res = await signIn(email, password);
      if (res.error) setError(res.error);
    } else {
      const res = await signUp(email, password, fullName);
      if (res.error) {
        setError(res.error);
      } else {
        setSignupSuccess(true);
      }
    }
    setLoading(false);
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
            {isLogin ? t('login') : t('signup')}
          </p>
        </CardHeader>
        <CardContent>
          {signupSuccess ? (
            <div className="text-center space-y-3">
              <p className="text-success font-medium">{t('pendingApprovalMsg')}</p>
              <Button variant="outline" onClick={() => { setIsLogin(true); setSignupSuccess(false); }}>
                {t('login')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label>{t('fullName')}</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t('email')}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('password')}</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '...' : isLogin ? t('login') : t('signup')}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {isLogin ? t('noAccount') : t('haveAccount')}{' '}
                <button type="button" className="text-primary underline" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
                  {isLogin ? t('signup') : t('login')}
                </button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
