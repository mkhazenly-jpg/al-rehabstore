
-- Trigger to prevent changing role of protected admin
CREATE OR REPLACE FUNCTION public.protect_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  protected_email TEXT := 'm.khazenly@gmail.com';
  target_email TEXT;
BEGIN
  -- Check if this is the protected user
  SELECT email INTO target_email FROM public.profiles WHERE user_id = OLD.user_id;
  
  IF target_email = protected_email THEN
    -- Prevent role change or deletion
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete protected admin role';
    END IF;
    IF NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Cannot change protected admin role';
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_admin_role_trigger
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.protect_admin_role();

-- Trigger to prevent changing approval of protected admin
CREATE OR REPLACE FUNCTION public.protect_admin_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  protected_email TEXT := 'm.khazenly@gmail.com';
BEGIN
  IF OLD.email = protected_email THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete protected admin profile';
    END IF;
    IF NEW.is_approved <> OLD.is_approved THEN
      RAISE EXCEPTION 'Cannot change protected admin approval';
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_admin_profile_trigger
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_admin_profile();
