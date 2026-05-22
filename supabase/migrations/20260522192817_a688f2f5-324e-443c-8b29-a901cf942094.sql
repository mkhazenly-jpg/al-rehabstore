
-- 1) Fix profile self-update privilege escalation
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND is_approved = (SELECT p.is_approved FROM public.profiles p WHERE p.user_id = auth.uid()));

-- 2) Make bulk-attachments bucket private and restrict access
UPDATE storage.buckets SET public = false WHERE id = 'bulk-attachments';

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "bulk-attachments public read" ON storage.objects;
DROP POLICY IF EXISTS "Approved users can read bulk-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Approved users can upload bulk-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete bulk-attachments" ON storage.objects;

CREATE POLICY "Approved users can read bulk-attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'bulk-attachments' AND public.is_approved(auth.uid()));

CREATE POLICY "Approved users can upload bulk-attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bulk-attachments' AND public.is_approved(auth.uid()));

CREATE POLICY "Admins can delete bulk-attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'bulk-attachments' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Restrict violation_notifications viewing to admins
DROP POLICY IF EXISTS "Approved users can view violation_notifications" ON public.violation_notifications;
CREATE POLICY "Admins can view violation_notifications"
ON public.violation_notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Restrict whatsapp_send_attempts viewing to admins
DROP POLICY IF EXISTS "Approved users can view whatsapp_send_attempts" ON public.whatsapp_send_attempts;
CREATE POLICY "Admins can view whatsapp_send_attempts"
ON public.whatsapp_send_attempts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
