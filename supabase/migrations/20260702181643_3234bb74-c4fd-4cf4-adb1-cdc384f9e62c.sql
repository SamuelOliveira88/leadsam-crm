
-- Fix search_path on helper functions
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.enforce_consultores_limit() SET search_path = public;

-- Restrict execution of admin-only functions to signed-in users (still SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.escolher_proximo_consultor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escolher_proximo_consultor() TO service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_admin_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO authenticated, service_role;
