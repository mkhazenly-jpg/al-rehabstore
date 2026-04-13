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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    role: null,
    isLoading: true,
    isAuthenticated: false,
    isApproved: false,
    isAdmin: false,
  });

  const fetchUserData = async (user: User) => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('full_name, email, is_approved').eq('user_id', user.id).single(),
        supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
      ]);

      const profile = profileRes.data;
      const role = (roleRes.data?.role as 'admin' | 'staff') || 'staff';

      setState({
        user,
        profile: profile || null,
        role,
        isLoading: false,
        isAuthenticated: true,
        isApproved: profile?.is_approved || false,
        isAdmin: role === 'admin',
      });
    } catch (err) {
      console.error('fetchUserData error:', err);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await fetchUserData(user);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await fetchUserData(session.user);
      } else {
        setState({
          user: null, profile: null, role: null,
          isLoading: false, isAuthenticated: false, isApproved: false, isAdmin: false,
        });
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserData(session.user);
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error?.message || null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
