import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useProfilesMap() {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase.from('profiles').select('user_id, full_name, email').then(({ data }) => {
      const m: Record<string, string> = {};
      (data || []).forEach((p: any) => {
        m[p.user_id] = p.full_name || p.email || '';
      });
      setMap(m);
    });
  }, []);
  return map;
}
