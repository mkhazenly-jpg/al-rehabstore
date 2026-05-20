import { Link, useLocation } from '@tanstack/react-router';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { LayoutDashboard, Package, Users, ClipboardList, LogOut, Globe, Menu, X, Shield, AlertTriangle, History, MessageCircle, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useLanguage();
  const { isAdmin, signOut, profile } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = isAdmin
    ? [
        { to: '/dashboard' as const, icon: LayoutDashboard, label: t('dashboard') },
        { to: '/stock' as const, icon: Package, label: t('stock') },
        { to: '/employees' as const, icon: Users, label: t('employees') },
        { to: '/assignments' as const, icon: ClipboardList, label: t('assignments') },
        { to: '/violations' as const, icon: AlertTriangle, label: t('violations') },
        { to: '/bulk-messages' as const, icon: MessageCircle, label: t('bulkMessages') },
      ]
    : [
        { to: '/employees' as const, icon: Users, label: t('employees') },
        { to: '/violations' as const, icon: AlertTriangle, label: t('violations') },
        { to: '/bulk-messages' as const, icon: MessageCircle, label: t('bulkMessages') },
      ];

  const adminItems = isAdmin
    ? [
        { to: '/admin/users' as const, icon: Shield, label: t('userManagement') },
        { to: '/admin/backups' as const, icon: History, label: t('backupStatus') },
      ]
    : [];

  const allItems = [...navItems, ...adminItems];

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link to="/dashboard" className="text-lg font-bold text-primary">
              {t('appName')}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {profile?.full_name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              title={lang === 'ar' ? 'English' : 'عربي'}
            >
              <Globe className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - desktop */}
        <aside className="hidden w-56 shrink-0 border-e bg-sidebar md:block">
          <nav className="flex flex-col gap-1 p-3">
            {allItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Sidebar - mobile */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-foreground/20" onClick={() => setMobileOpen(false)} />
            <aside className="relative w-64 bg-sidebar shadow-lg h-full">
              <nav className="flex flex-col gap-1 p-3 pt-4">
                {allItems.map((item) => {
                  const isActive = location.pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent'
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 overflow-x-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
