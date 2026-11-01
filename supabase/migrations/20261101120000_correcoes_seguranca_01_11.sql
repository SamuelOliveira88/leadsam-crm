-- Migração: correções de segurança da revisão de 01/11/2026 (C1, C2, C3, A1–A5, M1, M2, M3, M7, N-b, N-c, N-d, N-e).
-- Conteúdo igual ao alexandria-sql/02-correcoes.sql (sem BEGIN/COMMIT: o Supabase já roda a migração em transação).
-- Idempotente. Desfazer: alexandria-sql/99-desfazer.sql.

-- 0) Trava de segurança: este é mesmo o banco do Alexandria? ------------------
do $$ begin
  if to_regclass('public.leads') is null or to_regclass('public.lead_mensagens') is null
     or to_regclass('public.envios_whatsapp') is null or to_regclass('public.perfis') is null
     or to_regclass('public.webhook_tokens') is null or to_regclass('public.corretores') is null then
    raise exception 'PARADO: este não parece o banco do Alexandria (faltam leads/lead_mensagens/envios_whatsapp/perfis/webhook_tokens/corretores).';
  end if;
  if to_regprocedure('public.receber_mensagem_whatsapp(text,text,text,text,text,text,text,text,text)') is null then
    raise exception 'PARADO: receber_mensagem_whatsapp com 9 argumentos (p_lid) não existe. Aplique antes as migrações até 20261025110000.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='opt_out') then
    raise exception 'PARADO: leads.opt_out não existe.';
  end if;
end $$;

-- 0.1) Tabela de backup das linhas alteradas (só o dono do banco lê) ----------
create table if not exists public.correcoes_0111_backup (
  id bigserial primary key,
  item text not null,
  tabela text not null,
  linha_id text not null,
  antes jsonb not null,
  criado_em timestamptz not null default now(),
  unique (item, tabela, linha_id)
);
alter table public.correcoes_0111_backup enable row level security;
revoke all on public.correcoes_0111_backup from public, anon, authenticated;
grant all on public.correcoes_0111_backup to service_role;
do $$ begin
  if to_regclass('public.correcoes_0111_backup_id_seq') is not null then
    execute 'revoke all on sequence public.correcoes_0111_backup_id_seq from public, anon, authenticated';
  end if;
end $$;

-- =====================================================================
-- C1) Funções de realocação: só o cron (postgres) e o service_role executam
-- =====================================================================
revoke execute on function public.reatribuir_leads_parados(integer)   from public, anon, authenticated;
revoke execute on function public.reatribuir_leads_sem_visualizacao() from public, anon, authenticated;
revoke execute on function public.liberar_leads_inativos_6d()         from public, anon, authenticated;
revoke execute on function public.liberar_leads_represados()          from public, anon, authenticated;
grant  execute on function public.reatribuir_leads_parados(integer), public.reatribuir_leads_sem_visualizacao(),
                           public.liberar_leads_inativos_6d(), public.liberar_leads_represados() to service_role;

-- =====================================================================
-- A3) Configuração no banco (URL do site, domínios de mídia) — sem Lovable
-- =====================================================================
create table if not exists public.app_config (
  chave text primary key,
  valor text not null,
  descricao text,
  atualizado_em timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from public, anon, authenticated;
grant all on public.app_config to service_role;

insert into public.app_config (chave, valor, descricao) values
  ('site_url', 'https://www.alexandrialeads.app',
   'Endereço público do app (Vercel), sem barra no fim. Usado pelo cron da fila e pelo aviso da Mi.IA.'),
  ('midia_dominios', 'mmg.whatsapp.net,.whatsapp.net,.supabase.co',
   'Domínios aceitos em midia_url (separados por vírgula). Começando com ponto = o domínio e os subdomínios. Só https.')
on conflict (chave) do nothing;

create or replace function public.config_valor(p_chave text, p_padrao text default null)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(btrim(c.valor), '') from public.app_config c where c.chave = p_chave), p_padrao)
$$;
revoke all on function public.config_valor(text, text) from public, anon, authenticated;
grant execute on function public.config_valor(text, text) to service_role;

