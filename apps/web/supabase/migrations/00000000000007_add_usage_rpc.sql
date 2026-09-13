CREATE OR REPLACE FUNCTION get_usage_totals()
RETURNS TABLE (total_cost numeric, run_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    COALESCE(SUM(cost_usd), 0)  AS total_cost,
    COUNT(*)                     AS run_count
  FROM runs;
$$;

REVOKE ALL ON FUNCTION get_usage_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_usage_totals() FROM anon;
GRANT EXECUTE ON FUNCTION get_usage_totals() TO authenticated;
