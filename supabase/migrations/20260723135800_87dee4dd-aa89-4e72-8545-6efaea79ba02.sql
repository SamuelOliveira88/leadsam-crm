UPDATE public.corretores SET grupo_id='10b02e8a-3ae0-40ad-b4d3-fe62396939ee' WHERE id='8210f66d-b62b-495a-b4da-cc198fc8677e';

UPDATE public.leads
SET corretor_id='8210f66d-b62b-495a-b4da-cc198fc8677e',
    status='distribuido',
    liberado_em=now(),
    represado_em=NULL,
    ultima_atividade_em=now()
WHERE status='represado' AND grupo_id='10b02e8a-3ae0-40ad-b4d3-fe62396939ee';