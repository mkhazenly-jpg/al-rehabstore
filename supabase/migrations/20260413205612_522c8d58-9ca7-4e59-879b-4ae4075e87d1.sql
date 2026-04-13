ALTER TABLE public.employees
  ADD COLUMN shift text DEFAULT NULL,
  ADD COLUMN mobile text DEFAULT NULL,
  ADD COLUMN job_title text DEFAULT NULL;