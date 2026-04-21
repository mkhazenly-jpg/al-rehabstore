ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_location_check;
UPDATE public.employees SET location = 'SDC' WHERE location = 'SDS';
ALTER TABLE public.employees ADD CONSTRAINT employees_location_check CHECK (location IN ('RDC', 'SDC'));