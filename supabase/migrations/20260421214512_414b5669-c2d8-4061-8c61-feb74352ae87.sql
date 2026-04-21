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
  -- Verify caller is the protected admin
  SELECT email INTO _email FROM public.profiles WHERE user_id = auth.uid();

  IF _email IS NULL OR _email <> _protected_email THEN
    RAISE EXCEPTION 'Unauthorized: only the protected admin can wipe all data';
  END IF;

  -- Delete in dependency order
  DELETE FROM public.employee_violations;
  DELETE FROM public.assignment_batches;
  DELETE FROM public.assignments;
  DELETE FROM public.stock_additions;
  DELETE FROM public.stock_items;
  DELETE FROM public.employees;
END;
$$;