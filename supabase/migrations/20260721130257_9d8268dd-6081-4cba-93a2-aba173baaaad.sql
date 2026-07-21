REVOKE EXECUTE ON FUNCTION public.registrar_login_corretor() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.liberar_leads_inativos_6d() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.dentro_do_horario(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.distribuir_lead_round_robin(text,text,text,uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.liberar_leads_represados() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.distribuir_lead_direcionado(text,text,text,uuid,uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sou_corretor_do_lead(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reatribuir_leads_sem_visualizacao() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sou_corretor_do_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_login_corretor() TO authenticated;