-- URL de mídia: só https, sem usuário:senha na URL, host na lista de app_config.midia_dominios
create or replace function public.midia_url_permitida(p_url text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_host text; v_item text;
begin
  if p_url is null or length(p_url) > 2048 then return false; end if;
  v_host := lower(substring(p_url from '^https://([A-Za-z0-9.-]+)(:[0-9]{1,5})?([/?#]|$)'));
  if v_host is null or v_host = '' then return false; end if;
  foreach v_item in array string_to_array(lower(public.config_valor('midia_dominios', '')), ',') loop
    v_item := btrim(v_item);
    continue when v_item = '';
    if left(v_item, 1) = '.' then
      if v_host = substr(v_item, 2) or right(v_host, length(v_item)) = v_item then return true; end if;
    elsif v_host = v_item then
      return true;
    end if;
  end loop;
  return false;
end $$;
revoke all on function public.midia_url_permitida(text) from public, anon, authenticated;
grant execute on function public.midia_url_permitida(text) to service_role;

-- A3) Cron da fila de avisos: URL lida de app_config.site_url na hora de rodar.
-- O token vai no cabeçalho e vem do Vault: 'cron_token' (novo) ou, se não existir, 'webhook_lead_token' (antigo).
create or replace function public.definir_token_cron(p_token text)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if p_token is null or length(p_token) < 24 then raise exception 'token curto demais (mínimo 24 caracteres)'; end if;
  select id into v_id from vault.secrets where name = 'cron_token';
  if v_id is null then perform vault.create_secret(p_token, 'cron_token');
  else perform vault.update_secret(v_id, p_token, 'cron_token'); end if;
  return 'ok';
end $fn$;
revoke all on function public.definir_token_cron(text) from public, anon, authenticated, service_role;

do $do$
declare v_schedule text; v_cmd text;
begin
  if to_regnamespace('cron') is null or to_regclass('cron.job') is null then
    raise notice 'A3: pg_cron não está instalado; o job process-whatsapp-queue não foi recriado.';
    return;
  end if;
  v_cmd := $cmd$
  SELECT net.http_post(
    url := public.config_valor('site_url', 'https://www.alexandrialeads.app') || '/api/public/hooks/processar-fila?limit=50',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-token', coalesce(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token'),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'webhook_lead_token'), '')),
    body := '{}'::jsonb
  );
  $cmd$;
  select schedule into v_schedule from cron.job where jobname = 'process-whatsapp-queue';
  -- guarda o comando antigo uma única vez (para o desfazer)
  insert into public.correcoes_0111_backup (item, tabela, linha_id, antes)
  select 'A3', 'cron.job', jobname, jsonb_build_object('schedule', schedule, 'command', command)
    from cron.job where jobname = 'process-whatsapp-queue'
  on conflict (item, tabela, linha_id) do nothing;
  perform cron.schedule('process-whatsapp-queue', coalesce(v_schedule, '* * * * *'), v_cmd);
end $do$;

-- =====================================================================
-- A1) Ninguém vira super admin (nem master) por e-mail fixo.
--     Super admin = perfis.super_admin = true, ligado à mão no SQL Editor.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $function$
DECLARE
  v_email text;
  v_role text := 'pendente';
  v_empresa_id uuid := NULL;
  v_grupo_id uuid := NULL;
  v_corretor_id uuid := NULL;
  v_convite RECORD;
BEGIN
  v_email := lower(COALESCE(NEW.email, ''));

  -- Sem e-mails fixos: o papel vem só de um convite válido. Super admin nunca é dado aqui.
  SELECT * INTO v_convite
    FROM public.convites_admin
   WHERE lower(email) = v_email
     AND usado_em IS NULL
     AND expira_em > now()
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    v_role := CASE WHEN v_convite.role IN ('master','gerente','corretor','financeiro','suporte')
                   THEN v_convite.role ELSE 'pendente' END;
    v_empresa_id := v_convite.empresa_id;
    v_grupo_id := v_convite.grupo_id;
    v_corretor_id := v_convite.corretor_id;
    UPDATE public.convites_admin SET usado_em = now() WHERE id = v_convite.id;
  END IF;

  INSERT INTO public.perfis (id, nome, role, grupo_id, corretor_id, empresa_id, super_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    v_role, v_grupo_id, v_corretor_id, v_empresa_id, false
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    grupo_id = COALESCE(public.perfis.grupo_id, EXCLUDED.grupo_id),
    corretor_id = COALESCE(public.perfis.corretor_id, EXCLUDED.corretor_id),
    empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id),
    super_admin = public.perfis.super_admin;   -- nunca liga super admin por aqui

  RETURN NEW;
END; $function$;

-- A1) O domínio errado gmi.com não é do Toni: tira super admin de quem estiver com ele.
insert into public.correcoes_0111_backup (item, tabela, linha_id, antes)
select 'A1', 'perfis', p.id::text, jsonb_build_object('super_admin', p.super_admin, 'role', p.role, 'acesso_total', p.acesso_total)
  from public.perfis p join auth.users u on u.id = p.id
 where lower(u.email) like '%@gmi.com' and (p.super_admin or p.acesso_total)
on conflict (item, tabela, linha_id) do nothing;
update public.perfis p set super_admin = false, acesso_total = false
  from auth.users u
 where u.id = p.id and lower(u.email) like '%@gmi.com' and (p.super_admin or p.acesso_total);

