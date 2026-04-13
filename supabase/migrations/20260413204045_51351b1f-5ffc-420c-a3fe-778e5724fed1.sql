CREATE OR REPLACE FUNCTION public.update_stock_items_last_updated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_stock_items_last_updated ON public.stock_items;

CREATE TRIGGER update_stock_items_last_updated
BEFORE UPDATE ON public.stock_items
FOR EACH ROW
EXECUTE FUNCTION public.update_stock_items_last_updated();