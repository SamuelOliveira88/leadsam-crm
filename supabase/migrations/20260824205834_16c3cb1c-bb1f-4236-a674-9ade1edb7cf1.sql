UPDATE public.config_acesso
SET restringir_horario = false,
    liberado_ate = NULL,
    updated_at = now()
WHERE empresa_id = '1765d307-d778-48da-b96d-201ad7d7776c';

UPDATE public.corretores
SET liberado_ate = '2099-12-31 23:59:59+00', ativo = true
WHERE id = '8dd597cf-b1c0-43aa-ac84-721bf40ad8e4';