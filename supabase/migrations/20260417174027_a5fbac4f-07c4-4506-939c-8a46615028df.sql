-- Fix 1: Prevent users from self-approving (privilege escalation)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Trigger ensures non-admin users cannot change is_approved
DROP TRIGGER IF EXISTS prevent_is_approved_self_change_trigger ON public.profiles;
CREATE TRIGGER prevent_is_approved_self_change_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_is_approved_self_change();

-- Fix 2: Add admin guard to approve_assignment and return_assignment RPCs
CREATE OR REPLACE FUNCTION public.approve_assignment(_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _stock_item_id UUID;
  _qty INTEGER;
  _available INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  SELECT stock_item_id, quantity_assigned INTO _stock_item_id, _qty
  FROM public.assignments WHERE id = _assignment_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or not pending';
  END IF;
  
  SELECT quantity_in_stock INTO _available
  FROM public.stock_items WHERE id = _stock_item_id;
  
  IF _available < _qty THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;
  
  UPDATE public.stock_items SET quantity_in_stock = quantity_in_stock - _qty
  WHERE id = _stock_item_id;
  
  UPDATE public.assignments SET status = 'approved'
  WHERE id = _assignment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.return_assignment(_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _stock_item_id UUID;
  _qty INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  SELECT stock_item_id, quantity_assigned INTO _stock_item_id, _qty
  FROM public.assignments WHERE id = _assignment_id AND status = 'approved';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or not approved';
  END IF;
  
  UPDATE public.stock_items SET quantity_in_stock = quantity_in_stock + _qty
  WHERE id = _stock_item_id;
  
  UPDATE public.assignments SET status = 'returned', return_date = now()
  WHERE id = _assignment_id;
END;
$function$;