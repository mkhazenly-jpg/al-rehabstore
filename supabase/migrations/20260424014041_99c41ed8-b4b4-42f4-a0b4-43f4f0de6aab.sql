-- Create backup_logs table to track backup history (Drive uploads + manual downloads)
CREATE TABLE public.backup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'drive', -- 'drive' | 'manual'
  status TEXT NOT NULL,               -- 'success' | 'error'
  triggered_by TEXT,                  -- 'manual' | 'cron'
  triggered_by_user UUID,             -- profile user_id when manual
  file_name TEXT,
  file_id TEXT,
  web_view_link TEXT,
  size_bytes BIGINT,
  elapsed_ms INTEGER,
  deleted_old INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_backup_logs_created_at ON public.backup_logs(created_at DESC);

ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view backup logs
CREATE POLICY "Admins can view backup logs"
ON public.backup_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert backup logs (server uses service role anyway)
CREATE POLICY "Admins can insert backup logs"
ON public.backup_logs
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete old logs
CREATE POLICY "Admins can delete backup logs"
ON public.backup_logs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));