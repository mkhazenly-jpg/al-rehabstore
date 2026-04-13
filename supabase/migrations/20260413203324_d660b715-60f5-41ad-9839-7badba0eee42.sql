
CREATE TABLE public.stock_additions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  quantity_added INTEGER NOT NULL DEFAULT 1,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  added_by UUID REFERENCES auth.users(id),
  notes TEXT
);

ALTER TABLE public.stock_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view additions" ON public.stock_additions
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));

CREATE POLICY "Admins can insert additions" ON public.stock_additions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete additions" ON public.stock_additions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
