CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND lower(email) IN ('m.khazenly@gmail.com', 'abdelrahman.mohamed@khazenly.com')
  )
$function$;