GRANT EXECUTE ON FUNCTION public.distribuir_lead_round_robin(text, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_direcionado(text, text, text, uuid, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_direcionado(text, text, text, uuid, uuid[]) TO authenticated;