-- =====================================================================
-- C2) Token de webhook com escopo (uso) por rota
--   lead       -> /api/public/webhook (formulário, landing page, Facebook)  — só cria lead
--   email      -> /api/public/lead-email (e também /webhook, que ele usa por dentro) — só cria lead
--   reativacao -> /api/public/reativacao (lê e atualiza leads frios) — só servidor (n8n)
--   elo        -> /api/public/elo-whatsapp
-- =====================================================================
alter table public.webhook_tokens add column if not exists uso text not null default 'lead';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'webhook_tokens_uso_check' and conrelid = 'public.webhook_tokens'::regclass) then
    alter table public.webhook_tokens add constraint webhook_tokens_uso_check check (uso in ('lead','email','reativacao','elo'));
  end if;
end $$;
-- Ajuste automático dos tokens que já existem, pelo nome (guardado no backup antes)
insert into public.correcoes_0111_backup (item, tabela, linha_id, antes)
select 'C2', 'webhook_tokens', t.id::text, jsonb_build_object('uso', t.uso, 'nome', t.nome)
  from public.webhook_tokens t
 where t.uso = 'lead' and (t.nome = 'elo-whatsapp' or t.nome ilike '%reativ%' or t.nome ilike '%e-mail%' or t.nome ilike '%email%')
on conflict (item, tabela, linha_id) do nothing;
update public.webhook_tokens set uso = 'elo'        where uso = 'lead' and nome = 'elo-whatsapp';
update public.webhook_tokens set uso = 'reativacao' where uso = 'lead' and nome ilike '%reativ%';
update public.webhook_tokens set uso = 'email'      where uso = 'lead' and (nome ilike '%e-mail%' or nome ilike '%email%');
grant select (uso) on public.webhook_tokens to authenticated;
grant insert (uso) on public.webhook_tokens to authenticated;

-- =====================================================================
-- A2) Telefone do lead protegido no banco (não só na tela)
--   authenticated perde o SELECT da coluna leads.telefone.
--   O número sai só por telefones_dos_leads()/telefone_do_lead(), com a regra:
--   super admin, master da empresa, gerente do grupo, criador do lead privado e
--   corretor dono quando o lead NÃO é blindado (número mãe, ou lista com a chave ligada).
-- =====================================================================
create or replace function public.leads_conceder_colunas()
returns void language plpgsql security definer set search_path = public as $$
declare v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'leads' and column_name <> 'telefone';
  execute 'revoke select on public.leads from authenticated';
  execute format('grant select (%s) on public.leads to authenticated', v_cols);
end $$;
revoke all on function public.leads_conceder_colunas() from public, anon, authenticated, service_role;
do $$ begin perform public.leads_conceder_colunas(); end $$;
-- (sempre que criar coluna nova em leads, rode: select public.leads_conceder_colunas();)

create or replace function public.telefones_dos_leads(p_ids uuid[])
returns table(lead_id uuid, telefone text)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text; v_grupo uuid; v_empresa uuid; v_corretor uuid; v_super boolean;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  if cardinality(p_ids) > 10000 then raise exception 'lista grande demais (máximo 10000)'; end if;
  if v_uid is null then
    if coalesce(auth.role(), '') = 'service_role' then
      return query select l.id, l.telefone from public.leads l where l.id = any(p_ids);
    end if;
    return;
  end if;
  select p.role, p.grupo_id, p.empresa_id, p.corretor_id, coalesce(p.super_admin, false)
    into v_role, v_grupo, v_empresa, v_corretor, v_super
    from public.perfis p where p.id = v_uid;
  if not found then return; end if;
  return query
  select l.id, l.telefone
    from public.leads l
    left join public.empresas e on e.id = l.empresa_id
   where l.id = any(p_ids)
     and (
       (coalesce(l.visibilidade, 'equipe') = 'privado' and l.criado_por = v_uid)
       or (coalesce(l.visibilidade, 'equipe') <> 'privado' and (
            (v_super and (v_empresa is null or l.empresa_id is null or l.empresa_id = v_empresa))
            or (v_empresa is not null and l.empresa_id = v_empresa and (
                  v_role = 'master'
               or (v_role = 'gerente' and v_grupo is not null and l.grupo_id = v_grupo)
               or (v_role = 'corretor' and v_corretor is not null and l.corretor_id = v_corretor
                   and not (coalesce(l.fonte, '') = 'numero_mae'
                            or (coalesce(l.fonte, '') = 'planilha_samuelimob' and coalesce(e.lista_blindada, true))))
            ))
       ))
     );
end $$;
revoke all on function public.telefones_dos_leads(uuid[]) from public, anon;
grant execute on function public.telefones_dos_leads(uuid[]) to authenticated, service_role;

