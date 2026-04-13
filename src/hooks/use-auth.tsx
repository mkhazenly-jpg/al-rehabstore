import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  profile: { full_name: string; email: string; is_approved: boolean } | null;
  role: 'admin' | 'staff' | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const initialState: AuthState = {
  user: null,
  profile: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,
  isApproved: false,
  isAdmin: false,
};

const getSignedOutState = (): AuthState => ({
  ...initialState,
  isLoading: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  const fetchUserData = async (user: User) => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('full_name, email, is_approved').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (roleRes.error) throw roleRes.error;

      const profile = profileRes.data ?? null;
      const role = (roleRes.data?.role as 'admin' | 'staff' | undefined) ?? 'staff';

      setState({
        user,
        profile,
        role,
        isLoading: false,
        isAuthenticated: true,
        isApproved: profile?.is_approved ?? false,
        isAdmin: role === 'admin',
      });
    } catch (error) {
      console.error('fetchUserData error:', error);
      setState({
        user,
        profile: null,
        role: 'staff',
        isLoading: false,
        isAuthenticated: true,
        isApproved: false,
        isAdmin: false,
      });
    }
  };

  const refreshAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setState(getSignedOutState());
      return;
    }

    setState({
      user,
      profile: null,
      role: null,
      isLoading: true,
      isAuthenticated: true,
      isApproved: false,
      isAdmin: false,
    });

    await fetchUserData(user);
  };

  useEffect(() => {
    let mounted = true;
    let authEventHandled = false;

    const hydrateUser = (user: User) => {
      setState({
        user,
        profile: null,
        role: null,
        isLoading: true,
        isAuthenticated: true,
        isApproved: false,
        isAdmin: false,
      });

      window.setTimeout(() => {
        if (!mounted) return;
        void fetchUserData(user);
      }, 0);
    };

    const clearAuth = () => {
      if (!mounted) return;
      setState(getSignedOutState());
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventHandled = true;

      if (session?.user) {
        hydrateUser(session.user);
        return;
      }

      clearAuth();
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted || authEventHandled) return;

      if (session?.user) {
        hydrateUser(session.user);
        return;
      }

      clearAuth();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: redirectTo,
      },
    });

    return { error: error?.message || null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setState(getSignedOutState());
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
