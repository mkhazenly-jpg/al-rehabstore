-- Create pending_changes table for admin approval workflow
CREATE TABLE public.pending_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL CHECK (table_name IN ('stock_items','employee_violations','assignments')),
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('update','delete')),
  payload JSONB,
  snapshot JSONB,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by UUID NOT NULL,
  requested_by_email TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_changes TO authenticated;
GRANT ALL ON public.pending_changes TO service_role;

ALTER TABLE public.pending_changes ENABLE ROW LEVEL SECURITY;

-- Helper to check if user is the master admin
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND email = 'm.khazenly@gmail.com'
  )
$$;

-- Any admin can insert their own pending change
CREATE POLICY "Admins can insert pending changes"
ON public.pending_changes FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') AND requested_by = auth.uid());

-- Admins can view all pending changes
CREATE POLICY "Admins can view pending changes"
ON public.pending_changes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Only master admin can update (approve/reject)
CREATE POLICY "Master admin can update pending changes"
ON public.pending_changes FOR UPDATE TO authenticated
USING (is_master_admin(auth.uid()));

-- Requester can cancel their own pending request; master admin can delete any
CREATE POLICY "Delete pending changes"
ON public.pending_changes FOR DELETE TO authenticated
USING (is_master_admin(auth.uid()) OR (requested_by = auth.uid() AND status = 'pending'));

CREATE TRIGGER update_pending_changes_updated_at
BEFORE UPDATE ON public.pending_changes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pending_changes_status ON public.pending_changes(status);
CREATE INDEX idx_pending_changes_table_record ON public.pending_changes(table_name, record_id);