create or replace function public.telefone_do_lead(p_lead uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.telefone from public.telefones_dos_leads(array[p_lead]) t limit 1
$$;
revoke all on function public.telefone_do_lead(uuid) from public, anon;
grant execute on function public.telefone_do_lead(uuid) to authenticated, service_role;

-- =====================================================================
-- A4 / N-b) Opt-out: cancela o que está pendente quando o cliente pede SAIR
-- =====================================================================
create or replace function public.leads_optout_cancela_envios()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_digitos text;
begin
  if new.opt_out and not coalesce(old.opt_out, false) then
    v_digitos := nullif(regexp_replace(coalesce(new.telefone, ''), '[^0-9]', '', 'g'), '');
    update public.envios_whatsapp e
       set status = 'erro', ultimo_erro = 'cancelado: o cliente pediu para sair (opt-out)'
     where e.status = 'pendente'
       and (
         exists (select 1 from public.lead_mensagens m where m.lead_id = new.id and (m.envio_id = e.id or m.id = e.mensagem_id))
         or (v_digitos is not null and e.numero = v_digitos)
         or (new.wa_lid is not null and e.numero = new.wa_lid)
       );
  end if;
  return new;
end $$;
revoke all on function public.leads_optout_cancela_envios() from public, anon, authenticated;
drop trigger if exists trg_leads_optout_cancela on public.leads;
create trigger trg_leads_optout_cancela after update of opt_out on public.leads
  for each row execute function public.leads_optout_cancela_envios();

-- Quem já está com opt_out e ainda tem envio pendente (guardado no backup antes)
insert into public.correcoes_0111_backup (item, tabela, linha_id, antes)
select 'A4', 'envios_whatsapp', e.id::text, jsonb_build_object('status', e.status, 'ultimo_erro', e.ultimo_erro)
  from public.envios_whatsapp e
 where e.status = 'pendente'
   and exists (select 1 from public.lead_mensagens m join public.leads l on l.id = m.lead_id
                where l.opt_out and (m.envio_id = e.id or m.id = e.mensagem_id))
on conflict (item, tabela, linha_id) do nothing;
update public.envios_whatsapp e
   set status = 'erro', ultimo_erro = 'cancelado: o cliente pediu para sair (opt-out)'
 where e.status = 'pendente'
   and exists (select 1 from public.lead_mensagens m join public.leads l on l.id = m.lead_id
                where l.opt_out and (m.envio_id = e.id or m.id = e.mensagem_id));

-- O relé também confere o opt-out na hora de entregar (mesma assinatura e mesmo retorno de antes)
create or replace function public.relay_pegar_envios(p_segredo text, p_limite integer default 10)
returns table(id uuid, instancia text, numero text, mensagem text, tipo text, audio_base64 text, audio_mimetype text)
language plpgsql security definer set search_path = public as $function$
#variable_conflict use_column
BEGIN
  IF NOT public.relay_segredo_ok(p_segredo) THEN
    RAISE EXCEPTION 'nao autorizado';
  END IF;
  RETURN QUERY
  WITH sel AS (
    SELECT e.id FROM public.envios_whatsapp e
     WHERE e.status = 'pendente' AND e.proxima_tentativa <= now()
       AND NOT EXISTS (SELECT 1 FROM public.lead_mensagens m2 JOIN public.leads l2 ON l2.id = m2.lead_id
                        WHERE m2.id = e.mensagem_id AND l2.opt_out)
     ORDER BY e.created_at
     LIMIT LEAST(GREATEST(COALESCE(p_limite, 10), 1), 20)
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.envios_whatsapp x
       SET proxima_tentativa = now() + interval '3 minutes'
      FROM sel
     WHERE x.id = sel.id
    RETURNING x.id, x.instancia, x.numero, x.mensagem, x.tipo, x.mensagem_id
  )
  SELECT u.id, u.instancia, u.numero, u.mensagem, u.tipo,
         CASE WHEN u.tipo = 'audio' THEN m.audio_dados END,
         CASE WHEN u.tipo = 'audio' THEN m.audio_mimetype END
    FROM upd u LEFT JOIN public.lead_mensagens m ON m.id = u.mensagem_id;
END;
$function$;

-- =====================================================================
-- M1 + A4) receber_mensagem_whatsapp: fecha para anon, grava SAIR, valida mídia
--   * Executa só com service_role (o n8n passa a chamar com a service key) + o segredo de sempre.
--   * SAIR/PARAR/PARE/STOP/DESCADASTRAR -> leads.opt_out = true e UMA confirmação.
--   * Mídia: só https e só de domínio da lista (app_config.midia_dominios). Fora disso a URL é descartada.
--   * Texto limitado a 10.000 caracteres.
-- =====================================================================
create or replace function public.receber_mensagem_whatsapp(
  p_segredo text, p_instancia text, p_telefone text, p_nome text, p_texto text,
  p_midia_tipo text default null, p_midia_url text default null, p_wa_msg_id text default null, p_lid text default null)
