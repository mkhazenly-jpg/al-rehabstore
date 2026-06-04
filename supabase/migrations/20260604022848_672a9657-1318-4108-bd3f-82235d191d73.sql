ALTER TABLE public.pending_changes DROP CONSTRAINT IF EXISTS pending_changes_action_check;
ALTER TABLE public.pending_changes ADD CONSTRAINT pending_changes_action_check CHECK (action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text]));

ALTER TABLE public.pending_changes DROP CONSTRAINT IF EXISTS pending_changes_table_name_check;
ALTER TABLE public.pending_changes ADD CONSTRAINT pending_changes_table_name_check CHECK (table_name = ANY (ARRAY['stock_items'::text, 'stock_additions'::text, 'employee_violations'::text, 'assignments'::text, 'employees'::text]));