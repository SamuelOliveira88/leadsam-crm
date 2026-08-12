UPDATE public.horarios_atendimento h
SET hora_fim = '23:59:59'
FROM public.grupos g
WHERE h.grupo_id = g.id AND g.nome ILIKE '%notific%' AND h.hora_fim = '00:00:00';