CREATE OR REPLACE FUNCTION public.wipe_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _protected_email text := 'm.khazenly@gmail.com';
BEGIN
  SELECT email INTO _email
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF _email IS NULL OR _email <> _protected_email THEN
    RAISE EXCEPTION 'Unauthorized: only the protected admin can wipe all data';
  END IF;

  DELETE FROM public.employee_violations WHERE id IS NOT NULL;
  DELETE FROM public.assignment_batches WHERE id IS NOT NULL;
  DELETE FROM public.assignments WHERE id IS NOT NULL;
  DELETE FROM public.stock_additions WHERE id IS NOT NULL;
  DELETE FROM public.stock_items WHERE id IS NOT NULL;
  DELETE FROM public.employees WHERE id IS NOT NULL;
END;
$$;