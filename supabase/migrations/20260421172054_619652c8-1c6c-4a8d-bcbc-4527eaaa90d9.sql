
-- 1) Add remaining_quantity to stock_additions
ALTER TABLE public.stock_additions
  ADD COLUMN IF NOT EXISTS remaining_quantity integer NOT NULL DEFAULT 0;

-- Backfill remaining_quantity using a single SQL statement (safer than nested loops)
-- Strategy: distribute current quantity_in_stock across additions, newest-first.
-- Newest additions are assumed to still be in stock; oldest get depleted first.
WITH ranked AS (
  SELECT
    sa.id,
    sa.stock_item_id,
    sa.quantity_added,
    SUM(sa.quantity_added) OVER (
      PARTITION BY sa.stock_item_id
      ORDER BY sa.added_at DESC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_total
  FROM public.stock_additions sa
),
computed AS (
  SELECT
    r.id,
    GREATEST(
      0,
      LEAST(
        r.quantity_added,
        si.quantity_in_stock - (r.running_total - r.quantity_added)
      )
    ) AS remaining
  FROM ranked r
  JOIN public.stock_items si ON si.id = r.stock_item_id
)
UPDATE public.stock_additions sa
SET remaining_quantity = c.remaining
FROM computed c
WHERE sa.id = c.id;

-- 2) Create assignment_batches table linking assignments to stock_additions
CREATE TABLE IF NOT EXISTS public.assignment_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  stock_addition_id uuid NOT NULL REFERENCES public.stock_additions(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_batches_assignment ON public.assignment_batches(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_batches_addition ON public.assignment_batches(stock_addition_id);

ALTER TABLE public.assignment_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view assignment_batches" ON public.assignment_batches;
CREATE POLICY "Approved users can view assignment_batches"
  ON public.assignment_batches FOR SELECT TO authenticated
  USING (is_approved(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert assignment_batches" ON public.assignment_batches;
CREATE POLICY "Admins can insert assignment_batches"
  ON public.assignment_batches FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update assignment_batches" ON public.assignment_batches;
CREATE POLICY "Admins can update assignment_batches"
  ON public.assignment_batches FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete assignment_batches" ON public.assignment_batches;
CREATE POLICY "Admins can delete assignment_batches"
  ON public.assignment_batches FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3) FIFO assign function
CREATE OR REPLACE FUNCTION public.assign_with_fifo(_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stock_item_id uuid;
  _qty_needed integer;
  _qty_available integer;
  _addition RECORD;
  _take integer;
  _total_cost numeric := 0;
  _total_qty integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  SELECT stock_item_id, quantity_assigned INTO _stock_item_id, _qty_needed
  FROM public.assignments WHERE id = _assignment_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or not pending';
  END IF;

  SELECT COALESCE(SUM(remaining_quantity), 0) INTO _qty_available
  FROM public.stock_additions WHERE stock_item_id = _stock_item_id;

  IF _qty_available < _qty_needed THEN
    RAISE EXCEPTION 'Insufficient stock in batches: % available, % needed', _qty_available, _qty_needed;
  END IF;

  FOR _addition IN
    SELECT id, remaining_quantity, COALESCE(unit_price_at_addition, 0) AS price
    FROM public.stock_additions
    WHERE stock_item_id = _stock_item_id AND remaining_quantity > 0
    ORDER BY added_at ASC
  LOOP
    EXIT WHEN _qty_needed <= 0;
    _take := LEAST(_addition.remaining_quantity, _qty_needed);

    INSERT INTO public.assignment_batches (assignment_id, stock_addition_id, quantity, unit_price)
    VALUES (_assignment_id, _addition.id, _take, _addition.price);

    UPDATE public.stock_additions
    SET remaining_quantity = remaining_quantity - _take
    WHERE id = _addition.id;

    _total_cost := _total_cost + (_take * _addition.price);
    _total_qty := _total_qty + _take;
    _qty_needed := _qty_needed - _take;
  END LOOP;

  UPDATE public.stock_items
  SET quantity_in_stock = quantity_in_stock - _total_qty
  WHERE id = _stock_item_id;

  UPDATE public.assignments
  SET status = 'approved',
      unit_price_at_assignment = CASE WHEN _total_qty > 0 THEN _total_cost / _total_qty ELSE 0 END
  WHERE id = _assignment_id;
END;
$$;

-- 4) FIFO return function
CREATE OR REPLACE FUNCTION public.return_with_fifo(_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stock_item_id uuid;
  _total_returned integer := 0;
  _batch RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  SELECT stock_item_id INTO _stock_item_id
  FROM public.assignments WHERE id = _assignment_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or not approved';
  END IF;

  FOR _batch IN
    SELECT stock_addition_id, quantity FROM public.assignment_batches
    WHERE assignment_id = _assignment_id
  LOOP
    UPDATE public.stock_additions
    SET remaining_quantity = remaining_quantity + _batch.quantity
    WHERE id = _batch.stock_addition_id;
    _total_returned := _total_returned + _batch.quantity;
  END LOOP;

  IF _total_returned = 0 THEN
    SELECT quantity_assigned INTO _total_returned
    FROM public.assignments WHERE id = _assignment_id;
  END IF;

  UPDATE public.stock_items
  SET quantity_in_stock = quantity_in_stock + _total_returned
  WHERE id = _stock_item_id;

  UPDATE public.assignments
  SET status = 'returned', return_date = now()
  WHERE id = _assignment_id;
END;
$$;

-- 5) Trigger to auto-set remaining_quantity = quantity_added on insert
CREATE OR REPLACE FUNCTION public.set_addition_remaining_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.remaining_quantity = 0 AND NEW.quantity_added > 0 THEN
    NEW.remaining_quantity := NEW.quantity_added;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_addition_remaining_default ON public.stock_additions;
CREATE TRIGGER trg_set_addition_remaining_default
BEFORE INSERT ON public.stock_additions
FOR EACH ROW EXECUTE FUNCTION public.set_addition_remaining_default();
