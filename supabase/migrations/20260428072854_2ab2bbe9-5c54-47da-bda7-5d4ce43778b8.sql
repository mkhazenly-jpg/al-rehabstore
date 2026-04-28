-- Track WhatsApp notification attempts for employee violations
CREATE TABLE public.violation_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  violation_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'pending',
  to_number TEXT,
  message_sid TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  triggered_by UUID,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_violation_notifications_violation_id
  ON public.violation_notifications(violation_id);
CREATE INDEX idx_violation_notifications_employee_id
  ON public.violation_notifications(employee_id);
CREATE INDEX idx_violation_notifications_status
  ON public.violation_notifications(status);

ALTER TABLE public.violation_notifications ENABLE ROW LEVEL SECURITY;

-- Approved users can view notifications
CREATE POLICY "Approved users can view violation_notifications"
ON public.violation_notifications
FOR SELECT
TO authenticated
USING (is_approved(auth.uid()));

-- Approved users can insert (will typically be inserted from server function)
CREATE POLICY "Approved users can insert violation_notifications"
ON public.violation_notifications
FOR INSERT
TO authenticated
WITH CHECK (is_approved(auth.uid()));

-- Admins can update (e.g., retry status)
CREATE POLICY "Admins can update violation_notifications"
ON public.violation_notifications
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete
CREATE POLICY "Admins can delete violation_notifications"
ON public.violation_notifications
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE TRIGGER update_violation_notifications_updated_at
BEFORE UPDATE ON public.violation_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();