
-- Fix 1: Drop the misconfigured policy (targets 'public' role) and recreate for 'authenticated'
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Fix 2: Add trigger to prevent users from changing is_approved directly
CREATE OR REPLACE FUNCTION public.prevent_is_approved_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_approved <> OLD.is_approved THEN
    -- Only allow if the current user is an admin
    IF NOT has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can change approval status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_self_approval
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_is_approved_self_change();
