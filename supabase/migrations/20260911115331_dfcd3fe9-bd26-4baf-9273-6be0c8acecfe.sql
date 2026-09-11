ALTER FUNCTION public.dentro_do_horario(uuid) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.dentro_do_horario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dentro_do_horario(uuid) TO authenticated, service_role;