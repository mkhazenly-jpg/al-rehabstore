CREATE OR REPLACE FUNCTION public.mark_as_replaced(_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  UPDATE public.assignments
  SET status = 'replaced', return_date = now()
  WHERE id = _assignment_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or not approved';
  END IF;
END;
$function$;