CREATE TABLE public.whatsapp_send_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  to_number TEXT NOT NULL,
  message TEXT NOT NULL,
  campaign_id UUID,
  status TEXT NOT NULL DEFAULT 'opened',
  error_message TEXT,
  triggered_by UUID,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_send_attempts_employee ON public.whatsapp_send_attempts(employee_id);
CREATE INDEX idx_whatsapp_send_attempts_campaign ON public.whatsapp_send_attempts(campaign_id);

ALTER TABLE public.whatsapp_send_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view whatsapp_send_attempts"
ON public.whatsapp_send_attempts FOR SELECT TO authenticated
USING (is_approved(auth.uid()));

CREATE POLICY "Approved users can insert whatsapp_send_attempts"
ON public.whatsapp_send_attempts FOR INSERT TO authenticated
WITH CHECK (is_approved(auth.uid()));

CREATE POLICY "Admins can delete whatsapp_send_attempts"
ON public.whatsapp_send_attempts FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));