returns jsonb language plpgsql security definer set search_path = public as $function$
DECLARE
  v_inst record; v_lead record; v_lead_id uuid; v_corretor uuid; v_msg uuid; v_novo boolean := false;
  v_tel text; v_tem_tel boolean; v_lid text; v_achou boolean := false;
  v_mia boolean := false; v_mia_estado text;
  v_texto text; v_midia_url text; v_sair boolean; v_ja_optout boolean; v_envio uuid;
  c_confirma constant text := 'Pronto! Você não vai mais receber mensagens nossas por este número.';
BEGIN
  IF NOT public.numero_mae_segredo_ok(p_segredo) THEN RAISE EXCEPTION 'nao autorizado'; END IF;

  SELECT i.empresa_id, i.grupo_id INTO v_inst
    FROM public.instancias_whatsapp i WHERE i.instancia = p_instancia AND i.ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'instancia desconhecida'; END IF;

  v_tel := regexp_replace(split_part(coalesce(p_telefone, ''), '@', 1), '\D', '', 'g');
  v_tem_tel := length(v_tel) >= 10;
  v_lid := nullif(btrim(coalesce(p_lid, '')), '');
  IF NOT v_tem_tel AND v_lid IS NULL THEN RAISE EXCEPTION 'telefone invalido'; END IF;

  -- validação de entrada (M1 / N-e)
  v_texto := left(p_texto, 10000);
  v_midia_url := nullif(btrim(coalesce(p_midia_url, '')), '');
  IF v_midia_url IS NOT NULL AND NOT public.midia_url_permitida(v_midia_url) THEN
    v_midia_url := NULL;
    v_texto := coalesce(nullif(btrim(coalesce(v_texto, '')), ''), '[' || coalesce(p_midia_tipo, 'mídia') || ' recebida, endereço não permitido]');
  END IF;
  v_sair := coalesce(v_texto, '') ~* '^\s*(sair|parar|pare|stop|descadastrar)\s*[.!]*\s*$';

  PERFORM pg_advisory_xact_lock(hashtext(v_inst.empresa_id::text ||
            CASE WHEN v_tem_tel THEN coalesce(public.elo_chave(v_tel), v_tel) ELSE v_lid END));

  IF p_wa_msg_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.lead_mensagens m WHERE m.empresa_id = v_inst.empresa_id AND m.wa_msg_id = p_wa_msg_id)
  THEN RETURN jsonb_build_object('duplicada', true); END IF;

  IF v_tem_tel THEN
    SELECT l.id, l.corretor_id, l.telefone, l.mia_estado INTO v_lead
      FROM public.leads l
     WHERE l.empresa_id = v_inst.empresa_id AND public.elo_chave(l.telefone) = public.elo_chave(v_tel)
     ORDER BY l.created_at DESC LIMIT 1;
    v_achou := FOUND;
  END IF;
  IF NOT v_achou AND v_lid IS NOT NULL THEN
    SELECT l.id, l.corretor_id, l.telefone, l.mia_estado INTO v_lead
      FROM public.leads l
     WHERE l.empresa_id = v_inst.empresa_id AND l.wa_lid = v_lid
     ORDER BY l.created_at DESC LIMIT 1;
    v_achou := FOUND;
  END IF;

  IF v_achou THEN
    v_lead_id := v_lead.id; v_corretor := v_lead.corretor_id; v_mia_estado := v_lead.mia_estado;
    UPDATE public.leads SET
      wa_lid = coalesce(wa_lid, v_lid),
      telefone = CASE WHEN v_tem_tel AND telefone LIKE 'sem-numero-%' THEN v_tel ELSE telefone END
     WHERE id = v_lead_id;
  ELSE
    v_novo := true;
    INSERT INTO public.leads (nome, telefone, grupo_id, empresa_id, status, fonte, canal, wa_lid)
    VALUES (coalesce(nullif(btrim(p_nome), ''), CASE WHEN v_tem_tel THEN v_tel ELSE 'Cliente sem nome' END),
            CASE WHEN v_tem_tel THEN v_tel ELSE 'sem-numero-' || substr(md5(v_lid), 1, 10) END,
            v_inst.grupo_id, v_inst.empresa_id, 'represado', 'numero_mae', 'whatsapp', v_lid)
    RETURNING id INTO v_lead_id;
    SELECT corretor_id INTO v_corretor FROM public.leads WHERE id = v_lead_id;
    IF v_corretor IS NOT NULL THEN
      UPDATE public.leads SET status = 'distribuido', represado_em = NULL WHERE id = v_lead_id;
    END IF;
  END IF;

  -- A4: o cliente pediu para sair. Grava, cancela o pendente (gatilho) e confirma UMA vez.
  IF v_sair THEN
    SELECT coalesce(opt_out, false) INTO v_ja_optout FROM public.leads WHERE id = v_lead_id;
    UPDATE public.leads
       SET opt_out = true, ultimo_contato = now(),
           mia_estado = CASE WHEN mia_estado = 'atendendo' THEN 'passada' ELSE mia_estado END
     WHERE id = v_lead_id;
    INSERT INTO public.lead_mensagens (empresa_id, lead_id, direcao, texto, midia_tipo, midia_url, wa_msg_id, corretor_id, status, mia_processada)
    VALUES (v_inst.empresa_id, v_lead_id, 'entrada', v_texto, p_midia_tipo, v_midia_url, p_wa_msg_id, v_corretor, 'recebida', true)
    RETURNING id INTO v_msg;
    IF NOT v_ja_optout THEN
      INSERT INTO public.envios_whatsapp (instancia, numero, mensagem, tipo)
      VALUES (p_instancia, CASE WHEN v_tem_tel THEN v_tel ELSE v_lid END, c_confirma, 'texto')
      RETURNING id INTO v_envio;
      -- registro na conversa (status acompanha o envio pelo gatilho envio_whatsapp_refletir_status)
      INSERT INTO public.lead_mensagens (empresa_id, lead_id, direcao, texto, corretor_id, status, envio_id, mia_processada)
      VALUES (v_inst.empresa_id, v_lead_id, 'saida', c_confirma, NULL, 'enviada', v_envio, true);
    END IF;
    RETURN jsonb_build_object('lead_id', v_lead_id, 'corretor_id', v_corretor, 'mensagem_id', v_msg,
                              'lead_novo', v_novo, 'opt_out', true, 'confirmacao', NOT v_ja_optout);
  END IF;

  -- Mi.IA: lead novo sem dono, ou que ela já está atendendo, e a imobiliária deixou a Mi.IA atender agora.
  IF v_corretor IS NULL AND (v_novo OR v_mia_estado = 'atendendo') AND public.mia_pode_atender(v_inst.empresa_id) THEN
    v_mia := true;
    UPDATE public.leads SET mia_estado = 'atendendo', status = 'represado', represado_em = coalesce(represado_em, now()),
                            mia_ultima_em = coalesce(mia_ultima_em, now())
     WHERE id = v_lead_id;
  ELSIF v_mia_estado = 'atendendo' THEN
    PERFORM public.mia_passar_corretor(v_lead_id);   -- saiu do horário/plano: entrega agora
    SELECT corretor_id INTO v_corretor FROM public.leads WHERE id = v_lead_id;
  END IF;

  IF NOT v_mia AND v_corretor IS NULL THEN
    v_corretor := public.escolher_corretor_online(v_inst.grupo_id);
    IF v_corretor IS NOT NULL THEN
      UPDATE public.leads SET corretor_id = v_corretor, status = 'distribuido', represado_em = NULL
       WHERE id = v_lead_id;
    ELSE
      UPDATE public.leads SET status = 'represado', represado_em = coalesce(represado_em, now())
       WHERE id = v_lead_id;
      INSERT INTO public.notificacoes (destinatario_id, tipo, titulo, descricao, lead_id)
      SELECT p.id, 'conversa_sem_dono', 'Conversa sem corretor',
             'Chegou mensagem no número mãe e não há corretor online.', v_lead_id
        FROM public.perfis p
       WHERE p.empresa_id = v_inst.empresa_id
         AND (p.role = 'master' OR (p.role = 'gerente' AND p.grupo_id = v_inst.grupo_id))
         AND NOT EXISTS (SELECT 1 FROM public.notificacoes n
                          WHERE n.destinatario_id = p.id AND n.lead_id = v_lead_id
                            AND n.tipo = 'conversa_sem_dono' AND NOT n.lida);
    END IF;
  END IF;

  INSERT INTO public.lead_mensagens (empresa_id, lead_id, direcao, texto, midia_tipo, midia_url, wa_msg_id, corretor_id, status, mia_processada)
  VALUES (v_inst.empresa_id, v_lead_id, 'entrada', v_texto, p_midia_tipo, v_midia_url, p_wa_msg_id, v_corretor, 'recebida', NOT v_mia)
  RETURNING id INTO v_msg;

  UPDATE public.leads SET ultimo_contato = now() WHERE id = v_lead_id;

  IF v_mia THEN
    BEGIN  -- avisa o servidor para a Mi.IA responder; se falhar, a varredura de 3 minutos entrega ao corretor
      PERFORM net.http_post(
        url := public.config_valor('site_url', 'https://www.alexandrialeads.app') || '/api/public/mia-atender',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('mensagem_id', v_msg));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('lead_id', v_lead_id, 'corretor_id', v_corretor, 'mensagem_id', v_msg,
                            'lead_novo', v_novo, 'sem_dono', v_corretor IS NULL AND NOT v_mia, 'mia', v_mia);
