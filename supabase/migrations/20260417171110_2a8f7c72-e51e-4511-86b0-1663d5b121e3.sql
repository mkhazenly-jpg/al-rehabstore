-- Create enum for violation action types
CREATE TYPE public.violation_action AS ENUM ('warning', 'deduction', 'suspension', 'termination', 'verbal_warning');

-- Create employee_violations table
CREATE TABLE public.employee_violations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  violation_description TEXT NOT NULL,
  violation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  action_taken public.violation_action NOT NULL DEFAULT 'warning',
  deduction_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_employee_violations_employee ON public.employee_violations(employee_id);
CREATE INDEX idx_employee_violations_description ON public.employee_violations(employee_id, violation_description);

-- Enable RLS
ALTER TABLE public.employee_violations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Approved users can view violations"
  ON public.employee_violations FOR SELECT
  TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can insert violations"
  ON public.employee_violations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "Admins can update violations"
  ON public.employee_violations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete violations"
  ON public.employee_violations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_employee_violations_updated_at
  BEFORE UPDATE ON public.employee_violations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();