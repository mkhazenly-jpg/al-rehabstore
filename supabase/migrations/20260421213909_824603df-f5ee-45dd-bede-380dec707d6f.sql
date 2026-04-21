-- Add 'archived' value to employee_status enum
ALTER TYPE public.employee_status ADD VALUE IF NOT EXISTS 'archived';

-- Create function to prevent deletion of employees with assignments
CREATE OR REPLACE FUNCTION public.prevent_employee_delete_with_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  SELECT COUNT(*) INTO _count
  FROM public.assignments
  WHERE employee_id = OLD.id;

  IF _count > 0 THEN
    RAISE EXCEPTION 'Cannot delete employee with existing assignments. Archive the employee instead.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS prevent_employee_delete_trigger ON public.employees;
CREATE TRIGGER prevent_employee_delete_trigger
BEFORE DELETE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.prevent_employee_delete_with_assignments();