END $function$;
-- Assinatura certa (9 argumentos, com p_lid). O 03-alexandria-numero-mae.sql de 19/10 usava 8 e dava erro.
revoke execute on function public.receber_mensagem_whatsapp(text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant  execute on function public.receber_mensagem_whatsapp(text,text,text,text,text,text,text,text,text) to service_role;

-- =====================================================================
-- N-c / B1) índice do gatilho que reflete o status do envio
-- N-d) privilégio sobrando em lead_mensagens
-- N-e / B4) travas de entrada (NOT VALID = só linhas novas, sem lock longo)
-- =====================================================================
create index if not exists lead_mensagens_envio_idx on public.lead_mensagens (envio_id) where envio_id is not null;
revoke update, delete, truncate, references, trigger on public.lead_mensagens from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lead_mensagens_midia_https' and conrelid = 'public.lead_mensagens'::regclass) then
    alter table public.lead_mensagens add constraint lead_mensagens_midia_https check (midia_url is null or midia_url ~ '^https://') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lead_mensagens_texto_tam' and conrelid = 'public.lead_mensagens'::regclass) then
    alter table public.lead_mensagens add constraint lead_mensagens_texto_tam check (texto is null or length(texto) <= 10000) not valid;
  end if;
end $$;

-- =====================================================================
-- A5) Limite de uso persistente (chat da página de vendas). Só o servidor (service_role) usa.
-- =====================================================================
create table if not exists public.limites_uso (
  chave text not null,
  janela timestamptz not null,
  contagem integer not null default 0,
  primary key (chave, janela)
);
alter table public.limites_uso enable row level security;
revoke all on public.limites_uso from public, anon, authenticated;
grant all on public.limites_uso to service_role;

