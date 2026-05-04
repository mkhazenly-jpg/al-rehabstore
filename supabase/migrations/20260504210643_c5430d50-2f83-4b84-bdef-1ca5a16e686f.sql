-- Create public bucket for bulk message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('bulk-attachments', 'bulk-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Public can view bulk attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'bulk-attachments');

-- Approved users can upload
CREATE POLICY "Approved users can upload bulk attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'bulk-attachments' AND public.is_approved(auth.uid()));

-- Approved users can update their files
CREATE POLICY "Approved users can update bulk attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'bulk-attachments' AND public.is_approved(auth.uid()));

-- Approved users can delete
CREATE POLICY "Approved users can delete bulk attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'bulk-attachments' AND public.is_approved(auth.uid()));