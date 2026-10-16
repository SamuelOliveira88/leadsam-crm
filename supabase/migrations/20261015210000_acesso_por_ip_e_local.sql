-- Duas travas opcionais de login por empresa (ambas desligadas por padrão):
--  1) só entra quem estiver num IP cadastrado; 2) só entra quem estiver no raio de um local de plantão.
ALTER TABLE public.config_acesso ADD COLUMN IF NOT EXISTS restringir_ip boolean NOT NULL DEFAULT false;
ALTER TABLE public.config_acesso ADD COLUMN IF NOT EXISTS ips_permitidos text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.config_acesso ADD COLUMN IF NOT EXISTS restringir_local boolean NOT NULL DEFAULT false;