create or replace function public.consumir_limite(p_chave text, p_max integer, p_janela_segundos integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_janela timestamptz; v_n integer;
begin
  if p_chave is null or btrim(p_chave) = '' or p_max is null or p_max < 1
     or p_janela_segundos is null or p_janela_segundos < 1 then
    return false;
  end if;
  v_janela := to_timestamp(floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos);
  insert into public.limites_uso (chave, janela, contagem) values (left(p_chave, 200), v_janela, 1)
  on conflict (chave, janela) do update set contagem = public.limites_uso.contagem + 1
  returning contagem into v_n;
  return v_n <= p_max;
end $$;
revoke all on function public.consumir_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_limite(text, integer, integer) to service_role;

-- =====================================================================
-- M7) Bucket privado dos documentos de proposta (+ policies, se faltarem)
-- =====================================================================
do $$ begin
  if to_regclass('storage.buckets') is null then
    raise notice 'M7: schema storage não encontrado; bucket não criado.';
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('documentos-propostas', 'documentos-propostas', false)
  on conflict (id) do update set public = false;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'docs_propostas_select') then
    create policy "docs_propostas_select" on storage.objects for select to authenticated using (
      bucket_id = 'documentos-propostas' and (
        public.pode_dar_suporte() or exists (
          select 1 from public.documentos_propostas d
           where d.storage_path = name and (
             ((select role from public.get_my_profile()) = 'corretor' and d.enviado_por = auth.uid()) or
             ((select role from public.get_my_profile()) <> 'corretor' and public.posso_acessar_proposta(d.proposta_id))))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'docs_propostas_insert') then
    create policy "docs_propostas_insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'documentos-propostas' and public.posso_acessar_proposta((storage.foldername(name))[1]::uuid));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'docs_propostas_delete') then
    create policy "docs_propostas_delete" on storage.objects for delete to authenticated using (
      bucket_id = 'documentos-propostas' and (
        public.pode_dar_suporte() or exists (
          select 1 from public.documentos_propostas d
           where d.storage_path = name and (select role from public.get_my_profile()) <> 'corretor'
             and public.posso_acessar_proposta(d.proposta_id))));
  end if;
end $$;

-- =====================================================================
-- M2) Corretor só pode estar num grupo da própria imobiliária
-- =====================================================================
create or replace function public.corretor_grupo_mesma_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  if new.grupo_id is null then return new; end if;
  select g.empresa_id into v_emp from public.grupos g where g.id = new.grupo_id;
  if v_emp is distinct from new.empresa_id then
    raise exception 'O grupo escolhido pertence a outra imobiliária.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.corretor_grupo_mesma_empresa() from public, anon, authenticated;
