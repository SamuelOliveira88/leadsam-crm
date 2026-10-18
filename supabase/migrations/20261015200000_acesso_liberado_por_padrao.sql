-- Empresas novas entram com o acesso liberado; o dono define o próprio horário em Controle de Acesso.
ALTER TABLE public.config_acesso ALTER COLUMN restringir_horario SET DEFAULT false;