drop trigger if exists trg_zz_corretor_grupo_mesma_empresa on public.corretores;
create trigger trg_zz_corretor_grupo_mesma_empresa before insert or update of grupo_id, empresa_id on public.corretores
  for each row execute function public.corretor_grupo_mesma_empresa();

-- =====================================================================
-- M3) Lead "privado": só na própria empresa e sem apontar para corretor de outro
-- =====================================================================
drop policy if exists leads_write_master_gerente on public.leads;
create policy leads_write_master_gerente on public.leads for all to authenticated
using (
  CASE
    WHEN (visibilidade = 'privado'::text) THEN (
      criado_por = (SELECT auth.uid() AS uid)
      AND empresa_id = (SELECT public.get_minha_empresa_id())
      AND (corretor_id IS NULL OR corretor_id = (SELECT public.get_meu_corretor_id())))
    ELSE ((SELECT public.pode_dar_suporte() AS pode_dar_suporte) OR ((empresa_id = (SELECT public.get_minha_empresa_id() AS get_minha_empresa_id)) AND (((SELECT get_my_profile.role
       FROM public.get_my_profile() get_my_profile(role, grupo_id)) = 'master'::text) OR (((SELECT get_my_profile.role
       FROM public.get_my_profile() get_my_profile(role, grupo_id)) = 'gerente'::text) AND ((SELECT get_my_profile.grupo_id
       FROM public.get_my_profile() get_my_profile(role, grupo_id)) = grupo_id)))))
  END
)
with check (
  CASE
    WHEN (visibilidade = 'privado'::text) THEN (
      criado_por = (SELECT auth.uid() AS uid)
      AND empresa_id = (SELECT public.get_minha_empresa_id())
      AND (corretor_id IS NULL OR corretor_id = (SELECT public.get_meu_corretor_id())))
    ELSE ((SELECT public.pode_dar_suporte() AS pode_dar_suporte) OR ((empresa_id = (SELECT public.get_minha_empresa_id() AS get_minha_empresa_id)) AND (((SELECT get_my_profile.role
       FROM public.get_my_profile() get_my_profile(role, grupo_id)) = 'master'::text) OR (((SELECT get_my_profile.role
       FROM public.get_my_profile() get_my_profile(role, grupo_id)) = 'gerente'::text) AND ((SELECT get_my_profile.grupo_id
       FROM public.get_my_profile() get_my_profile(role, grupo_id)) = grupo_id)))))
  END
);

-- =====================================================================
-- Conferência final: se algo não ficou como deveria, a transação inteira volta.
-- =====================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.reatribuir_leads_parados(integer)', 'public.reatribuir_leads_sem_visualizacao()',
    'public.liberar_leads_inativos_6d()', 'public.liberar_leads_represados()',
    'public.receber_mensagem_whatsapp(text,text,text,text,text,text,text,text,text)',
    'public.consumir_limite(text,integer,integer)', 'public.config_valor(text,text)'] loop
    if has_function_privilege('anon', f::regprocedure, 'execute') or has_function_privilege('authenticated', f::regprocedure, 'execute') then
      raise exception 'Conferência falhou: % ainda executável por anon/authenticated', f;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.leads', 'telefone', 'select') then
    raise exception 'Conferência falhou: authenticated ainda lê leads.telefone';
  end if;
  if not has_column_privilege('authenticated', 'public.leads', 'nome', 'select') then
    raise exception 'Conferência falhou: authenticated perdeu leads.nome';
  end if;
  if exists (select 1 from pg_proc where oid = 'public.handle_new_user'::regproc and prosrc ~* '@(gmail|gmi|hotmail)\.com') then
    raise exception 'Conferência falhou: handle_new_user ainda tem e-mail fixo';
  end if;
end $$;


-- =====================================================================
-- DEPOIS DE RODAR (passos manuais, um de cada vez, no SQL Editor):
--
-- 1) Token do cron (o mesmo valor que você vai pôr em CRON_TOKEN na Vercel):
--      select public.definir_token_cron('COLE_AQUI_UM_TOKEN_LONGO_E_ALEATORIO');
--
-- 2) Endereço do site, se não for www.alexandrialeads.app:
--      update public.app_config set valor = 'https://SEU-DOMINIO', atualizado_em = now() where chave = 'site_url';
--
-- 3) Super admin: liga só para a SUA conta, pelo flag (troque o e-mail se for outro):
--      update public.perfis set super_admin = true
--       where id = (select id from auth.users where lower(email) = 'samuelrodrigodeoliveira@gmail.com');
--
-- 4) Tokens de webhook que o n8n usa para reativação ou e-mail e que não foram ajustados pelo nome:
--      update public.webhook_tokens set uso = 'reativacao' where id = 'ID_DO_TOKEN';
-- =====================================================================
